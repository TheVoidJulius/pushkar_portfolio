import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getPortfolioContent } from "@/lib/content/queries";
import { buildKnowledge } from "@/lib/assistant/knowledge";
import { localAnswer } from "@/lib/assistant/local-brain";
import { ASSISTANT_RULES, buildPersona } from "@/lib/assistant/prompt";
import { formatMeta, formatSignature, parseReply, speechText } from "@/lib/assistant/protocol";
import { signSpeech } from "@/lib/assistant/voice-server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(1200),
      }),
    )
    .min(1)
    .max(24),
});

const textStream = (producer: (write: (s: string) => void) => Promise<void>, headers: Record<string, string> = {}) => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await producer((s) => controller.enqueue(encoder.encode(s)));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
};

/** Lets /api/tts confirm this reply really came from this server. */
const signedTrailer = (reply: string) => {
  const signature = signSpeech(speechText(parseReply(reply).text));
  return signature ? formatSignature(signature) : "";
};

export async function POST(req: Request) {
  const limit = rateLimit(clientKey(req, "chat"), 20, 60_000);
  if (!limit.ok) {
    return Response.json(
      { error: "You're chatting a little too fast — give me a few seconds!" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid message." }, { status: 400 });

  // Conversation must end with the visitor's turn; strip meta tags from history
  const history = parsed.data.messages
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.replace(/\[\[[^\]]*\]\]/g, "").trim() || "…" }));
  while (history.length && history[0].role !== "user") history.shift();
  const last = history[history.length - 1];
  if (!last || last.role !== "user") return Response.json({ error: "Invalid message." }, { status: 400 });

  // Same source of truth as the public site: published content only
  const { content } = await getPortfolioContent();

  if (!process.env.ANTHROPIC_API_KEY) {
    return textStream(
      async (write) => {
        const answer = localAnswer(last.content, content);
        write(answer);
        write(signedTrailer(answer));
      },
      { "X-Assistant-Engine": "local" },
    );
  }

  const client = new Anthropic();
  const knowledge = buildKnowledge(content);

  return textStream(
    async (emit) => {
      let wrote = false;
      let full = "";
      const write = (s: string) => {
        full += s;
        emit(s);
      };
      try {
        const stream = client.beta.messages.stream({
          model: MODEL,
          max_tokens: 1024,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low" },
          system: [
            { type: "text", text: ASSISTANT_RULES },
            { type: "text", text: buildPersona(content, knowledge), cache_control: { type: "ephemeral" } },
          ],
          messages: history,
        });
        stream.on("text", (delta) => {
          wrote = true;
          write(delta);
        });
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal" && !wrote) {
          write(formatMeta({ mood: "confused", goto: null }) + "Hmm, I can't help with that one. Want to hear about the projects instead?");
        }
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) console.warn("[chat] Anthropic rate limited");
        else if (err instanceof Anthropic.APIError) console.error("[chat] Anthropic API error", err.status, err.message);
        else console.error("[chat] Unexpected error", err);
        // Keep the assistant useful: answer from the portfolio data instead
        if (!wrote) write(localAnswer(last.content, content));
      }
      emit(signedTrailer(full));
    },
    { "X-Assistant-Engine": "claude" },
  );
}
