"use client";

import { Eye, EyeOff, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { deleteRow, removeImage, saveOrder, setField, upsertRow } from "@/lib/admin/api";
import { fieldErrors, ProjectSchema } from "@/lib/admin/schemas";
import type { Project } from "@/lib/types";
import { SortableList } from "../SortableList";
import { Button, EmptyState, Field, ImageUpload, Input, Modal, PageHeader, Panel, TagInput, Textarea, Toggle, useConfirm } from "../ui";

const blank = (order: number): Project => ({
  id: "",
  title: "",
  summary: "",
  description: "",
  category: "",
  year: String(new Date().getFullYear()),
  highlight: "",
  image_url: null,
  technologies: [],
  github_url: null,
  demo_url: null,
  featured: false,
  published: false,
  sort_order: order,
});

export function ProjectsEditor({ initial }: { initial: Project[] }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<Project | null>(null);
  const { confirm, dialog } = useConfirm();
  const categories = Array.from(new Set(items.map((p) => p.category).filter(Boolean)));

  const commitOrder = async (list: Project[]) => {
    try {
      await saveOrder("projects", list.map((p) => p.id));
      toast.success("New order saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save order");
    }
  };

  const toggle = async (p: Project, key: "published" | "featured") => {
    const value = !p[key];
    setItems((xs) => xs.map((x) => (x.id === p.id ? { ...x, [key]: value } : x)));
    try {
      await setField("projects", p.id, { [key]: value });
      toast.success(
        key === "published" ? (value ? `“${p.title}” is now live.` : `“${p.title}” is hidden (draft).`) : value ? "Marked as featured." : "No longer featured.",
      );
    } catch (e) {
      setItems((xs) => xs.map((x) => (x.id === p.id ? { ...x, [key]: !value } : x)));
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    }
  };

  const remove = async (p: Project) => {
    const ok = await confirm({
      title: "Delete this project?",
      message: (
        <>
          <strong>{p.title}</strong> will be removed from your site permanently. Tip: you can hide it instead by turning it into a draft.
        </>
      ),
      confirmLabel: "Delete project",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRow("projects", p.id);
      void removeImage(p.image_url).catch(() => undefined);
      setItems((xs) => xs.filter((x) => x.id !== p.id));
      toast.success("Project deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete");
    }
  };

  return (
    <>
      <PageHeader
        title="Projects"
        description="Drag to change the order. Drafts stay hidden until you publish them."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing(blank(items.length))}>
            New project
          </Button>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Add your first project — it'll stay a draft until you publish it."
          action={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing(blank(0))}>
              Add a project
            </Button>
          }
        />
      ) : (
        <SortableList
          items={items}
          onReorder={setItems}
          onCommit={commitOrder}
          label={(p) => p.title}
          render={(p) => (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:h-14 sm:w-20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image_url && <img src={p.image_url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1 basis-[150px]">
                <p className="flex items-center gap-2 truncate text-[15px] font-semibold">
                  {p.title}
                  {p.featured && <Star className="size-3.5 shrink-0 fill-amber text-amber" aria-label="Featured" />}
                </p>
                <p className="truncate text-[13px] text-ink-3">{[p.category, p.year].filter(Boolean).join(" · ") || "No category"}</p>
              </div>
              <span
                className={`hidden rounded-full px-2.5 py-1 text-[12px] font-medium sm:inline ${p.published ? "bg-mint-soft text-mint" : "bg-surface-2 text-ink-3"}`}
              >
                {p.published ? "Live" : "Draft"}
              </span>
              <div className="ml-auto flex">
                <Button variant="ghost" className="!size-9 !px-0" title={p.published ? "Unpublish" : "Publish"} aria-label={p.published ? `Unpublish ${p.title}` : `Publish ${p.title}`} onClick={() => toggle(p, "published")}>
                  {p.published ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </Button>
                <Button variant="ghost" className="!size-9 !px-0" title="Feature" aria-label={`${p.featured ? "Unfeature" : "Feature"} ${p.title}`} aria-pressed={p.featured} onClick={() => toggle(p, "featured")}>
                  <Star className={`size-4 ${p.featured ? "fill-amber text-amber" : ""}`} />
                </Button>
                <Button variant="ghost" className="!size-9 !px-0" title="Edit" aria-label={`Edit ${p.title}`} onClick={() => setEditing(p)}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" className="!size-9 !px-0" title="Delete" aria-label={`Delete ${p.title}`} onClick={() => remove(p)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          )}
        />
      )}

      {editing && (
        <ProjectForm
          key={editing.id || "new"}
          project={editing}
          categories={categories}
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

function ProjectForm({
  project,
  categories,
  onClose,
  onSaved,
}: {
  project: Project;
  categories: string[];
  onClose: () => void;
  onSaved: (p: Project) => void;
}) {
  const [v, setV] = useState({ ...project, github_url: project.github_url ?? "", demo_url: project.demo_url ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const isNew = !project.id;

  const save = async () => {
    const parsed = ProjectSchema.safeParse({ ...v, id: v.id || undefined });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      const saved = await upsertRow<Project>("projects", parsed.data as Project);
      toast.success(isNew ? (saved.published ? "Project added and published!" : "Project saved as a draft.") : "Project saved.");
      onSaved(saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isNew ? "New project" : `Edit “${project.title}”`} wide>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-5">
          <Field label="Title" htmlFor="p-title" error={errors.title}>
            <Input id="p-title" value={v.title} onChange={(e) => set("title", e.target.value)} invalid={!!errors.title} autoFocus />
          </Field>
          <Field label="One-line summary" htmlFor="p-summary" error={errors.summary} count={v.summary.length} max={300} hint="Shown on the project card.">
            <Textarea id="p-summary" rows={2} value={v.summary} onChange={(e) => set("summary", e.target.value)} invalid={!!errors.summary} />
          </Field>
          <Field label="Full description" htmlFor="p-desc" count={v.description.length} max={4000} hint="Shown when a visitor opens the project. Momo also uses it to answer questions.">
            <Textarea id="p-desc" rows={5} value={v.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Category" htmlFor="p-cat" hint="Used for the filter buttons">
              <Input id="p-cat" list="project-categories" value={v.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. AI Product" />
              <datalist id="project-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Year" htmlFor="p-year">
              <Input id="p-year" value={v.year} onChange={(e) => set("year", e.target.value)} maxLength={12} />
            </Field>
            <Field label="Result / highlight" htmlFor="p-hl" hint="Optional, e.g. “10k users”">
              <Input id="p-hl" value={v.highlight} onChange={(e) => set("highlight", e.target.value)} maxLength={160} />
            </Field>
          </div>
          <Field label="Technologies" htmlFor="p-tech" hint="Press Enter after each one">
            <TagInput id="p-tech" value={v.technologies} onChange={(t) => set("technologies", t)} placeholder="e.g. React" />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Live demo link" htmlFor="p-demo" error={errors.demo_url}>
              <Input id="p-demo" type="url" value={v.demo_url} onChange={(e) => set("demo_url", e.target.value)} placeholder="https://" invalid={!!errors.demo_url} />
            </Field>
            <Field label="GitHub link" htmlFor="p-gh" error={errors.github_url}>
              <Input id="p-gh" type="url" value={v.github_url} onChange={(e) => set("github_url", e.target.value)} placeholder="https://github.com/…" invalid={!!errors.github_url} />
            </Field>
          </div>
        </div>
        <div className="space-y-5">
          <ImageUpload value={v.image_url} onChange={(url) => set("image_url", url)} folder="projects" label="Cover image" hint="16:10 works best · max 5 MB" />
          <Panel>
            <Toggle checked={v.published} onChange={(x) => set("published", x)} label="Published" description="Visible on your site" />
            <Toggle checked={v.featured} onChange={(x) => set("featured", x)} label="Featured" description="Shown larger at the top" />
          </Panel>
        </div>
      </div>
      <div className="sticky bottom-0 -mx-5 mt-6 flex justify-end gap-2 border-t border-line bg-bg-elevated px-5 pt-4 sm:-mx-7 sm:px-7">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" loading={saving} onClick={save}>
          {isNew ? (v.published ? "Add & publish" : "Save draft") : "Save project"}
        </Button>
      </div>
    </Modal>
  );
}
