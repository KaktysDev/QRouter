"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileCode2, UploadCloud, X, Clock, Cpu, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import PaymentModal from "@/components/PaymentModal";
import {
  PROVIDERS,
  buildQuote,
  liveQueueMinutes,
  TRANSPILER_FEE,
} from "@/lib/providers";

const usd = (n: number) => `$${n.toFixed(2)}`;

export default function SubmitTaskTab({
  userId,
  billingComplete,
  onBillingComplete,
  onSubmitted,
}: {
  userId: string;
  billingComplete: boolean;
  onBillingComplete: () => void;
  onSubmitted: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [providerId, setProviderId] = useState<string>("vultr_simulator");
  const [now, setNow] = useState(() => Date.now());
  const [showGate, setShowGate] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Refresh the "live" queue estimates every 15s so the matrix breathes.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  }, []);

  const provider = PROVIDERS.find((p) => p.id === providerId)!;
  const quote = file ? buildQuote(provider, file.size) : null;

  async function runTask() {
    if (!file) return;
    setError(null);

    // Core Billing Verification Gate — client-side fast path. The server
    // re-checks and returns 402 regardless, so this can't be bypassed.
    if (!billingComplete) {
      setShowGate(true);
      return;
    }

    setRunning(true);
    try {
      // 1. Upload the source file into the caller's private folder.
      const supabase = createClient();
      const path = `${userId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("job-files")
        .upload(path, file, { contentType: file.type || "text/plain" });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      // 2. Create the job — server recomputes the quote and captures payment.
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: path, file_name: file.name, provider_id: providerId }),
      });
      const data = await res.json();

      if (res.status === 402) {
        setShowGate(true);
        return;
      }
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Job submission failed");

      setFile(null);
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section>
      <h2 className="text-xl font-semibold text-white">Workspace canvas</h2>
      <p className="mt-1 text-sm text-muted">
        Upload quantum source, pick a core, confirm the fixed-price capture.
      </p>

      {/* ── Drag & drop landing target ─────────────────────────────────── */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragOver
            ? "border-accent bg-accent/5"
            : "border-white/10 bg-white/[0.02] hover:border-white/20"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".qasm,.qs,.py,.quil,.json,.txt"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="flex items-center gap-3">
            <FileCode2 size={20} className="text-accent" />
            <div className="text-left">
              <div className="text-sm font-medium text-white">{file.name}</div>
              <div className="font-mono text-xs text-muted">
                {(file.size / 1024).toFixed(1)} KB · est. {buildQuote(provider, file.size).gates} gate ops
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
              }}
              className="ml-2 text-muted hover:text-ink"
              aria-label="Remove file"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <>
            <UploadCloud size={28} className="mb-3 text-muted" />
            <div className="text-sm font-medium text-soft">
              Drop your quantum source file here
            </div>
            <div className="mt-1 font-mono text-xs text-muted">
              .qasm · .py · .quil · .json — or click to browse
            </div>
          </>
        )}
      </div>

      {/* ── Hardware provider matrix ───────────────────────────────────── */}
      <h3 className="mt-10 text-sm font-semibold tracking-wide text-soft">
        HARDWARE ROUTING MATRIX
      </h3>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {PROVIDERS.map((p) => {
          const selected = p.id === providerId;
          const q = liveQueueMinutes(p, now);
          const est = file ? buildQuote(p, file.size) : null;
          return (
            <button
              key={p.id}
              onClick={() => setProviderId(p.id)}
              className={`glass glass-hover rounded-2xl p-5 text-left transition-colors ${
                selected ? "border-accent/70 bg-accent/5" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{p.name}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] tracking-wider ${
                        p.kind === "qpu"
                          ? "bg-white/8 text-soft"
                          : "bg-accent/15 text-accent"
                      }`}
                    >
                      {p.kind === "qpu" ? "PHYSICAL QPU" : "GPU SIM"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted">{p.architecture}</div>
                </div>
                <div
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
                    selected ? "border-accent bg-accent" : "border-white/20"
                  }`}
                />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-xs">
                <div>
                  <div className="text-muted">QUBITS</div>
                  <div className="mt-0.5 flex items-center gap-1 text-soft">
                    <Cpu size={12} className="text-accent" /> {p.qubits}
                  </div>
                </div>
                <div>
                  <div className="text-muted">LIVE QUEUE</div>
                  <div className="mt-0.5 flex items-center gap-1 text-soft">
                    <Clock size={12} className="text-accent" /> ~{q} min
                  </div>
                </div>
                <div>
                  <div className="text-muted">EST. COST</div>
                  <div className="mt-0.5 text-soft">
                    {est ? usd(est.providerCost) : `${usd(p.baseFee)}+`}
                  </div>
                </div>
              </div>

              <div className="mt-3 text-xs leading-relaxed text-muted">{p.description}</div>
              <div className="mt-2 font-mono text-[10px] text-muted">
                {p.fidelity} · base {usd(p.baseFee)} + {usd(p.perGate)}/gate
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Quote + Run Task ───────────────────────────────────────────── */}
      <div className="glass mt-8 rounded-2xl p-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-[220px]">
            <div className="font-mono text-[10px] tracking-widest text-muted">
              FIXED PRICE QUOTE
            </div>
            {quote ? (
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between gap-8 text-muted">
                  <span>{provider.name} infrastructure</span>
                  <span className="font-mono text-soft">{usd(quote.providerCost)}</span>
                </div>
                <div className="flex justify-between gap-8 text-muted">
                  <span>Universal Quantum Transpiler Fee</span>
                  <span className="font-mono text-soft">{usd(quote.transpilerFee)}</span>
                </div>
                <div className="mt-2 flex justify-between gap-8 border-t border-white/8 pt-2 text-white">
                  <span className="font-semibold">Total captured on run</span>
                  <span className="font-mono text-lg font-semibold text-accent">
                    {usd(quote.total)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Upload a file to generate a quote. Transpiler fee is a flat{" "}
                {usd(TRANSPILER_FEE)}.
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              onClick={runTask}
              disabled={!file || running}
              className="btn-accent flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm"
            >
              {running && <Loader2 size={16} className="animate-spin" />}
              {running ? "Capturing & queuing…" : "Run Task"}
            </button>
            <div className="max-w-[260px] text-right text-[11px] leading-relaxed text-muted">
              Full quote is captured upfront. 100% refundable until the vendor
              starts processing.
            </div>
          </div>
        </div>
        {error && <p className="mt-4 text-xs text-red-400">{error}</p>}
      </div>

      {showGate && (
        <PaymentModal
          onClose={() => setShowGate(false)}
          onComplete={() => {
            setShowGate(false);
            onBillingComplete();
          }}
        />
      )}
    </section>
  );
}
