"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { saveSingleton } from "@/lib/admin/api";
import { fieldErrors, ProfileSchema } from "@/lib/admin/schemas";
import type { Profile } from "@/lib/types";
import { Button, Field, ImageUpload, Input, PageHeader, Panel, SaveBar, Textarea, useFormState } from "../ui";

export function HeroEditor({ initial }: { initial: Profile }) {
  const f = useFormState(initial);
  const [saving, setSaving] = useState(false);
  const v = f.values;

  const save = async () => {
    const parsed = ProfileSchema.safeParse(v);
    if (!parsed.success) {
      f.setErrors(fieldErrors(parsed.error));
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveSingleton("profiles", parsed.data);
      const next = { ...v, ...(saved as Partial<Profile>) };
      f.setSaved(next);
      f.setValues(next);
      toast.success("Hero section saved — it's live!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const setStat = (i: number, key: "value" | "label", val: string) =>
    f.set(
      "stats",
      v.stats.map((s, j) => (j === i ? { ...s, [key]: val } : s)),
    );
  const moveStat = (i: number, d: -1 | 1) => {
    const s = [...v.stats];
    [s[i], s[i + d]] = [s[i + d], s[i]];
    f.set("stats", s);
  };

  return (
    <>
      <PageHeader title="Hero" description="The first thing visitors see: your name, what you do and a short introduction." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <Panel title="Who you are">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Name" htmlFor="name" error={f.errors.name}>
                <Input id="name" value={v.name} onChange={(e) => f.set("name", e.target.value)} invalid={!!f.errors.name} />
              </Field>
              <Field label="Professional title" htmlFor="designation" error={f.errors.designation} hint="e.g. Product Designer">
                <Input id="designation" value={v.designation} onChange={(e) => f.set("designation", e.target.value)} />
              </Field>
            </div>
            <Field label="Introduction" htmlFor="intro" hint="One memorable sentence. Shown in large italic text." count={v.introduction.length} max={400} error={f.errors.introduction}>
              <Textarea id="intro" rows={2} value={v.introduction} onChange={(e) => f.set("introduction", e.target.value)} />
            </Field>
            <Field label="Description" htmlFor="desc" hint="A short paragraph about your work." count={v.description.length} max={1200} error={f.errors.description}>
              <Textarea id="desc" rows={4} value={v.description} onChange={(e) => f.set("description", e.target.value)} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Location" htmlFor="loc" hint="Shown on your photo card">
                <Input id="loc" value={v.location} onChange={(e) => f.set("location", e.target.value)} />
              </Field>
              <Field label="Availability badge" htmlFor="avail" hint="Leave empty to hide the green badge">
                <Input id="avail" value={v.availability} onChange={(e) => f.set("availability", e.target.value)} />
              </Field>
            </div>
          </Panel>

          <Panel title="Buttons" description="Use #work, #skills, #experience, #about or #contact to jump to a section, or paste a full link.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Main button text" htmlFor="c1l" error={f.errors.cta_primary_label}>
                <Input id="c1l" value={v.cta_primary_label} onChange={(e) => f.set("cta_primary_label", e.target.value)} />
              </Field>
              <Field label="Main button link" htmlFor="c1h" error={f.errors.cta_primary_href}>
                <Input id="c1h" value={v.cta_primary_href} onChange={(e) => f.set("cta_primary_href", e.target.value)} invalid={!!f.errors.cta_primary_href} />
              </Field>
              <Field label="Second button text" htmlFor="c2l" error={f.errors.cta_secondary_label}>
                <Input id="c2l" value={v.cta_secondary_label} onChange={(e) => f.set("cta_secondary_label", e.target.value)} />
              </Field>
              <Field label="Second button link" htmlFor="c2h" error={f.errors.cta_secondary_href}>
                <Input id="c2h" value={v.cta_secondary_href} onChange={(e) => f.set("cta_secondary_href", e.target.value)} invalid={!!f.errors.cta_secondary_href} />
              </Field>
            </div>
          </Panel>

          <Panel
            title="Highlight numbers"
            description="Up to 6 quick stats under your introduction."
            aside={
              <Button
                icon={<Plus className="size-4" />}
                onClick={() => f.set("stats", [...v.stats, { value: "", label: "" }])}
                disabled={v.stats.length >= 6}
                className="!h-9"
              >
                Add stat
              </Button>
            }
          >
            {v.stats.length === 0 && <p className="text-[14px] text-ink-3">No stats yet.</p>}
            <ul className="space-y-2">
              {v.stats.map((s, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Input aria-label={`Stat ${i + 1} number`} value={s.value} onChange={(e) => setStat(i, "value", e.target.value)} className="!w-24" placeholder="8+" maxLength={12} />
                  <Input aria-label={`Stat ${i + 1} label`} value={s.label} onChange={(e) => setStat(i, "label", e.target.value)} placeholder="years of experience" maxLength={60} />
                  <Button variant="ghost" className="!size-9 !px-0" aria-label="Move up" disabled={i === 0} onClick={() => moveStat(i, -1)}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button variant="ghost" className="!size-9 !px-0" aria-label="Move down" disabled={i === v.stats.length - 1} onClick={() => moveStat(i, 1)}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button variant="ghost" className="!size-9 !px-0" aria-label="Remove stat" onClick={() => f.set("stats", v.stats.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
            {Object.keys(f.errors).some((k) => k.startsWith("stats")) && (
              <p className="text-[13px] text-accent-text">Each stat needs a number and a label.</p>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Profile photo">
            <ImageUpload value={v.profile_image_url} onChange={(url) => f.set("profile_image_url", url)} folder="profile" label="Photo" aspect="aspect-[4/5]" />
          </Panel>
        </div>
      </div>
      <SaveBar dirty={f.dirty} saving={saving} onSave={save} onReset={f.reset} viewHref="/#hero" />
    </>
  );
}
