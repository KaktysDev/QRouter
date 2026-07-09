import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

/**
 * Service-role Supabase client — bypasses RLS. Server only.
 * Used for job state transitions, transaction writes, and result uploads.
 */
export function createAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return adminClient;
}
