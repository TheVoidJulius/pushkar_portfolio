"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { saveSingleton } from "@/lib/admin/api";
import { AboutSchema, fieldErrors } from "@/lib/admin/schemas";
import type { AboutContent } from "@/lib/types";
import { Button, Field, ImageUpload, Input, PageHeader, Panel, SaveBar, TagInput, Textarea, useFormState } from "../ui";

export function AboutEditor({ initial }: { initial: AboutContent }) {
  const f = useFormState(initial);
  const [saving, setSaving] = useState(false);
  const v = f.values;

  const save = async () => {
    const parsed = AboutSchema.safeParse(v);
    if (!parsed.success) {
      f.setErrors(fieldErrors(parsed.error));
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveSingleton("about_content", parsed.data);
      const next = { ...v, ...(saved as Partial<AboutContent>) };
      f.setSaved(next);
      f.setValues(next);
      toast.success("About section saved — it's live!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const setHighlight = (i: number, key: "title" | "description", val: string) =>
    f.set(
      "highlights",
      v.highlights.map((h, j) => (j === i ? { ...h, [key]: val } : h)),
    );

  return (
    <>
      <PageHeader title="About" description="Tell visitors who you are beyond the work." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <Panel title="Your story">
            <Field label="Headline" htmlFor="headline" hint="Shown next to the section title" count={v.headline.length} max={200}>
              <Input id="headline" value={v.headline} onChange={(e) => f.set("headline", e.target.value)} />
            </Field>
            <Field label="Introduction" htmlFor="intro" hint="A warm opening line, shown large" count={v.introduction.length} max={800} error={f.errors.introduction}>
              <Textarea id="intro" rows={3} value={v.introduction} onChange={(e) => f.set("introduction", e.target.value)} />
            </Field>
            <Field label="Biography" htmlFor="bio" hint="Line breaks are kept." count={v.biography.length} max={4000} error={f.errors.biography}>
              <Textarea id="bio" rows={7} value={v.biography} onChange={(e) => f.set("biography", e.target.value)} />
            </Field>
            <Field label="Professional background" htmlFor="bg" hint="Education, past roles, where you've worked" count={v.background.length} max={2000}>
              <Textarea id="bg" rows={4} value={v.background} onChange={(e) => f.set("background", e.target.value)} />
            </Field>
            <Field label="Interests" htmlFor="interests" hint="Press Enter after each one">
              <TagInput id="interests" value={v.interests} onChange={(x) => f.set("interests", x)} placeholder="e.g. Film photography" />
            </Field>
          </Panel>

          <Panel
            title="Personal highlights"
            description="Short cards about things you're proud of (talks, open source, teaching…)."
            aside={
              <Button
                icon={<Plus className="size-4" />}
                className="!h-9"
                disabled={v.highlights.length >= 9}
                onClick={() => f.set("highlights", [...v.highlights, { title: "", description: "" }])}
              >
                Add highlight
              </Button>
            }
          >
            {v.highlights.length === 0 && <p className="text-[14px] text-ink-3">No highlights yet.</p>}
            {v.highlights.map((h, i) => (
              <div key={i} className="rounded-2xl border border-line p-4">
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-3">
                    <Input aria-label={`Highlight ${i + 1} title`} value={h.title} onChange={(e) => setHighlight(i, "title", e.target.value)} placeholder="Title" invalid={!!f.errors[`highlights.${i}.title`]} />
                    <Textarea aria-label={`Highlight ${i + 1} description`} rows={2} value={h.description} onChange={(e) => setHighlight(i, "description", e.target.value)} placeholder="One or two sentences" />
                  </div>
                  <Button variant="ghost" className="!size-9 !px-0" aria-label="Remove highlight" onClick={() => f.set("highlights", v.highlights.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {f.errors[`highlights.${i}.title`] && <p className="mt-1.5 text-[13px] text-accent-text">{f.errors[`highlights.${i}.title`]}</p>}
              </div>
            ))}
          </Panel>
        </div>
        <div>
          <Panel title="Photo">
            <ImageUpload value={v.image_url} onChange={(url) => f.set("image_url", url)} folder="about" label="About photo" aspect="aspect-[4/5]" />
          </Panel>
        </div>
      </div>
      <SaveBar dirty={f.dirty} saving={saving} onSave={save} onReset={f.reset} viewHref="/#about" />
    </>
  );
}
