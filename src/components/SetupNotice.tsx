/** Shown instead of the sign-in form when Supabase env vars are missing. */
export default function SetupNotice() {
  return (
    <div className="card">
      <h2>Supabase is not configured</h2>
      <p className="muted small">
        This deployment has no Supabase project attached yet. Set the following
        environment variables and restart:
      </p>
      <ul className="small">
        <li>
          <code>NEXT_PUBLIC_SUPABASE_URL</code>
        </li>
        <li>
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
        </li>
      </ul>
      <p className="muted small">
        See <code>docs/DEPLOYMENT.md</code> for the full setup, including the SQL
        migrations in <code>supabase/migrations</code>.
      </p>
    </div>
  );
}
