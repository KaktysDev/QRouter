import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingCard from "./OnboardingCard";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?login=1");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, company, billing_setup_complete")
    .eq("id", user.id)
    .single();

  if (profile?.billing_setup_complete) redirect("/dashboard");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="hero-aura pointer-events-none absolute inset-0" />
      <OnboardingCard
        defaultName={profile?.full_name ?? user.user_metadata?.full_name ?? ""}
        defaultCompany={profile?.company ?? ""}
      />
    </main>
  );
}
