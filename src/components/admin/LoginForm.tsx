"use client";

import { ArrowLeft, Loader2, LogIn, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { MomoHead } from "../momo/MomoHead";
import type { Expression } from "../momo/three/MomoRenderer";
import { ThemeToggle } from "../site/ThemeToggle";
import { Field, Input } from "./ui";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError === "unauthorized" ? "That account isn't the site owner." : initialError ? "That link didn't work. Please try again." : null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [expression, setExpression] = useState<Expression>("idle");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Please enter a valid email address.");
      setExpression("confused");
      return;
    }
    setBusy(true);
    setExpression("thinking");
    const supabase = getSupabaseBrowserClient();
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/admin/auth/callback?next=/admin/reset`,
        });
        if (error) throw error;
        setNotice("If that address belongs to the owner, a reset link is on its way. Check your inbox.");
        setExpression("happy");
      } else {
        if (!password) throw new Error("Please enter your password.");
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "Email or password is incorrect." : error.message);
        setExpression("excited");
        router.replace(next);
        router.refresh();
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setExpression("confused");
    }
    setBusy(false);
  };

  return (
    <main className="relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="page-backdrop" aria-hidden />
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[400px]">
        <div className="mb-2 flex justify-center">
          <MomoHead expression={expression} className="size-40" />
        </div>
        <div className="rounded-[28px] border border-line bg-bg-elevated p-6 shadow-lift sm:p-8">
          <h1 className="font-display text-[30px] leading-tight tracking-tight">
            {mode === "login" ? "Welcome back" : "Reset password"}
          </h1>
          <p className="mt-1 text-[14.5px] text-ink-3">
            {mode === "login" ? "Sign in to edit your portfolio." : "We'll email you a link to choose a new password."}
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setExpression("curious")}
                required
              />
            </Field>
            {mode === "login" && (
              <Field label="Password" htmlFor="password">
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  // Momo politely closes her eyes while you type your password
                  onFocus={() => setExpression("sleeping")}
                  onBlur={() => setExpression("idle")}
                  required
                />
              </Field>
            )}
            {error && (
              <p role="alert" className="rounded-xl bg-accent-soft px-3.5 py-2.5 text-[14px] text-accent-text">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-xl bg-mint-soft px-3.5 py-2.5 text-[14px] text-ink">
                {notice}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-medium text-bg transition hover:opacity-90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : mode === "login" ? <LogIn className="size-4" /> : <Mail className="size-4" />}
              {mode === "login" ? "Sign in" : "Send reset link"}
            </button>
          </form>
          <div className="mt-5 flex justify-between text-[13.5px]">
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "forgot" : "login");
                setError(null);
                setNotice(null);
              }}
              className="text-ink-2 underline-offset-4 hover:text-ink hover:underline"
            >
              {mode === "login" ? "Forgot password?" : "Back to sign in"}
            </button>
            <Link href="/" className="inline-flex items-center gap-1 text-ink-3 hover:text-ink">
              <ArrowLeft className="size-3.5" /> View site
            </Link>
          </div>
        </div>
        <p className="mt-4 text-center text-[12.5px] text-ink-3">Private area · there is no public sign-up.</p>
      </div>
    </main>
  );
}
