import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/jobs/:id/result — returns a short-lived signed URL for the
 * encrypted result payload once the job is 'completed'.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("jobs")
    .select("status, result_storage_path, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "completed" || !job.result_storage_path) {
    return NextResponse.json({ error: "Result not available yet" }, { status: 409 });
  }

  const { data: signed, error } = await admin.storage
    .from("job-results")
    .createSignedUrl(job.result_storage_path, 60, {
      download: `qci-result-${id}.json`,
    });

  if (error || !signed) {
    return NextResponse.json({ error: "Failed to sign result URL" }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
