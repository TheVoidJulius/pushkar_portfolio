"use client";

import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { deleteRow, saveOrder, setField, upsertRow } from "@/lib/admin/api";
import type { Skill, SkillCategory, SkillCategoryWithSkills, SkillLevel } from "@/lib/types";
import { CATEGORY_ICON_NAMES, CategoryIcon } from "../../site/icons";
import { SortableList } from "../SortableList";
import { Button, EmptyState, Field, Input, Modal, PageHeader, Select, useConfirm } from "../ui";

const LEVELS: { value: SkillLevel; label: string }[] = [
  { value: "expert", label: "●●● Expert" },
  { value: "proficient", label: "●●○ Proficient" },
  { value: "familiar", label: "●○○ Familiar" },
];

export function SkillsEditor({ initial }: { initial: SkillCategoryWithSkills[] }) {
  const [cats, setCats] = useState(initial);
  const [open, setOpen] = useState<string | null>(initial[0]?.id ?? null);
  const [editing, setEditing] = useState<SkillCategory | null>(null);
  const { confirm, dialog } = useConfirm();

  const updateCat = (id: string, fn: (c: SkillCategoryWithSkills) => SkillCategoryWithSkills) =>
    setCats((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));

  const commitCatOrder = async (list: SkillCategoryWithSkills[]) => {
    try {
      await saveOrder("skill_categories", list.map((c) => c.id));
      toast.success("Category order saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save order");
    }
  };

  const removeCat = async (c: SkillCategoryWithSkills) => {
    const ok = await confirm({
      title: `Delete “${c.name}”?`,
      message: `This also deletes the ${c.skills.length} skill${c.skills.length === 1 ? "" : "s"} inside it.`,
      confirmLabel: "Delete category",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRow("skill_categories", c.id);
      setCats((cs) => cs.filter((x) => x.id !== c.id));
      toast.success("Category deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete");
    }
  };

  return (
    <>
      <PageHeader
        title="Skills"
        description="Group your skills into categories. Visitors switch between categories on the site."
        actions={
          <Button
            variant="primary"
            icon={<Plus className="size-4" />}
            onClick={() => setEditing({ id: "", name: "", description: "", icon: "sparkles", sort_order: cats.length })}
          >
            New category
          </Button>
        }
      />
      {cats.length === 0 ? (
        <EmptyState title="No skill categories" description="Create a category such as “Frontend Development”, then add skills to it." />
      ) : (
        <SortableList
          items={cats}
          onReorder={setCats}
          onCommit={commitCatOrder}
          label={(c) => c.name}
          render={(c) => (
            <div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(open === c.id ? null : c.id)}
                  aria-expanded={open === c.id}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2">
                    <CategoryIcon name={c.icon} className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{c.name}</span>
                    <span className="block truncate text-[13px] text-ink-3">
                      {c.skills.length} skill{c.skills.length === 1 ? "" : "s"}
                      {c.description ? ` · ${c.description}` : ""}
                    </span>
                  </span>
                  <ChevronDown className={`size-4 shrink-0 text-ink-3 transition-transform ${open === c.id ? "rotate-180" : ""}`} />
                </button>
                <Button variant="ghost" className="!size-9 !px-0" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" className="!size-9 !px-0" aria-label={`Delete ${c.name}`} onClick={() => removeCat(c)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              {open === c.id && <SkillList category={c} onChange={(skills) => updateCat(c.id, (x) => ({ ...x, skills }))} />}
            </div>
          )}
        />
      )}
      {editing && (
        <CategoryForm
          category={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setCats((cs) =>
              cs.some((c) => c.id === saved.id)
                ? cs.map((c) => (c.id === saved.id ? { ...c, ...saved } : c))
                : [...cs, { ...saved, skills: [] }],
            );
            setOpen(saved.id);
            setEditing(null);
          }}
        />
      )}
      {dialog}
    </>
  );
}

