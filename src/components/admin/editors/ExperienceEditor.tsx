"use client";

import { Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { deleteRow, removeImage, saveOrder, setField, upsertRow } from "@/lib/admin/api";
import { ExperienceSchema, fieldErrors } from "@/lib/admin/schemas";
import type { Experience } from "@/lib/types";
import { SortableList } from "../SortableList";
import { Button, EmptyState, Field, ImageUpload, Input, Modal, PageHeader, Panel, TagInput, Textarea, Toggle, useConfirm } from "../ui";

const fmt = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : "";

const blank = (order: number): Experience => ({
  id: "",
  company: "",
  role: "",
  location: "",
  company_url: null,
  start_date: "",
  end_date: null,
  is_current: false,
  description: "",
  achievements: [],
  technologies: [],
  logo_url: null,
  published: true,
  sort_order: order,
});

export function ExperienceEditor({ initial }: { initial: Experience[] }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<Experience | null>(null);
  const { confirm, dialog } = useConfirm();

  const commitOrder = async (list: Experience[]) => {
    try {
      await saveOrder("experiences", list.map((x) => x.id));
      toast.success("New order saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save order");
    }
  };

  const togglePublished = async (x: Experience) => {
    const value = !x.published;
    setItems((xs) => xs.map((i) => (i.id === x.id ? { ...i, published: value } : i)));
    try {
      await setField("experiences", x.id, { published: value });
      toast.success(value ? "Now visible on your site." : "Hidden from your site.");
    } catch (e) {
      setItems((xs) => xs.map((i) => (i.id === x.id ? { ...i, published: !value } : i)));
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    }
  };

  const remove = async (x: Experience) => {
    const ok = await confirm({
      title: "Delete this role?",
      message: (
        <>
          <strong>
            {x.role} at {x.company}
          </strong>{" "}
          will be removed permanently.
        </>
      ),
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRow("experiences", x.id);
      void removeImage(x.logo_url).catch(() => undefined);
      setItems((xs) => xs.filter((i) => i.id !== x.id));
      toast.success("Entry deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete");
    }
  };

  return (
    <>
      <PageHeader
        title="Experience"
        description="Your work history, shown as a timeline. Put the most recent role first."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing(blank(items.length))}>
            Add role
          </Button>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          title="No experience yet"
          description="Add the places you've worked."
          action={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing(blank(0))}>
              Add role
            </Button>
          }
        />
      ) : (
        <SortableList
          items={items}
          onReorder={setItems}
          onCommit={commitOrder}
          label={(x) => `${x.role} at ${x.company}`}
          render={(x) => (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {x.logo_url && <img src={x.logo_url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1 basis-[150px]">
                <p className="truncate text-[15px] font-semibold">{x.role}</p>
                <p className="truncate text-[13px] text-ink-3">
                  {x.company} · {fmt(x.start_date)} – {x.is_current ? "Now" : fmt(x.end_date)}
                </p>
              </div>
              {!x.published && <span className="hidden rounded-full bg-surface-2 px-2.5 py-1 text-[12px] text-ink-3 sm:inline">Hidden</span>}
              <div className="ml-auto flex">
                <Button variant="ghost" className="!size-9 !px-0" aria-label={x.published ? `Hide ${x.company}` : `Show ${x.company}`} title={x.published ? "Hide" : "Show"} onClick={() => togglePublished(x)}>
                  {x.published ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </Button>
                <Button variant="ghost" className="!size-9 !px-0" aria-label={`Edit ${x.company}`} title="Edit" onClick={() => setEditing(x)}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" className="!size-9 !px-0" aria-label={`Delete ${x.company}`} title="Delete" onClick={() => remove(x)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          )}
        />
      )}
      {editing && (
        <ExperienceForm
          key={editing.id || "new"}
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setItems((xs) => (xs.some((x) => x.id === saved.id) ? xs.map((x) => (x.id === saved.id ? saved : x)) : [...xs, saved]));
            setEditing(null);
          }}
        />
      )}
      {dialog}
    </>
  );
}

function ExperienceForm({ entry, onClose, onSaved }: { entry: Experience; onClose: () => void; onSaved: (x: Experience) => void }) {
  const [v, setV] = useState({ ...entry, company_url: entry.company_url ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [draftAchievement, setDraftAchievement] = useState("");
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const isNew = !entry.id;

  const save = async () => {
    const candidate = {
      ...v,
      id: v.id || undefined,
      end_date: v.is_current ? null : v.end_date || null,
      achievements: draftAchievement.trim() ? [...v.achievements, draftAchievement.trim()] : v.achievements,
    };
    const parsed = ExperienceSchema.safeParse(candidate);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      const saved = await upsertRow<Experience>("experiences", parsed.data as Experience);
      toast.success("Experience saved.");
      onSaved(saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isNew ? "Add role" : `Edit “${entry.role}”`} wide>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Job title" htmlFor="x-role" error={errors.role}>
              <Input id="x-role" value={v.role} onChange={(e) => set("role", e.target.value)} invalid={!!errors.role} autoFocus />
            </Field>
            <Field label="Company" htmlFor="x-company" error={errors.company}>
              <Input id="x-company" value={v.company} onChange={(e) => set("company", e.target.value)} invalid={!!errors.company} />
            </Field>
            <Field label="Location" htmlFor="x-loc">
              <Input id="x-loc" value={v.location} onChange={(e) => set("location", e.target.value)} placeholder="City or Remote" />
            </Field>
            <Field label="Company website" htmlFor="x-url" error={errors.company_url}>
              <Input id="x-url" type="url" value={v.company_url} onChange={(e) => set("company_url", e.target.value)} placeholder="https://" invalid={!!errors.company_url} />
            </Field>
            <Field label="Start date" htmlFor="x-start" error={errors.start_date}>
              <Input id="x-start" type="date" value={v.start_date} onChange={(e) => set("start_date", e.target.value)} invalid={!!errors.start_date} />
            </Field>
            <Field label="End date" htmlFor="x-end" error={errors.end_date}>
              <Input id="x-end" type="date" value={v.end_date ?? ""} disabled={v.is_current} onChange={(e) => set("end_date", e.target.value || null)} invalid={!!errors.end_date} />
            </Field>
          </div>
          <Toggle checked={v.is_current} onChange={(x) => set("is_current", x)} label="I work here now" description="Shows “Now” instead of an end date" />
          <Field label="Description" htmlFor="x-desc" count={v.description.length} max={2000}>
            <Textarea id="x-desc" rows={3} value={v.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field label="Key achievements" htmlFor="x-ach" hint="Press Enter to add each one">
            <ul className="mb-2 space-y-1.5">
              {v.achievements.map((a, i) => (
                <li key={i} className="flex items-start gap-2 rounded-xl bg-surface-2 py-2 pr-1.5 pl-3 text-[14px]">
                  <span className="flex-1">{a}</span>
                  <button type="button" aria-label="Remove achievement" onClick={() => set("achievements", v.achievements.filter((_, j) => j !== i))} className="grid size-6 place-items-center rounded-full text-ink-3 hover:text-ink">
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <Input
              id="x-ach"
              value={draftAchievement}
              onChange={(e) => setDraftAchievement(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draftAchievement.trim()) {
                  e.preventDefault();
                  set("achievements", [...v.achievements, draftAchievement.trim()]);
                  setDraftAchievement("");
                }
              }}
              placeholder="e.g. Led the redesign of…"
            />
          </Field>
          <Field label="Technologies" htmlFor="x-tech">
            <TagInput id="x-tech" value={v.technologies} onChange={(t) => set("technologies", t)} />
          </Field>
        </div>
        <div className="space-y-5">
          <ImageUpload value={v.logo_url} onChange={(url) => set("logo_url", url)} folder="logos" label="Company logo" aspect="aspect-square" hint="Square works best" />
          <Panel>
            <Toggle checked={v.published} onChange={(x) => set("published", x)} label="Visible" description="Show on your site" />
          </Panel>
        </div>
      </div>
      <div className="sticky bottom-0 -mx-5 mt-6 flex justify-end gap-2 border-t border-line bg-bg-elevated px-5 pt-4 sm:-mx-7 sm:px-7">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" loading={saving} onClick={save}>
          Save
        </Button>
      </div>
    </Modal>
  );
}
