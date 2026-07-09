import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

/**
 * "Remove Billing Connection" — detaches every vaulted payment method from
 * the Stripe customer and resets billing_setup_complete. The customer record
 * itself is kept so historical charges stay auditable.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient();
  const stripe = getStripe();

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (profile?.stripe_customer_id) {
    const methods = await stripe.paymentMethods.list({
      customer: profile.stripe_customer_id,
      type: "card",
    });
    for (const pm of methods.data) {
      await stripe.paymentMethods.detach(pm.id);
    }
    await stripe.customers.update(profile.stripe_customer_id, {
      invoice_settings: { default_payment_method: "" },
    });
  }

  await admin
    .from("profiles")
    .update({ billing_setup_complete: false, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}
