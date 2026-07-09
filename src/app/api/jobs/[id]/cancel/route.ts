import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { advanceJob } from "@/lib/simulator";
import { Job } from "@/lib/types";

/**
 * POST /api/jobs/:id/cancel — user cancellation window.
 *
 * Only honoured while the job is still 'queued'. The vendor ticket is
 * dropped, Stripe refunds 100% of the captured amount, and the record is
 * marked 'cancelled'. The job is advanced through the simulator first, so a
 * job that slipped into 'processing' is already locked and refuses with 409.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient();

  const { data } = await admin
    .from("jobs")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!data) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Sync with the vendor queue before deciding — lockout must win races.
  const job = await advanceJob(admin, data as Job);

  if (job.status !== "queued") {
    return NextResponse.json(
      { error: "locked", message: "Job already entered processing — non-refundable." },
      { status: 409 }
    );
  }

  // Drop the vendor ticket (conditional update guards concurrent transitions).
  const { data: cancelled } = await admin
    .from("jobs")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "queued")
    .select()
    .single();

  if (!cancelled) {
    return NextResponse.json({ error: "locked" }, { status: 409 });
  }

  // 100% automated Stripe refund of the captured quote.
  const { data: txn } = await admin
    .from("billing_transactions")
    .select("*")
    .eq("job_id", id)
    .eq("transaction_status", "captured")
    .single();

  if (txn?.charge_id) {
    const stripe = getStripe();
    await stripe.refunds.create({ payment_intent: txn.charge_id });
    await admin
      .from("billing_transactions")
      .update({ transaction_status: "refunded", updated_at: new Date().toISOString() })
      .eq("id", txn.id);
  }

  return NextResponse.json({ job: cancelled });
}
