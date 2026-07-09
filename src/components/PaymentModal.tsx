"use client";

import { X, ShieldAlert } from "lucide-react";
import BillingSetupForm from "@/components/BillingSetupForm";

/**
 * Mandatory payment gate — injected when a user who skipped onboarding hits
 * "Run Task". No computation proceeds without a validated payment profile.
 */
export default function PaymentModal({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Payment required"
    >
      <div className="glass relative w-full max-w-md rounded-2xl bg-panel p-8">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted transition-colors hover:text-ink"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15">
            <ShieldAlert size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Payment profile required</h2>
            <p className="text-xs text-muted">Execution halted by the billing verification gate.</p>
          </div>
        </div>

        <p className="mb-6 text-sm leading-relaxed text-muted">
          Quantum compute is captured upfront at the quoted price. Vault a card
          to release this task to the queue.
        </p>

        <BillingSetupForm
          collectProfile={false}
          submitLabel="Save card and continue"
          onComplete={onComplete}
        />
      </div>
    </div>
  );
}
