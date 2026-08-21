import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import SetupNotice from "@/components/SetupNotice";

// Auth-gated and per-user: never serve a prerendered copy of this page.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="auth-wrap">
        <h1>Lift Progression Tracker</h1>
        <SetupNotice />
      </div>
    );
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <AppShell userEmail={user.email ?? ""} />;
}
