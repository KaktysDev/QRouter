"use client";

import { ArrowRight, FileCode2, Cpu, Workflow } from "lucide-react";

const STEPS = [
  {
    icon: <FileCode2 size={22} className="text-accent" />,
    glow: "step-glow-1",
    tag: "01 · FILE CODE VECTOR",
    title: "Upload your source",
    body: "Drop any quantum source file — OpenQASM, Qiskit, Forest/Quil or raw JSON circuit descriptions. Assets are isolated in a private storage bucket.",
  },
  {
    icon: <Workflow size={22} className="text-accent" />,
    glow: "step-glow-2",
    tag: "02 · QCI TRANSPILER",
    title: "Transpile & quote",
    body: "The QCI Universal Transpiler estimates physical gate operations and maps them against live vendor fee tables into one fixed-price quote.",
  },
  {
    icon: <Cpu size={22} className="text-accent" />,
    glow: "step-glow-3",
    tag: "03 · CHOSEN QUANTUM CORE",
    title: "Route & execute",
    body: "Confirm the capture and your workload routes to the selected QPU or the Vultr GPU simulator. Cancel any time while queued for a full refund.",
  },
];

export default function GetStartedTab({ onNavigateSubmit }: { onNavigateSubmit: () => void }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-white">How routing works</h2>
      <p className="mt-1 text-sm text-muted">
        One pipeline from source file to physical backend. Three steps, one click each.
      </p>

      <div className="mt-8 grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {STEPS.map((step, i) => (
          <div key={step.tag} className="contents">
            <div className={`glass ${step.glow} step-glow rounded-2xl p-6`}>
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-panel">
                {step.icon}
              </div>
              <div className="font-mono text-[10px] tracking-widest text-accent">{step.tag}</div>
              <h3 className="mt-1.5 text-base font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
            </div>
            {i < STEPS.length - 1 && (
              <div className="hidden items-center lg:flex">
                <ArrowRight
                  size={20}
                  className={`arrow-flow ${i === 1 ? "arrow-flow-2" : ""} text-accent`}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-10 flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-panel p-6">
        <div>
          <div className="text-sm font-semibold text-white">Ready to route your first workload?</div>
          <p className="mt-1 text-sm text-muted">
            The Vultr GPU simulator is the cheapest way to validate a circuit before touching a QPU.
          </p>
        </div>
        <button
          onClick={onNavigateSubmit}
          className="btn-accent flex shrink-0 items-center gap-2 rounded-lg px-5 py-3 text-sm"
        >
          Submit Task
          <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}
