// Verifies Row Level Security against a running Supabase.
// Usage: SUPABASE_URL=… SUPABASE_ANON_KEY=… OWNER_EMAIL=… OWNER_PASSWORD=… [OTHER_EMAIL=… OTHER_PASSWORD=…] node scripts/rls-check.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const mk = () => createClient(url, key, { auth: { persistSession: false } });
let failed = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failed++; };

const anon = mk();
const r1 = await anon.from("profiles").update({ name: "Hacked" }).eq("id", 1).select();
ok(!r1.data?.length, "anonymous visitor cannot edit the profile");
const r2 = await anon.from("projects").insert({ title: "spam" });
ok(Boolean(r2.error), "anonymous visitor cannot add projects");
const r3 = await anon.from("contact_messages").select("*");
ok(!r3.data?.length, "anonymous visitor cannot read contact messages");
const r4 = await anon.storage.from("portfolio-media").upload(`x/${Date.now()}.txt`, new Blob(["x"], { type: "image/png" }));
ok(Boolean(r4.error), "anonymous visitor cannot upload files");

const owner = mk();
const s = await owner.auth.signInWithPassword({ email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD });
ok(!s.error, "owner can sign in");
const draft = await owner.from("projects").insert({ title: "RLS draft test", published: false }).select().single();
ok(!draft.error, "owner can create a draft project");
const seen = await anon.from("projects").select("id").eq("id", draft.data?.id ?? "");
ok(!seen.data?.length, "visitors cannot see draft projects");
const ownerSeen = await owner.from("projects").select("id").eq("id", draft.data?.id ?? "");
ok(ownerSeen.data?.length === 1, "owner can see draft projects");
await owner.from("projects").delete().eq("id", draft.data?.id ?? "");
const msgs = await owner.from("contact_messages").select("id");
ok(!msgs.error, "owner can read contact messages");

if (process.env.OTHER_EMAIL) {
  const other = mk();
  await other.auth.signInWithPassword({ email: process.env.OTHER_EMAIL, password: process.env.OTHER_PASSWORD });
  const r5 = await other.from("profiles").update({ name: "Hacked" }).eq("id", 1).select();
  ok(!r5.data?.length, "a signed-in NON-owner cannot edit content");
  const r6 = await other.from("contact_messages").select("*");
  ok(!r6.data?.length, "a signed-in NON-owner cannot read messages");
}
const name = await anon.from("profiles").select("name").eq("id", 1).single();
ok(name.data?.name !== "Hacked", "profile name unchanged after attacks");
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll security checks passed");
process.exit(failed ? 1 : 0);
