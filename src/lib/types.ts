export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export interface Profile {
  id: string;
  updated_at: string | null;
  full_name: string | null;
  company: string | null;
  stripe_customer_id: string | null;
  billing_setup_complete: boolean;
}

export interface Job {
  id: string;
  user_id: string;
  file_path: string;
  file_name: string | null;
  provider_target: string;
  status: JobStatus;
  estimated_queue_minutes: number | null;
  quoted_amount: number | null;
  qci_transpiler_fee: number | null;
  result_storage_path: string | null;
  processing_started_at: string | null;
  created_at: string;
}

export interface BillingTransaction {
  id: string;
  job_id: string;
  charge_id: string | null;
  amount: number;
  transaction_status: "captured" | "refunded" | "locked";
  updated_at: string;
}

/** Shape returned by GET /api/jobs — jobs plus simulation timing metadata. */
export interface JobsResponse {
  jobs: Job[];
  sim_seconds_per_minute: number;
}
