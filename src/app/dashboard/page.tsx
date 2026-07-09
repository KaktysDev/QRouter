import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardShell from "./DashboardShell";
import { Profile } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?login=1");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <DashboardShell
      email={user.email ?? ""}
      createdAt={user.created_at}
      initialProfile={(profile ?? {
        id: user.id,
        updated_at: null,
        full_name: null,
        company: null,
        stripe_customer_id: null,
        billing_setup_complete: false,
      }) as Profile}
    />
  );
}
