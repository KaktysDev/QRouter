"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Cpu, ShieldCheck, Zap } from "lucide-react";
import LoginModal from "@/components/LoginModal";
import { PROVIDERS } from "@/lib/providers";

function LandingInner() {
  const searchParams = useSearchParams();
  const [showLogin, setShowLogin] = useState(false);

  // Middleware bounces unauthenticated /dashboard hits here with ?login=1.
  useEffect(() => {
    if (searchParams.get("login") === "1" || searchParams.get("auth_error") === "1") {
      setShowLogin(true);
    }
  }, [searchParams]);

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="hero-aura pointer-events-none absolute inset-0" />
      <div className="hero-grid pointer-events-none absolute inset-0" />

      {/* Top bar */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-mono text-sm tracking-widest">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" />
          <span className="text-white">QCI</span>
          <span className="text-muted">/ OPENROUTER</span>
        </div>
        <button
          onClick={() => setShowLogin(true)}
          className="glass glass-hover rounded-lg px-4 py-2 text-sm text-soft"
        >
          Sign in
        </button>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 pt-20 pb-16 text-center">
        <div className="glass mb-8 rounded-full px-4 py-1.5 font-mono text-[11px] tracking-widest text-muted">
          UNIFIED HARDWARE ROUTING · v1.0
        </div>

        <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">
          One API. Every
          <br />
          <span className="text-accent">quantum backend.</span>
        </h1>

        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
          Authenticate once, deposit compute credits, upload quantum source, and
          route compiled workloads to any physical QPU or GPU-simulated edge
          target — with a single click.
        </p>

        <button
          onClick={() => setShowLogin(true)}
          className="btn-accent pulse-cta mt-10 flex items-center gap-2 rounded-xl px-8 py-4 text-base"
        >
          Launch Console
          <ArrowRight size={18} />
        </button>

        <div className="mt-4 font-mono text-[11px] tracking-wider text-muted">
          SECURE GOOGLE OAUTH · STRIPE-VAULTED BILLING
        </div>
      </section>

      {/* Feature strip */}
      <section className="relative z-10 mx-auto grid max-w-5xl gap-4 px-6 pb-16 sm:grid-cols-3">
        {[
          {
            icon: <Cpu size={18} className="text-accent" />,
            title: "Cross-vendor routing",
            body: "Qiskit, Forest, native gate sets — one transpiler, every target. No vendor SDK lock-in.",
          },
          {
            icon: <ShieldCheck size={18} className="text-accent" />,
            title: "Fixed-price quotes",
            body: "Upfront capture with a hard risk barrier. Cancel while queued for a 100% automated refund.",
          },
          {
            icon: <Zap size={18} className="text-accent" />,
            title: "GPU edge simulation",
            body: "Vultr Cloud GPU instances running cuQuantum + Qiskit Aer for near-zero-queue pre-flight runs.",
          },
        ].map((f) => (
          <div key={f.title} className="glass glass-hover rounded-2xl p-6 text-left">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-panel">
              {f.icon}
            </div>
            <div className="text-sm font-semibold text-white">{f.title}</div>
            <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
          </div>
        ))}
      </section>

      {/* Backend ticker */}
      <section className="relative z-10 border-t border-white/5 py-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-6 font-mono text-[11px] tracking-widest text-muted">
          <span className="text-soft">LIVE BACKENDS</span>
          {PROVIDERS.map((p) => (
            <span key={p.id} className="flex items-center gap-2">
              <span className="status-blink inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              {p.name.toUpperCase()}
            </span>
          ))}
        </div>
      </section>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </main>
  );
}

export default function LandingPage() {
  return (
    <Suspense>
      <LandingInner />
    </Suspense>
  );
}
