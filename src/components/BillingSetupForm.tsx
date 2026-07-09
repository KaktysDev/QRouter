"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { Appearance } from "@stripe/stripe-js";

/** Stripe Elements appearance tuned to the QCI obsidian/glass theme. */
const appearance: Appearance = {
  theme: "night",
  variables: {
    colorPrimary: "#FF6B00",
    colorBackground: "#121214",
    colorText: "#F8FAFC",
    colorTextSecondary: "#94A3B8",
    colorDanger: "#f87171",
    borderRadius: "10px",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  rules: {
    ".Input": { border: "1px solid rgba(255,255,255,0.08)" },
    ".Input:focus": { border: "1px solid #FF6B00", boxShadow: "none" },
  },
};

interface BillingSetupFormProps {
  /** Prefill values from the existing profile. */
  defaultName?: string;
  defaultCompany?: string;
  /** Show the name/company inputs (onboarding) or card-only (payment gate). */
  collectProfile?: boolean;
  submitLabel?: string;
  onComplete: () => void;
}

function InnerForm({
  defaultName,
  defaultCompany,
  collectProfile = true,
  submitLabel = "Save payment profile",
  onComplete,
}: BillingSetupFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [fullName, setFullName] = useState(defaultName ?? "");
  const [company, setCompany] = useState(defaultCompany ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: `${window.location.origin}/dashboard` },
    });

    if (confirmError || !setupIntent || setupIntent.status !== "succeeded") {
      setError(confirmError?.message ?? "Card verification failed. Try again.");
      setSubmitting(false);
      return;
    }

    const res = await fetch("/api/billing/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        setup_intent_id: setupIntent.id,
        full_name: fullName,
        company,
      }),
    });

    if (!res.ok) {
      setError("Card saved but profile update failed — retry.");
      setSubmitting(false);
      return;
    }

    onComplete();
  }

  const inputClass =
    "w-full rounded-lg border border-white/8 bg-panel px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-accent transition-colors";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {collectProfile && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium tracking-wide text-soft">
              Full name
            </label>
            <input
              className={inputClass}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ada Lovelace"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium tracking-wide text-soft">
              Corporate profile
            </label>
            <input
              className={inputClass}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Quantum Labs"
            />
          </div>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium tracking-wide text-soft">
          Payment card
        </label>
        <PaymentElement options={{ layout: "tabs" }} />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="btn-accent w-full rounded-lg px-4 py-3 text-sm"
      >
        {submitting ? "Verifying card…" : submitLabel}
      </button>
    </form>
  );
}

/**
 * Fetches a SetupIntent and mounts Stripe Elements around the card form.
 * Used by /onboarding and by the mandatory payment gate modal.
 */
export default function BillingSetupForm(props: BillingSetupFormProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const stripePromise = useMemo(
    () => loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!),
    []
  );

  useEffect(() => {
    fetch("/api/stripe/setup-intent", { method: "POST" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Setup failed");
        return res.json();
      })
      .then((data) => setClientSecret(data.client_secret))
      .catch((err) => setLoadError(err.message));
  }, []);

  if (loadError) {
    return <p className="text-sm text-red-400">Billing unavailable: {loadError}</p>;
  }

  if (!clientSecret) {
    return (
      <div className="flex items-center gap-3 py-8 text-sm text-muted">
        <span className="status-blink inline-block h-2 w-2 rounded-full bg-accent" />
        Initializing secure card intake…
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
      <InnerForm {...props} />
    </Elements>
  );
}
