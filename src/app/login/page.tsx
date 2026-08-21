import { Suspense } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import AuthForm from "@/components/AuthForm";
import SetupNotice from "@/components/SetupNotice";

export const metadata = { title: "Sign in — Lift Progression Tracker" };

export default function LoginPage() {
  return (
    <div className="auth-wrap">
      <h1>Lift Progression Tracker</h1>
      <div className="muted" style={{ marginBottom: 18 }}>
        V5 — your workouts, synced across every device.
      </div>
      {isSupabaseConfigured ? (
        <Suspense fallback={<div className="card muted">Loading…</div>}>
          <AuthForm />
        </Suspense>
      ) : (
        <SetupNotice />
      )}
    </div>
  );
}
