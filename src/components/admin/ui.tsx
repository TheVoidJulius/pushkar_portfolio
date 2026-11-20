"use client";

import { AnimatePresence, motion } from "motion/react";
import { ExternalLink, ImagePlus, Loader2, RotateCcw, Save, Trash2, Upload, X } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { removeImage, uploadImage, validateImage } from "@/lib/admin/api";

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[34px] leading-tight tracking-tight sm:text-[40px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
  aside,
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-7">
      {(title || aside) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-1 text-[14px] text-ink-3">{description}</p>}
          </div>
          {aside}
        </div>
      )}
      <div className="space-y-5">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------
export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  count,
  max,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  count?: number;
  max?: number;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[14px] font-medium text-ink">
          {label}
        </label>
        {max !== undefined && count !== undefined && (
          <span className={`font-mono text-[11px] ${count > max ? "text-accent-text" : "text-ink-3"}`}>
            {count}/{max}
          </span>
        )}
      </div>
      {children}
      {error ? (
        <p className="mt-1.5 text-[13px] text-accent-text" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-[13px] text-ink-3">{hint}</p>
      )}
    </div>
  );
}

const control =
  "w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[15px] text-ink outline-none transition placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent/10 aria-[invalid=true]:border-accent disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ invalid, className = "", ...props }, ref) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={`${control} ${className}`} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ invalid, className = "", rows = 4, ...props }, ref) {
    return <textarea ref={ref} rows={rows} aria-invalid={invalid || undefined} className={`${control} resize-y leading-relaxed ${className}`} {...props} />;
  },
);

