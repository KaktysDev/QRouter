import Stripe from "stripe";

let stripeClient: Stripe | null = null;

/** Server-side Stripe client (lazy so builds never require the secret key). */
export function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return stripeClient;
}
