"use client";

import { useState } from "react";
import { CreditCard, Loader2, Trash2 } from "lucide-react";
import { Profile } from "@/lib/types";

export default function SettingsTab({
  email,
  createdAt,
  profile,
  onBillingRemoved,
}: {
  email: string;
  createdAt: string;
  profile: Profile;
  onBillingRemoved: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function removeBilling() {
    setRemoving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/billing/remove", { method: "POST" });
      if (!res.ok) throw new Error("Failed to remove billing connection");
      onBillingRemoved();
      setMessage("Billing connection removed. Payment tokens deleted from the vault.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRemoving(false);
      setConfirming(false);
    }
  }

  const rows: [string, string][] = [
    ["Email", email],
    ["Full name", profile.full_name ?? "—"],
    ["Corporate profile", profile.company ?? "—"],
    ["Member since", new Date(createdAt).toLocaleDateString()],
    ["Stripe customer", profile.stripe_customer_id ?? "Not created yet"],
    ["Billing status", profile.billing_setup_complete ? "Active — card vaulted" : "Not configured"],
  ];

  return (
    <section className="max-w-2xl">
      <h2 className="text-xl font-semibold text-white">Settings</h2>
      <p className="mt-1 text-sm text-muted">Profile metadata and billing controls.</p>

      {/* Account Section */}
      <div className="glass mt-6 rounded-2xl p-6">
        <h3 className="text-sm font-semibold tracking-wide text-soft">ACCOUNT SECTION</h3>
        <dl className="mt-4 divide-y divide-white/5">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-6 py-3">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="truncate font-mono text-sm text-soft">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Billing danger zone */}
      <div className="glass mt-6 rounded-2xl border-red-500/20 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
            <CreditCard size={18} className="text-red-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-white">Remove Billing Connection</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Deletes all vaulted payment tokens from Stripe and disables task
              execution until a new card is saved. Historical transactions stay
              auditable.
            </p>

            {profile.billing_setup_complete ? (
              confirming ? (
                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={removeBilling}
                    disabled={removing}
                    className="flex items-center gap-2 rounded-lg bg-red-500/90 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                  >
                    {removing ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Trash2 size={13} />
                    )}
                    Yes, delete payment tokens
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="text-xs text-muted hover:text-soft"
                  >
                    Keep connection
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirming(true)}
                  className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10"
                >
                  <Trash2 size={13} />
                  Remove Billing Connection
                </button>
              )
            ) : (
              <p className="mt-4 font-mono text-xs text-muted">
                No active billing connection.
              </p>
            )}

            {message && <p className="mt-3 text-xs text-soft">{message}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
