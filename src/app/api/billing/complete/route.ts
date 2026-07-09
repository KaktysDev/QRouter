import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

/**
 * Called after Stripe Elements confirms the SetupIntent. Verifies the intent
 * server-side, pins the card as the customer's default payment method, and
 * flips billing_setup_complete → true.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const setupIntentId = body.setup_intent_id as string | undefined;
  if (!setupIntentId) {
    return NextResponse.json({ error: "Missing setup_intent_id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const stripe = getStripe();

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);

  if (
    setupIntent.status !== "succeeded" ||
    setupIntent.customer !== profile?.stripe_customer_id ||
    !setupIntent.payment_method
  ) {
    return NextResponse.json({ error: "Card setup not verified" }, { status: 400 });
  }

  const paymentMethodId =
    typeof setupIntent.payment_method === "string"
      ? setupIntent.payment_method
      : setupIntent.payment_method.id;

  await stripe.customers.update(profile.stripe_customer_id!, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  await admin
    .from("profiles")
    .update({
      billing_setup_complete: true,
      full_name: typeof body.full_name === "string" && body.full_name ? body.full_name : undefined,
      company: typeof body.company === "string" && body.company ? body.company : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}
