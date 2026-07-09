import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook listener (/api/stripe/webhook).
 *
 * The synchronous API routes already drive the happy path; this endpoint
 * keeps the database consistent when events happen outside the app —
 * dashboard-issued refunds, async setup confirmation, failed captures.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const payload = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  switch (event.type) {
    // Backup path: mark billing complete even if the client dropped off
    // before calling /api/billing/complete.
    case "setup_intent.succeeded": {
      const intent = event.data.object;
      const customerId = typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
      if (customerId) {
        if (typeof intent.payment_method === "string") {
          await stripe.customers
            .update(customerId, {
              invoice_settings: { default_payment_method: intent.payment_method },
            })
            .catch(() => {});
        }
        await admin
          .from("profiles")
          .update({ billing_setup_complete: true, updated_at: new Date().toISOString() })
          .eq("stripe_customer_id", customerId);
      }
      break;
    }

    // Refund issued anywhere (app or Stripe dashboard) → audit trail follows.
    case "charge.refunded": {
      const charge = event.data.object;
      const paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (paymentIntentId) {
        await admin
          .from("billing_transactions")
          .update({ transaction_status: "refunded", updated_at: new Date().toISOString() })
          .eq("charge_id", paymentIntentId)
          .neq("transaction_status", "locked");
      }
      break;
    }

    // A capture failed after the fact — flag the job so it never executes.
    case "payment_intent.payment_failed": {
      const intent = event.data.object;
      const { data: txn } = await admin
        .from("billing_transactions")
        .select("job_id")
        .eq("charge_id", intent.id)
        .single();
      if (txn) {
        await admin
          .from("jobs")
          .update({ status: "failed" })
          .eq("id", txn.job_id)
          .eq("status", "queued");
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
