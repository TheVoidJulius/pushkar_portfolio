"use client";

import { getSupabaseBrowserClient } from "../supabase/client";
import { MEDIA_BUCKET } from "../supabase/config";

/**
 * Admin data services. Every call runs as the signed-in owner using the
 * public anon key; Row Level Security in Postgres is what actually allows
 * or rejects each write (see supabase/migrations).
 */

export type SingletonTable = "profiles" | "about_content" | "contact_details" | "assistant_settings" | "site_settings";
export type CollectionTable = "projects" | "skill_categories" | "skills" | "experiences";

const db = () => getSupabaseBrowserClient();

function fail(error: { message: string; code?: string } | null): never | void {
  if (!error) return;
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    throw new Error("You don't have permission to change this. Are you signed in as the owner?");
  }
  if (error.code === "23514") throw new Error("Some values aren't valid (too long or wrong format). Please check the form.");
  throw new Error(error.message);
}

const strip = <T extends Record<string, unknown>>(row: T) => {
  const { updated_at, created_at, ...rest } = row as Record<string, unknown>;
  void updated_at;
  void created_at;
  return rest;
};

export async function saveSingleton<T extends Record<string, unknown>>(table: SingletonTable, values: T) {
  const { data, error } = await db()
    .from(table)
    .update(strip(values))
    .eq("id", 1)
    .select()
    .single();
  fail(error);
  return data as T;
}

export async function upsertRow<T extends Record<string, unknown>>(table: CollectionTable, values: T) {
  const { data, error } = await db().from(table).upsert(strip(values)).select().single();
  fail(error);
  return data as T;
}

export async function deleteRow(table: CollectionTable | "contact_messages", id: string) {
  const { error } = await db().from(table).delete().eq("id", id);
  fail(error);
}

/** Persists a new order: each row's sort_order becomes its index. */
export async function saveOrder(table: CollectionTable, ids: string[]) {
  const results = await Promise.all(
    ids.map((id, index) => db().from(table).update({ sort_order: index }).eq("id", id)),
  );
  fail(results.find((r) => r.error)?.error ?? null);
}

export async function setField(table: CollectionTable | "contact_messages", id: string, patch: Record<string, unknown>) {
  const { error } = await db().from(table).update(patch).eq("id", id);
  fail(error);
}

// ---------------------------------------------------------------------
// Images (Supabase Storage)
// ---------------------------------------------------------------------
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/svg+xml"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateImage(file: File) {
  if (!IMAGE_TYPES.includes(file.type)) return "Please choose a PNG, JPG, WebP, GIF, AVIF or SVG image.";
  if (file.size > MAX_IMAGE_BYTES) return `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`;
  return null;
}

export async function uploadImage(file: File, folder: string) {
  const problem = validateImage(file);
  if (problem) throw new Error(problem);
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db().storage.from(MEDIA_BUCKET).upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });
  fail(error);
  return db().storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Deletes an image we previously uploaded (ignores placeholders / external URLs). */
export async function removeImage(url: string | null | undefined) {
  if (!url) return;
  const marker = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return;
  const path = decodeURIComponent(url.slice(i + marker.length));
  await db().storage.from(MEDIA_BUCKET).remove([path]);
}

export async function signOut() {
  await db().auth.signOut();
}
