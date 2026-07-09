import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { buildQuote, getProvider, liveQueueMinutes } from "@/lib/providers";
import { advanceJobs, simSecondsPerMinute } from "@/lib/simulator";

/** GET /api/jobs — list the user's jobs, advancing live ones through the vendor queue. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient();
  const jobs = await advanceJobs(admin, user.id);

  return NextResponse.json({ jobs, sim_seconds_per_minute: simSecondsPerMinute() });
}

/**
 * POST /api/jobs — the Core Billing Verification Gate + Upfront Capture.
 *
 * 1. Rejects with 402 if billing_setup_complete is false (client shows the
 *    mandatory payment modal).
 * 2. Recomputes the quote server-side from the uploaded file's real size —
 *    the client preview is never trusted.
 * 3. Captures the full quote off-session on the vaulted card.
 * 4. Inserts the job as 'queued' and audits the charge in
 *    billing_transactions as 'captured'.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const filePath = body.file_path as string | undefined;
  const fileName = body.file_name as string | undefined;
  const providerId = body.provider_id as string | undefined;

  const provider = providerId ? getProvider(providerId) : undefined;
  if (!filePath || !provider) {
    return NextResponse.json({ error: "Missing file_path or unknown provider" }, { status: 400 });
  }
  // Files live under the uploader's uid/ prefix — enforced by storage RLS too.
  if (!filePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 403 });
  }

  const admin = createAdminClient();

  // ── 1. Billing Verification Gate ─────────────────────────────────────
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, billing_setup_complete")
    .eq("id", user.id)
    .single();

  if (!profile?.billing_setup_complete || !profile.stripe_customer_id) {
    return NextResponse.json(
      { error: "billing_required", message: "A validated payment profile is required before execution." },
      { status: 402 }
    );
  }

  // ── 2. Transpilation parsing & cost matrixing (server-authoritative) ──
  const { data: fileBlob, error: dlError } = await admin.storage
    .from("job-files")
    .download(filePath);
  if (dlError || !fileBlob) {
    return NextResponse.json({ error: "Uploaded file not found in storage" }, { status: 400 });
  }
  const fileBytes = (await fileBlob.arrayBuffer()).byteLength;
  const quote = buildQuote(provider, fileBytes);
  const queueMinutes = liveQueueMinutes(provider, Date.now());

  // ── 3. Upfront capture on the vaulted card ────────────────────────────
  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(profile.stripe_customer_id);
  if (customer.deleted) {
    return NextResponse.json({ error: "billing_required" }, { status: 402 });
  }

  let paymentMethod =
    typeof customer.invoice_settings?.default_payment_method === "string"
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings?.default_payment_method?.id;

  if (!paymentMethod) {
    const methods = await stripe.paymentMethods.list({
      customer: profile.stripe_customer_id,
      type: "card",
    });
    paymentMethod = methods.data[0]?.id;
  }
  if (!paymentMethod) {
    return NextResponse.json({ error: "billing_required" }, { status: 402 });
  }

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(quote.total * 100),
      currency: "usd",
      customer: profile.stripe_customer_id,
      payment_method: paymentMethod,
      off_session: true,
      confirm: true,
      description: `QCI job on ${provider.name} — ${quote.gates} gates`,
      metadata: { supabase_user_id: user.id, provider: provider.id },
    });
  } catch (err) {
    const message =
      err instanceof Stripe.errors.StripeError ? err.message : "Payment capture failed";
    return NextResponse.json({ error: "payment_failed", message }, { status: 402 });
  }

  // ── 4. Persist the queued job + captured transaction ─────────────────
  const { data: job, error: jobError } = await admin
    .from("jobs")
    .insert({
      user_id: user.id,
      file_path: filePath,
      file_name: fileName ?? filePath.split("/").pop(),
      provider_target: provider.id,
      status: "queued",
      estimated_queue_minutes: queueMinutes,
      quoted_amount: quote.total,
      qci_transpiler_fee: quote.transpilerFee,
    })
    .select()
    .single();

  if (jobError || !job) {
    // The card was charged but the job failed to persist — refund immediately.
    await stripe.refunds.create({ payment_intent: paymentIntent.id }).catch(() => {});
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }

  await admin.from("billing_transactions").insert({
    job_id: job.id,
    charge_id: paymentIntent.id,
    amount: quote.total,
    transaction_status: "captured",
  });

  return NextResponse.json({ job, quote });
}
