"use client";

import { Inbox, Mail, MailOpen, Plus, Reply, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { deleteRow, saveSingleton, setField } from "@/lib/admin/api";
import { ContactSchema, fieldErrors } from "@/lib/admin/schemas";
import type { ContactDetails } from "@/lib/types";
import { SOCIAL_PLATFORMS, SocialIcon } from "../../site/icons";
import { Button, Field, Input, PageHeader, Panel, SaveBar, Select, Textarea, Toggle, useConfirm, useFormState } from "../ui";

type Message = { id: string; name: string; email: string; subject: string; message: string; is_read: boolean; created_at: string };

const LABELS: Record<string, string> = {
  github: "GitHub",
  linkedin: "LinkedIn",
  x: "X / Twitter",
  dribbble: "Dribbble",
  instagram: "Instagram",
  youtube: "YouTube",
  website: "Website",
  other: "Other",
};

export function ContactEditor({ initial, messages: initialMessages }: { initial: ContactDetails; messages: Message[] }) {
  const f = useFormState(initial);
  const [saving, setSaving] = useState(false);
  const [messages, setMessages] = useState(initialMessages);
  const [openMsg, setOpenMsg] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const v = f.values;

  const save = async () => {
    const parsed = ContactSchema.safeParse(v);
    if (!parsed.success) {
      f.setErrors(fieldErrors(parsed.error));
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveSingleton("contact_details", parsed.data);
      const next = { ...v, ...(saved as Partial<ContactDetails>) };
      f.setSaved(next);
      f.setValues(next);
      toast.success("Contact details saved — they're live!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const setSocial = (i: number, patch: Partial<ContactDetails["socials"][number]>) =>
    f.set(
      "socials",
      v.socials.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    );

  const markRead = async (m: Message, is_read: boolean) => {
    setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, is_read } : x)));
    try {
      await setField("contact_messages", m.id, { is_read });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    }
  };

  const removeMsg = async (m: Message) => {
    const ok = await confirm({ title: "Delete message?", message: `The message from ${m.name} will be deleted permanently.`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try {
      await deleteRow("contact_messages", m.id);
      setMessages((ms) => ms.filter((x) => x.id !== m.id));
      toast.success("Message deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete");
    }
  };

  const unread = messages.filter((m) => !m.is_read).length;

  return (
    <>
      <PageHeader title="Contact" description="How people can reach you, and the messages they've sent through your contact form." />
      <div className="space-y-6">
        <Panel title="Contact details">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Email" htmlFor="ct-email" error={f.errors.email}>
              <Input id="ct-email" type="email" value={v.email} onChange={(e) => f.set("email", e.target.value)} invalid={!!f.errors.email} />
            </Field>
            <Field label="Phone (optional)" htmlFor="ct-phone">
              <Input id="ct-phone" value={v.phone} onChange={(e) => f.set("phone", e.target.value)} />
            </Field>
            <Field label="Location" htmlFor="ct-loc">
              <Input id="ct-loc" value={v.location} onChange={(e) => f.set("location", e.target.value)} />
            </Field>
          </div>
          <Field label="Availability note" htmlFor="ct-note" hint="e.g. “I reply within two working days.”" count={v.availability_note.length} max={300}>
            <Textarea id="ct-note" rows={2} value={v.availability_note} onChange={(e) => f.set("availability_note", e.target.value)} />
          </Field>
          <Toggle checked={v.form_enabled} onChange={(x) => f.set("form_enabled", x)} label="Show the contact form" description="Messages arrive in the inbox below." />
        </Panel>

        <Panel
          title="Social links"
          aside={
            <Button
              icon={<Plus className="size-4" />}
              className="!h-9"
              disabled={v.socials.length >= 12}
              onClick={() => f.set("socials", [...v.socials, { platform: "linkedin", label: "LinkedIn", url: "" }])}
            >
              Add link
            </Button>
          }
        >
          {v.socials.length === 0 && <p className="text-[14px] text-ink-3">No social links yet.</p>}
          {v.socials.map((s, i) => (
            <div key={i}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2">
                  <SocialIcon platform={s.platform} className="size-[18px]" />
                </span>
                <Select
                  value={s.platform}
                  onChange={(platform) => setSocial(i, { platform, label: s.label === LABELS[s.platform] || !s.label ? LABELS[platform] : s.label })}
                  options={SOCIAL_PLATFORMS.map((p) => ({ value: p, label: LABELS[p] }))}
                  className="!w-auto"
                />
                <Input aria-label="Label" value={s.label} onChange={(e) => setSocial(i, { label: e.target.value })} className="!w-36" />
                <Input aria-label="Link" type="url" value={s.url} onChange={(e) => setSocial(i, { url: e.target.value })} placeholder="https://" className="!w-auto min-w-[200px] flex-1" invalid={!!f.errors[`socials.${i}.url`]} />
                <Button variant="ghost" className="!size-9 !px-0" aria-label="Remove link" onClick={() => f.set("socials", v.socials.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              {(f.errors[`socials.${i}.url`] || f.errors[`socials.${i}.label`]) && (
                <p className="mt-1 ml-12 text-[13px] text-accent-text">{f.errors[`socials.${i}.url`] || f.errors[`socials.${i}.label`]}</p>
              )}
            </div>
          ))}
        </Panel>

        <SaveBar dirty={f.dirty} saving={saving} onSave={save} onReset={f.reset} viewHref="/#contact" />

        <div id="messages" className="scroll-mt-6">
          <Panel title={`Messages${unread ? ` · ${unread} new` : ""}`} description="Sent through the contact form on your site.">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center text-ink-3">
                <Inbox className="size-8" />
                <p className="mt-2 text-[14.5px]">No messages yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {messages.map((m) => (
                  <li key={m.id} className="py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMsg(openMsg === m.id ? null : m.id);
                        if (!m.is_read) void markRead(m, true);
                      }}
                      aria-expanded={openMsg === m.id}
                      className="flex w-full items-start gap-3 text-left"
                    >
                      <span className={`mt-2 size-2 shrink-0 rounded-full ${m.is_read ? "bg-transparent" : "bg-accent"}`} aria-label={m.is_read ? undefined : "Unread"} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[15px] ${m.is_read ? "" : "font-semibold"}`}>
                          {m.name} <span className="font-normal text-ink-3">· {m.email}</span>
                        </span>
                        <span className="block truncate text-[13.5px] text-ink-2">{m.subject || m.message}</span>
                      </span>
                      <time className="shrink-0 text-[12.5px] text-ink-3" dateTime={m.created_at}>
                        {new Date(m.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </time>
                    </button>
                    {openMsg === m.id && (
                      <div className="mt-3 ml-5 rounded-2xl bg-surface-2 p-4">
                        {m.subject && <p className="mb-2 font-medium">{m.subject}</p>}
                        <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap">{m.message}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <a
                            href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject || "your message"}`)}`}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[13.5px] font-medium text-bg"
                          >
                            <Reply className="size-4" /> Reply by email
                          </a>
                          <Button className="!h-9" icon={m.is_read ? <Mail className="size-4" /> : <MailOpen className="size-4" />} onClick={() => markRead(m, !m.is_read)}>
                            Mark as {m.is_read ? "unread" : "read"}
                          </Button>
                          <Button variant="ghost" className="!h-9" icon={<Trash2 className="size-4" />} onClick={() => removeMsg(m)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
      {dialog}
    </>
  );
}
