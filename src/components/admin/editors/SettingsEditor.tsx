"use client";

import { Download, KeyRound, LogOut, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { saveSingleton, signOut } from "@/lib/admin/api";
import { exportContent, importContent, parseBackup } from "@/lib/admin/backup";
import { fieldErrors, SiteSchema } from "@/lib/admin/schemas";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PortfolioContent, SiteSettings } from "@/lib/types";
import { Button, Field, Input, PageHeader, Panel, SaveBar, Textarea, Toggle, useConfirm, useFormState } from "../ui";

export function SettingsEditor({ initial, content, email }: { initial: SiteSettings; content: PortfolioContent; email: string }) {
  const router = useRouter();
  const f = useFormState(initial);
  const v = f.values;
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pw, setPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirm, dialog } = useConfirm();

  const save = async () => {
    const parsed = SiteSchema.safeParse(v);
    if (!parsed.success) {
      f.setErrors(fieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      await saveSingleton("site_settings", parsed.data);
      f.setSaved(v);
      toast.success("Settings saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const backup = await parseBackup(file);
      const ok = await confirm({
        title: "Restore this backup?",
        message: (
          <>
            This replaces <strong>all</strong> your current content ({backup.projects.length} projects,{" "}
            {backup.experiences.length} experience entries, {backup.skillCategories.length} skill categories and every section&apos;s text). A copy of your
            current content will be downloaded first, just in case.
          </>
        ),
        confirmLabel: "Replace everything",
        danger: true,
      });
      if (!ok) return;
      exportContent(content); // safety copy
      setImporting(true);
      await importContent(backup);
      toast.success("Backup restored!");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const changePassword = async () => {
    if (pw.length < 10) return toast.error("Use at least 10 characters.");
    setPwBusy(true);
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ password: pw });
    setPwBusy(false);
    if (error) return toast.error(error.message);
    setPw("");
    toast.success("Password changed.");
  };

  return (
    <>
      <PageHeader title="Settings" description="Site-wide options, backups and your account." />
      <div className="space-y-6">
        <Panel title="Website">
          <Field label="Browser tab & search title" htmlFor="s-title" error={f.errors.site_title} count={v.site_title.length} max={120}>
            <Input id="s-title" value={v.site_title} onChange={(e) => f.set("site_title", e.target.value)} invalid={!!f.errors.site_title} />
          </Field>
          <Field label="Search & social description" htmlFor="s-meta" hint="Shown by Google and when your link is shared." count={v.meta_description.length} max={300}>
            <Textarea id="s-meta" rows={2} value={v.meta_description} onChange={(e) => f.set("meta_description", e.target.value)} />
          </Field>
          <Field label="Footer note" htmlFor="s-foot" count={v.footer_note.length} max={300}>
            <Input id="s-foot" value={v.footer_note} onChange={(e) => f.set("footer_note", e.target.value)} />
          </Field>
          <Toggle checked={v.show_assistant} onChange={(x) => f.set("show_assistant", x)} label={`Show ${content.assistant.name} on the site`} description="Turn off to hide the cat assistant completely." />
        </Panel>
        <SaveBar dirty={f.dirty} saving={saving} onSave={save} onReset={f.reset} />

        <Panel title="Backup" description="Download all your text content as a file, or restore from one. Images stay where they are.">
          <div className="flex flex-wrap gap-2">
            <Button icon={<Download className="size-4" />} onClick={() => exportContent(content)}>
              Download backup (.json)
            </Button>
            <Button icon={<Upload className="size-4" />} loading={importing} onClick={() => fileRef.current?.click()}>
              Restore from backup…
            </Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-label="Choose backup file" onChange={(e) => void onImport(e.target.files?.[0])} />
          </div>
        </Panel>

        <Panel title="Account" description={`Signed in as ${email}`}>
          <Field label="New password" htmlFor="s-pw" hint="At least 10 characters.">
            <div className="flex flex-wrap gap-2">
              <Input id="s-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="!w-auto min-w-[220px] flex-1" />
              <Button icon={<KeyRound className="size-4" />} loading={pwBusy} onClick={changePassword} disabled={!pw}>
                Change password
              </Button>
            </div>
          </Field>
          <Button
            variant="ghost"
            icon={<LogOut className="size-4" />}
            onClick={async () => {
              await signOut();
              router.replace("/admin/login");
              router.refresh();
            }}
          >
            Sign out
          </Button>
        </Panel>
      </div>
      {dialog}
    </>
  );
}