export function Select({
  value,
  onChange,
  options,
  id,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  id?: string;
  className?: string;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${control} cursor-pointer ${className}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-[14.5px] font-medium">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-accent" : "bg-surface-3"}`}
      >
        <span
          className={`absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform duration-300 ${checked ? "translate-x-5" : ""}`}
        />
      </button>
    </div>
  );
}

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  hint,
  format = (v: number) => v.toFixed(2),
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  hint?: string;
  format?: (v: number) => string;
}) {
  const id = useId();
  return (
    <div>
      <div className="mb-1.5 flex justify-between">
        <label htmlFor={id} className="text-[14px] font-medium">
          {label}
        </label>
        <span className="font-mono text-[12.5px] text-ink-2">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
      {hint && <p className="mt-1 text-[12.5px] text-ink-3">{hint}</p>}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  variant = "secondary",
  loading,
  children,
  className = "",
  icon,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean; icon?: ReactNode }) {
  const styles: Record<BtnVariant, string> = {
    primary: "bg-ink text-bg hover:opacity-90",
    secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
    ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
    danger: "bg-accent text-accent-ink hover:brightness-105",
  };
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-[14px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tag input (technologies, interests, …)
// ---------------------------------------------------------------------------
export function TagInput({
  value,
  onChange,
  placeholder = "Type and press Enter",
  id,
  max = 20,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  id?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const items = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));
    if (items.length) onChange([...value, ...items].slice(0, max));
    setDraft("");
  };
  return (
    <div className={`${control} flex flex-wrap items-center gap-1.5 !py-2`}>
      {value.map((t, i) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pr-1 pl-3 text-[13px]">
          {t}
          <button
            type="button"
            aria-label={`Remove ${t}`}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="grid size-5 place-items-center rounded-full text-ink-3 hover:bg-surface-3 hover:text-ink"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
        placeholder={value.length >= max ? "Limit reached" : placeholder}
        disabled={value.length >= max}
        className="min-w-[140px] flex-1 bg-transparent py-1 text-[15px] outline-none placeholder:text-ink-3"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image upload (Supabase Storage)
// ---------------------------------------------------------------------------
export function ImageUpload({
  value,
  onChange,
  folder,
  label = "Image",
  aspect = "aspect-[4/3]",
  hint = "PNG, JPG, WebP, GIF or SVG · up to 5 MB",
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  folder: string;
  label?: string;
  aspect?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    const problem = validateImage(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const url = await uploadImage(file, folder);
      const previous = value;
      onChange(url);
      // Old uploaded file is cleaned up once replaced (placeholders are kept)
      void removeImage(previous).catch(() => undefined);
      toast.success("Image uploaded — remember to save.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <p className="mb-1.5 text-[14px] font-medium">{label}</p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void handle(e.dataTransfer.files[0]);
        }}
        className={`relative overflow-hidden rounded-2xl border-2 border-dashed transition ${
          drag ? "border-accent bg-accent-soft" : "border-line-strong bg-bg"
        } ${aspect}`}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={`${label} preview`} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-3 hover:text-ink"
          >
            <ImagePlus className="size-7" />
            <span className="text-[14px] font-medium">Click or drop an image</span>
          </button>
        )}
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-bg/70 backdrop-blur-sm">
            <Loader2 className="size-6 animate-spin text-ink" />
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button icon={<Upload className="size-4" />} onClick={() => inputRef.current?.click()} disabled={busy} className="!h-9">
          {value ? "Replace" : "Upload"}
        </Button>
        {value && (
          <Button
            variant="ghost"
            icon={<Trash2 className="size-4" />}
            className="!h-9"
            onClick={() => {
              const previous = value;
              onChange(null);
              void removeImage(previous).catch(() => undefined);
            }}
          >
            Remove
          </Button>
        )}
        <span className="text-[12.5px] text-ink-3">{hint}</span>
      </div>
      {error && (
        <p className="mt-1.5 text-[13px] text-accent-text" role="alert">
          {error}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"
        className="sr-only"
        tabIndex={-1}
        aria-label={`Upload ${label}`}
        onChange={(e) => void handle(e.target.files?.[0])}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save bar + unsaved-changes guard
// ---------------------------------------------------------------------------
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

export function SaveBar({
  dirty,
  saving,
  onSave,
  onReset,
  viewHref = "/",
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
  viewHref?: string;
}) {
  useUnsavedGuard(dirty);
  // Ctrl/Cmd + S saves
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving) onSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, saving, onSave]);

  return (
    <div className="sticky bottom-3 z-20 mt-8">
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-lift backdrop-blur-xl transition ${
          dirty ? "border-accent/40 bg-bg-elevated/95" : "border-line bg-bg-elevated/80"
        }`}
      >
        <p className="flex items-center gap-2 text-[14px] text-ink-2" aria-live="polite">
          <span className={`size-2 rounded-full ${dirty ? "bg-amber" : "bg-mint"}`} />
          {dirty ? "You have unsaved changes" : "All changes saved"}
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={viewHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            View on site <ExternalLink className="size-3.5" />
          </a>
          <Button variant="ghost" onClick={onReset} disabled={!dirty || saving} icon={<RotateCcw className="size-4" />}>
            Discard
          </Button>
          <Button variant="primary" onClick={onSave} disabled={!dirty} loading={saving} icon={<Save className="size-4" />}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  // true on the client, false during server rendering (portal needs document.body)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            className={`flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-bg-elevated shadow-lift sm:rounded-3xl ${wide ? "max-w-4xl" : "max-w-lg"}`}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-7">
              <h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-surface-2">
                <X className="size-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-5 sm:px-7">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

type ConfirmOpts = { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean };

/** Promise-based confirm dialog: `if (await confirm({...})) …` */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((opts: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const dialog = (
    <Modal open={Boolean(state)} onClose={() => close(false)} title={state?.title ?? ""}>
      <div className="text-[15px] leading-relaxed text-ink-2">{state?.message}</div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => close(false)}>
          Cancel
        </Button>
        <Button variant={state?.danger ? "danger" : "primary"} onClick={() => close(true)} autoFocus>
          {state?.confirmLabel ?? "Confirm"}
        </Button>
      </div>
    </Modal>
  );
  return { confirm, dialog };
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line-strong p-10 text-center">
      <p className="text-[17px] font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-[14.5px] text-ink-3">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** Tracks a form's values and whether they differ from the last saved copy. */
export function useFormState<T>(initial: T) {
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(saved) !== JSON.stringify(values);
  const set = useCallback(<K extends keyof T>(key: K, v: T[K]) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setErrors((e) => {
      if (!e[key as string]) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  }, []);
  return { values, setValues, saved, setSaved, dirty, set, errors, setErrors, reset: () => setValues(saved) };
}