function SkillList({ category, onChange }: { category: SkillCategoryWithSkills; onChange: (s: Skill[]) => void }) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState<SkillLevel>("proficient");
  const [busy, setBusy] = useState(false);
  const skills = category.skills;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (skills.some((s) => s.name.toLowerCase() === n.toLowerCase())) {
      toast.error(`“${n}” is already in this category.`);
      return;
    }
    setBusy(true);
    try {
      const saved = await upsertRow<Skill>("skills", {
        category_id: category.id,
        name: n.slice(0, 60),
        level,
        sort_order: skills.length,
      } as Skill);
      onChange([...skills, saved]);
      setName("");
      toast.success(`Added ${saved.name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add");
    } finally {
      setBusy(false);
    }
  };

  const changeLevel = async (s: Skill, lvl: SkillLevel) => {
    onChange(skills.map((x) => (x.id === s.id ? { ...x, level: lvl } : x)));
    try {
      await setField("skills", s.id, { level: lvl });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update");
    }
  };

  const remove = async (s: Skill) => {
    onChange(skills.filter((x) => x.id !== s.id));
    try {
      await deleteRow("skills", s.id);
      toast.success(`Removed ${s.name}.`);
    } catch (err) {
      onChange(skills);
      toast.error(err instanceof Error ? err.message : "Couldn't remove");
    }
  };

  return (
    <div className="mt-4 border-t border-line pt-4">
      {skills.length > 0 && (
        <SortableList
          items={skills}
          onReorder={onChange}
          onCommit={async (list) => {
            try {
              await saveOrder("skills", list.map((s) => s.id));
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Couldn't save order");
            }
          }}
          label={(s) => s.name}
          render={(s) => (
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{s.name}</span>
              <Select
                value={s.level}
                onChange={(lvl) => changeLevel(s, lvl as SkillLevel)}
                options={LEVELS}
                className="!w-auto !py-1.5 text-[13px]"
              />
              <Button variant="ghost" className="!size-8 !px-0" aria-label={`Remove ${s.name}`} onClick={() => remove(s)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          )}
        />
      )}
      <form onSubmit={add} className="mt-3 flex flex-wrap gap-2">
        <label htmlFor={`new-skill-${category.id}`} className="sr-only">
          New skill name
        </label>
        <Input
          id={`new-skill-${category.id}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a skill, e.g. Figma"
          maxLength={60}
          className="!w-auto min-w-[180px] flex-1"
        />
        <Select value={level} onChange={(l) => setLevel(l as SkillLevel)} options={LEVELS} className="!w-auto" />
        <Button type="submit" variant="primary" loading={busy} icon={<Plus className="size-4" />} disabled={!name.trim()}>
          Add
        </Button>
      </form>
    </div>
  );
}

function CategoryForm({
  category,
  onClose,
  onSaved,
}: {
  category: SkillCategory;
  onClose: () => void;
  onSaved: (c: SkillCategory) => void;
}) {
  const [v, setV] = useState(category);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!v.name.trim()) return setError("Give the category a name.");
    setSaving(true);
    try {
      const { id, ...rest } = v;
      const saved = await upsertRow<SkillCategory>("skill_categories", (id ? v : rest) as SkillCategory);
      toast.success("Category saved.");
      onSaved(saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={category.id ? "Edit category" : "New category"}>
      <div className="space-y-5">
        <Field label="Name" htmlFor="c-name" error={error ?? undefined}>
          <Input id="c-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={60} autoFocus />
        </Field>
        <Field label="Short description" htmlFor="c-desc" hint="Optional, shown under the name">
          <Input id="c-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={240} />
        </Field>
        <fieldset>
          <legend className="mb-2 text-[14px] font-medium">Icon</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_ICON_NAMES.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => setV({ ...v, icon })}
                aria-pressed={v.icon === icon}
                aria-label={icon}
                className={`grid size-11 place-items-center rounded-xl border transition ${
                  v.icon === icon ? "border-accent bg-accent-soft text-accent-text" : "border-line hover:border-line-strong"
                }`}
              >
                <CategoryIcon name={icon} className="size-5" />
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="mt-6 flex justify-end gap-2">
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
