import { SupabaseClient } from "@supabase/supabase-js";
import { getProvider } from "@/lib/providers";
import { Job } from "@/lib/types";

/**
 * Vendor queue simulator.
 *
 * There is no public sandbox for physical QPU vendors, so external queue
 * behaviour is simulated deterministically from wall-clock time:
 *
 *   queued      — for estimated_queue_minutes × SIM_SECONDS_PER_MINUTE real
 *                 seconds after creation (cancellable, 100% refundable)
 *   processing  — for the provider's processingSeconds (locked, non-refundable;
 *                 the billing transaction flips to 'locked')
 *   completed   — result JSON is generated, uploaded to the private
 *                 'job-results' bucket, and unlocked for download
 *
 * `advanceJobs` is invoked lazily from the API routes that read or mutate
 * jobs, so state marches forward whenever the dashboard polls. To route to
 * real vendors, replace this module with real queue webhooks/polling — the
 * rest of the state machine (Stripe capture, refund, lockout) is unchanged.
 */

export function simSecondsPerMinute(): number {
  const v = Number(process.env.SIM_SECONDS_PER_MINUTE ?? "2");
  return Number.isFinite(v) && v > 0 ? v : 2;
}

function queuePhaseSeconds(job: Job): number {
  return (job.estimated_queue_minutes ?? 5) * simSecondsPerMinute();
}

/** Advance every live job for a user; returns the refreshed set. */
export async function advanceJobs(admin: SupabaseClient, userId: string): Promise<Job[]> {
  const { data, error } = await admin
    .from("jobs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const jobs = (data ?? []) as Job[];

  for (const job of jobs) {
    if (job.status === "queued" || job.status === "processing") {
      await advanceJob(admin, job);
    }
  }

  const { data: refreshed } = await admin
    .from("jobs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (refreshed ?? []) as Job[];
}

/** Advance a single job through the simulated vendor lifecycle. Mutates in place. */
export async function advanceJob(admin: SupabaseClient, job: Job): Promise<Job> {
  const now = Date.now();
  const createdAt = new Date(job.created_at).getTime();
  const provider = getProvider(job.provider_target);
  const processingSeconds = provider?.processingSeconds ?? 30;

  if (job.status === "queued") {
    const elapsed = (now - createdAt) / 1000;
    if (elapsed >= queuePhaseSeconds(job)) {
      // Vendor pulled the job off the queue → hard lockout begins.
      // Conditional update guards against racing a concurrent cancel.
      const { data } = await admin
        .from("jobs")
        .update({ status: "processing", processing_started_at: new Date().toISOString() })
        .eq("id", job.id)
        .eq("status", "queued")
        .select()
        .single();

      if (data) {
        Object.assign(job, data);
        await admin
          .from("billing_transactions")
          .update({ transaction_status: "locked", updated_at: new Date().toISOString() })
          .eq("job_id", job.id)
          .eq("transaction_status", "captured");
      }
    }
  }

  if (job.status === "processing" && job.processing_started_at) {
    const started = new Date(job.processing_started_at).getTime();
    if ((now - started) / 1000 >= processingSeconds) {
      const resultPath = await uploadResult(admin, job);
      const { data } = await admin
        .from("jobs")
        .update({ status: "completed", result_storage_path: resultPath })
        .eq("id", job.id)
        .eq("status", "processing")
        .select()
        .single();
      if (data) Object.assign(job, data);
    }
  }

  return job;
}

/** Generate a plausible measurement-counts payload and store it privately. */
async function uploadResult(admin: SupabaseClient, job: Job): Promise<string> {
  const provider = getProvider(job.provider_target);
  const shots = 1024;
  const nQubits = Math.min(5, provider?.qubits ?? 5);
  const nStates = Math.min(8, 2 ** nQubits);

  // Random distribution over a handful of basis states, summing to `shots`.
  const weights = Array.from({ length: nStates }, () => Math.random() ** 2);
  const totalW = weights.reduce((a, b) => a + b, 0);
  let remaining = shots;
  const counts: Record<string, number> = {};
  weights.forEach((w, i) => {
    const bits = i.toString(2).padStart(nQubits, "0");
    const c = i === nStates - 1 ? remaining : Math.round((w / totalW) * shots);
    counts[bits] = Math.max(0, Math.min(c, remaining));
    remaining -= counts[bits];
  });

  const payload = {
    job_id: job.id,
    backend: provider?.name ?? job.provider_target,
    status: "COMPLETED",
    shots,
    measurement_counts: counts,
    metadata: {
      qubits_used: nQubits,
      transpiled_by: "QCI Universal Transpiler v1.0",
      fidelity_class: provider?.fidelity ?? "unknown",
      execution_ms: Math.round(500 + Math.random() * 4500),
      submitted_at: job.created_at,
      completed_at: new Date().toISOString(),
    },
  };

  const path = `${job.user_id}/${job.id}/result.json`;
  const { error } = await admin.storage
    .from("job-results")
    .upload(path, JSON.stringify(payload, null, 2), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw error;
  return path;
}
