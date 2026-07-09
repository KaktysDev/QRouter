"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Lock, XCircle } from "lucide-react";
import { getProvider } from "@/lib/providers";
import { Job, JobsResponse } from "@/lib/types";

const usd = (n: number | null) => (n == null ? "—" : `$${Number(n).toFixed(2)}`);

const STATUS_STYLE: Record<Job["status"], string> = {
  queued: "bg-accent/15 text-accent status-blink",
  processing: "bg-sky-500/15 text-sky-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  failed: "bg-red-500/15 text-red-400",
  cancelled: "bg-white/8 text-muted",
};

function queueRemaining(job: Job, simSecondsPerMinute: number): string {
  const queueSeconds = (job.estimated_queue_minutes ?? 0) * simSecondsPerMinute;
  const elapsed = (Date.now() - new Date(job.created_at).getTime()) / 1000;
  const left = Math.max(0, queueSeconds - elapsed);
  // Report remaining wait in "vendor minutes" so the UI matches the quote.
  const vendorMinutes = Math.ceil(left / simSecondsPerMinute);
  return vendorMinutes <= 0 ? "<1 min" : `~${vendorMinutes} min`;
}

export default function TasksTab() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [simScale, setSimScale] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [busyJob, setBusyJob] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) throw new Error("Failed to load jobs");
      const data: JobsResponse = await res.json();
      setJobs(data.jobs);
      setSimScale(data.sim_seconds_per_minute);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    }
  }, []);

  // Live tracking loop — the GET also advances the vendor queue simulation.
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function cancelJob(id: string) {
    setBusyJob(id);
    try {
      const res = await fetch(`/api/jobs/${id}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Cancellation refused — job already locked.");
      }
      await refresh();
    } finally {
      setBusyJob(null);
    }
  }

  async function downloadResult(id: string) {
    setBusyJob(id);
    try {
      const res = await fetch(`/api/jobs/${id}/result`);
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, "_blank");
      } else {
        setError(data.error ?? "Result unavailable");
      }
    } finally {
      setBusyJob(null);
    }
  }

  return (
    <section>
      <h2 className="text-xl font-semibold text-white">Task tracking</h2>
      <p className="mt-1 text-sm text-muted">
        Live queue telemetry. Jobs are refundable until the vendor begins processing.
      </p>

      {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

      {jobs === null ? (
        <div className="mt-10 flex items-center gap-3 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> Syncing vendor queues…
        </div>
      ) : jobs.length === 0 ? (
        <div className="glass mt-6 rounded-2xl p-10 text-center">
          <div className="text-sm font-medium text-soft">No tasks submitted yet</div>
          <p className="mt-1 text-sm text-muted">
            Route your first workload from the Submit Task tab.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {jobs.map((job) => {
            const provider = getProvider(job.provider_target);
            return (
              <div
                key={job.id}
                className="glass rounded-2xl p-5 sm:flex sm:items-center sm:justify-between sm:gap-6"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted">
                      {job.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 font-mono text-[10px] tracking-widest ${STATUS_STYLE[job.status]}`}
                    >
                      {job.status.toUpperCase()}
                    </span>
                    {job.status === "processing" && (
                      <span className="flex items-center gap-1 font-mono text-[10px] tracking-wider text-muted">
                        <Lock size={10} /> NON-REFUNDABLE
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 truncate text-sm font-medium text-white">
                    {job.file_name ?? job.file_path.split("/").pop()}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-muted">
                    {provider?.name ?? job.provider_target} · captured {usd(job.quoted_amount)}
                    {job.status === "queued" && (
                      <> · queue {queueRemaining(job, simScale)} remaining</>
                    )}
                    {job.status === "cancelled" && <> · 100% refunded</>}
                  </div>
                </div>

                <div className="mt-4 flex shrink-0 items-center gap-2 sm:mt-0">
                  {/* Cancel window exists ONLY while queued — wiped on processing */}
                  {job.status === "queued" && (
                    <button
                      onClick={() => cancelJob(job.id)}
                      disabled={busyJob === job.id}
                      className="glass glass-hover flex items-center gap-2 rounded-lg px-4 py-2 text-xs text-red-400 disabled:opacity-50"
                    >
                      {busyJob === job.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <XCircle size={13} />
                      )}
                      Cancel Job
                    </button>
                  )}
                  {job.status === "processing" && (
                    <span className="flex items-center gap-2 font-mono text-xs text-sky-400">
                      <Loader2 size={13} className="animate-spin" />
                      EXECUTING ON {provider?.vendor.toUpperCase() ?? "VENDOR"}
                    </span>
                  )}
                  {job.status === "completed" && (
                    <button
                      onClick={() => downloadResult(job.id)}
                      disabled={busyJob === job.id}
                      className="btn-accent flex items-center gap-2 rounded-lg px-4 py-2 text-xs disabled:opacity-50"
                    >
                      {busyJob === job.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Download size={13} />
                      )}
                      Fetch Result
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
