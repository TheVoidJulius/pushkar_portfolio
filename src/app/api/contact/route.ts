import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ContactSchema } from "@/lib/validation";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Contact form endpoint. Validates on the server, then stores the message in
 * Supabase (contact_messages, insert-only for visitors via RLS). The owner
 * reads messages in /admin/contact. To also receive an email, add a Supabase
 * Database Webhook or a provider such as Resend here (see README).
 */
export async function POST(req: Request) {
  const limit = rateLimit(clientKey(req, "contact"), 5, 10 * 60_000);
  if (!limit.ok) {
    return Response.json({ error: "Too many messages — please try again in a few minutes." }, { status: 429 });
  }

  const parsed = ContactSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Please check the form.", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { website, ...msg } = parsed.data;
  if (website) return Response.json({ ok: true }); // bot: pretend success

  if (!isSupabaseConfigured) {
    return Response.json({ error: "The contact form isn't connected yet. Please use email instead." }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("contact_messages").insert(msg);
  if (error) {
    console.error("[contact] insert failed", error.message);
    return Response.json({ error: "Something went wrong saving your message. Please try again." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
