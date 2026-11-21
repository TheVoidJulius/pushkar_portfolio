"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Loader2, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { ContactDetails } from "@/lib/types";
import { ContactSchema } from "@/lib/validation";
import { scrollToSection } from "@/lib/scroll";
import { MomoLine } from "../momo/MomoLine";
import { FadeUp } from "./Chrome";
import { SocialIcon } from "./icons";

type Errors = Partial<Record<"name" | "email" | "subject" | "message", string>>;

export function Contact({
  contact,
  name,
  footerNote,
  showAssistant,
}: {
  contact: ContactDetails;
  name: string;
  footerNote: string;
  showAssistant: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const year = new Date().getFullYear();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(contact.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.location.href = `mailto:${contact.email}`;
    }
  };

  return (
    <footer id="contact" aria-labelledby="contact-title" className="container-page pt-28 pb-24 md:pt-40">
      <div className="grid gap-14 md:grid-cols-[minmax(0,460px)_minmax(0,1fr)] md:gap-20">
        <div>
          {showAssistant && <MomoLine id="contact" size={108} className="-ml-2 mb-10" />}
          <FadeUp>
            <h2 id="contact-title">Let&apos;s build something together.</h2>
            {contact.availability_note && <p className="mt-3 text-ink-3">{contact.availability_note}</p>}
            <div className="mt-6 flex flex-wrap items-center gap-5">
              {contact.form_enabled ? (
                <button type="button" onClick={() => setFormOpen((v) => !v)} aria-expanded={formOpen} className="chrome-btn">
                  Contact
                </button>
              ) : (
                contact.email && (
                  <a href={`mailto:${contact.email}`} className="chrome-btn">
                    Contact
                  </a>
                )
              )}
              {contact.email && (
                <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 text-ink-3 transition hover:text-ink">
                  {copied ? <Check className="size-4 text-mint" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : contact.email}
                </button>
              )}
              <span className="sr-only" aria-live="polite">
                {copied ? "Email address copied to clipboard" : ""}
              </span>
            </div>
            {contact.socials.length > 0 && (
              <ul className="mt-6 flex flex-wrap gap-1.5">
                {contact.socials.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer me" className="chip gap-1.5 transition hover:bg-surface-3">
                      <SocialIcon platform={s.platform} className="size-3.5" />
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </FadeUp>
        </div>

        <AnimatePresence initial={false}>
          {contact.form_enabled && formOpen && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: 8, filter: "blur(6px)" }}
              transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
              className="self-end"
            >
              <ContactForm />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-28 flex flex-col gap-3 text-[13.5px] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {year} {name}
          {footerNote ? ` · ${footerNote}` : ""}
        </p>
        <button type="button" onClick={() => scrollToSection("hero")} className="font-mono text-[12.5px] transition hover:text-ink">
          <span className="opacity-50">$</span> back to top ↑
        </button>
      </div>
    </footer>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13.5px] text-ink-3">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-[13px] text-accent-text">
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border bg-surface px-3.5 py-2.5 text-[15px] text-ink outline-none transition placeholder:text-ink-3 focus:border-ink/40 aria-[invalid=true]:border-accent";

function ContactForm() {
  const [values, setValues] = useState({ name: "", email: "", subject: "", message: "", website: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [serverError, setServerError] = useState("");

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    if (errors[k as keyof Errors]) setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = ContactSchema.safeParse(values);
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      setErrors({ name: f.name?.[0], email: f.email?.[0], subject: f.subject?.[0], message: f.message?.[0] });
      const first = (["name", "email", "subject", "message"] as const).find((k) => f[k]);
      if (first) document.getElementById(`cf-${first}`)?.focus();
      return;
    }
    setStatus("sending");
    setServerError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fields) {
          setErrors(Object.fromEntries(Object.entries(data.fields).map(([k, v]) => [k, (v as string[])[0]])));
        }
        throw new Error(data.error || "Something went wrong.");
      }
      setStatus("sent");
      setValues({ name: "", email: "", subject: "", message: "", website: "" });
    } catch (err) {
      setStatus("error");
      setServerError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  if (status === "sent") {
    return (
      <div className="flex flex-col items-start rounded-[20px] bg-surface p-6" role="status">
        <span className="grid size-12 place-items-center rounded-full bg-mint text-bg">
          <Check className="size-6" />
        </span>
        <h3 className="mt-4">Message sent!</h3>
        <p className="mt-2 text-[15.5px] text-ink-2">Thanks for reaching out — you&apos;ll hear back soon.</p>
        <button type="button" onClick={() => setStatus("idle")} className="mt-6 text-[14.5px] font-medium underline underline-offset-4">
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="relative space-y-4" aria-label="Contact form">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cf-name" label="Your name" error={errors.name}>
          <input
            id="cf-name"
            autoComplete="name"
            value={values.name}
            onChange={set("name")}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "cf-name-error" : undefined}
            className={`${inputCls} border-transparent`}
            placeholder="Jamie Rivera"
          />
        </Field>
        <Field id="cf-email" label="Email" error={errors.email}>
          <input
            id="cf-email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={set("email")}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "cf-email-error" : undefined}
            className={`${inputCls} border-transparent`}
            placeholder="jamie@company.com"
          />
        </Field>
      </div>
      <Field id="cf-subject" label="Subject (optional)" error={errors.subject}>
        <input id="cf-subject" value={values.subject} onChange={set("subject")} className={`${inputCls} border-transparent`} placeholder="A project idea" />
      </Field>
      <Field id="cf-message" label="Message" error={errors.message}>
        <textarea
          id="cf-message"
          rows={5}
          value={values.message}
          onChange={set("message")}
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? "cf-message-error" : undefined}
          className={`${inputCls} resize-y border-transparent`}
          placeholder="Tell me a little about what you have in mind…"
        />
      </Field>
      {/* Honeypot: hidden from people, tempting for bots */}
      <div aria-hidden className="absolute -left-[9999px]">
        <label htmlFor="cf-website">Website</label>
        <input id="cf-website" tabIndex={-1} autoComplete="off" value={values.website} onChange={set("website")} />
      </div>
      {status === "error" && (
        <p role="alert" className="rounded-2xl bg-accent-soft px-4 py-3 text-[14px] text-accent-text">
          {serverError}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "sending"}
        className="chrome-btn w-full justify-center gap-2"
      >
        {status === "sending" ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Sending…
          </>
        ) : (
          <>
            Send message <Send className="size-4" />
          </>
        )}
      </button>
    </form>
  );
}
