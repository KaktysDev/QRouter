"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import BillingSetupForm from "@/components/BillingSetupForm";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingCard({
  defaultName,
  defaultCompany,
}: {
  defaultName: string;
  defaultCompany: string;
}) {
  const router = useRouter();
  const [skipping, setSkipping] = useState(false);

  /**
   * "Skip and fill this later" — records the bypass on the profile
   * (billing_setup_complete stays false) and routes straight to the console.
   * The billing gate will intercept the first Run Task.
   */
  async function skip() {
    setSkipping(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ billing_setup_complete: false, updated_at: new Date().toISOString() })
        .eq("id", user.id);
    }
    router.push("/dashboard");
  }

  return (
    <div className="glass relative z-10 w-full max-w-lg rounded-2xl p-8">
      <div className="mb-1 font-mono text-xs tracking-widest text-accent">
        STEP 1 OF 1 // BILLING INTAKE
      </div>
      <h1 className="text-2xl font-semibold text-white">Set up your compute profile</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Quantum hardware time is captured upfront per job. Vault a card now so
        quotes can be executed the moment you hit Run.
      </p>

      <div className="mt-6">
        <BillingSetupForm
          defaultName={defaultName}
          defaultCompany={defaultCompany}
          submitLabel="Save and enter console"
          onComplete={() => router.push("/dashboard")}
        />
      </div>

      {/* Blueprint-mandated escape hatch — bottom-right corner of the card */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={skip}
          disabled={skipping}
          className="text-xs text-muted underline-offset-4 transition-colors hover:text-soft hover:underline disabled:opacity-50"
        >
          {skipping ? "Entering console…" : "Skip and fill this later"}
        </button>
      </div>
    </div>
  );
}
