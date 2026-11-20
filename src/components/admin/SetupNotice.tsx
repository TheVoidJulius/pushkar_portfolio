export function SetupNotice() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-xl rounded-3xl border border-line bg-bg-elevated p-8 shadow-lift">
        <p className="label-mono">Setup needed</p>
        <h1 className="mt-2 font-display text-[32px] leading-tight">Connect Supabase to use the dashboard</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          The public site is showing placeholder content because no database is connected yet. Add these
          environment variables (in Vercel → Project → Settings → Environment Variables, or in{" "}
          <code className="rounded bg-surface-2 px-1">.env.local</code> for local development) and redeploy:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-surface-2 p-4 font-mono text-[13px]">
          NEXT_PUBLIC_SUPABASE_URL=…{"\n"}NEXT_PUBLIC_SUPABASE_ANON_KEY=…
        </pre>
        <p className="mt-4 text-[14.5px] text-ink-3">Step-by-step instructions are in README.md → “Set up Supabase”.</p>
      </div>
    </main>
  );
}
