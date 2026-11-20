"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Field, Input } from "./ui";

export function ResetPasswordForm({ email }: { email: string }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 10) return setError("Use at least 10 characters.");
    if (pw !== pw2) return setError("The two passwords don't match.");
    setBusy(true);
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace("/admin");
    router.refresh();
  };

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-[400px] space-y-4 rounded-[28px] border border-line bg-bg-elevated p-7 shadow-lift">
        <h1 className="font-display text-[28px] leading-tight">Choose a new password</h1>
        <p className="text-[14px] text-ink-3">For {email}</p>
        <Field label="New password" htmlFor="pw" hint="At least 10 characters.">
          <Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <Field label="Repeat password" htmlFor="pw2">
          <Input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="rounded-xl bg-accent-soft px-3.5 py-2.5 text-[14px] text-accent-text">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink text-bg disabled:opacity-60">
          {busy && <Loader2 className="size-4 animate-spin" />} Save password
        </button>
      </form>
    </main>
  );
}
