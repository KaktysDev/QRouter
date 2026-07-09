"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/lib/types";
import GetStartedTab from "./tabs/GetStartedTab";
import SubmitTaskTab from "./tabs/SubmitTaskTab";
import TasksTab from "./tabs/TasksTab";
import SettingsTab from "./tabs/SettingsTab";

type TabId = "get-started" | "submit" | "tasks" | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "get-started", label: "Get Started" },
  { id: "submit", label: "Submit Task" },
  { id: "tasks", label: "Tasks" },
  { id: "settings", label: "Settings" },
];

export default function DashboardShell({
  email,
  createdAt,
  initialProfile,
}: {
  email: string;
  createdAt: string;
  initialProfile: Profile;
}) {
  const router = useRouter();
  const [active, setActive] = useState<TabId>("get-started");
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [mobileOpen, setMobileOpen] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const activeLabel = TABS.find((t) => t.id === active)?.label;

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 pb-16 sm:px-6">
      {/* Header */}
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2 font-mono text-sm tracking-widest">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" />
          <span className="text-white">QCI</span>
          <span className="hidden text-muted sm:inline">/ CONSOLE</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-xs text-muted sm:inline">{email}</span>
          <button
            onClick={signOut}
            className="glass glass-hover flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-soft"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </header>

      {/* Global glassmorphic tab navigation — bar on desktop, dropdown on mobile */}
      <nav className="glass rounded-xl p-1.5">
        <div className="hidden gap-1 sm:flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                active === tab.id
                  ? "bg-accent text-white"
                  : "text-muted hover:bg-white/5 hover:text-soft"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative sm:hidden">
          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white"
          >
            {activeLabel}
            <ChevronDown
              size={16}
              className={`transition-transform ${mobileOpen ? "rotate-180" : ""}`}
            />
          </button>
          {mobileOpen && (
            <div className="glass absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-lg bg-panel">
              {TABS.filter((t) => t.id !== active).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActive(tab.id);
                    setMobileOpen(false);
                  }}
                  className="block w-full px-4 py-3 text-left text-sm text-soft hover:bg-white/5"
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Active view */}
      <div className="mt-8">
        {active === "get-started" && <GetStartedTab onNavigateSubmit={() => setActive("submit")} />}
        {active === "submit" && (
          <SubmitTaskTab
            userId={profile.id}
            billingComplete={profile.billing_setup_complete}
            onBillingComplete={() =>
              setProfile((p) => ({ ...p, billing_setup_complete: true }))
            }
            onSubmitted={() => setActive("tasks")}
          />
        )}
        {active === "tasks" && <TasksTab />}
        {active === "settings" && (
          <SettingsTab
            email={email}
            createdAt={createdAt}
            profile={profile}
            onBillingRemoved={() =>
              setProfile((p) => ({ ...p, billing_setup_complete: false }))
            }
          />
        )}
      </div>
    </div>
  );
}
