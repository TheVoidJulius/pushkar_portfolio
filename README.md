# Interactive portfolio with Mikuro, the AI cat assistant

A personal portfolio site with an animated, voiced cat assistant, plus a private dashboard where the owner edits everything without touching code.

| | URL (placeholder until deployed) |
|---|---|
| Public website | https://example-portfolio.vercel.app |
| Admin dashboard | https://example-portfolio.vercel.app/admin |

**For the site owner:** the day-to-day guide is [docs/CLIENT-GUIDE.md](docs/CLIENT-GUIDE.md). This README covers setup, deployment and handover.

---

## What's inside

- **Public site**: a quiet, conversational white page (15px Inter, generous whitespace, light and dark themes, sakura accent). The order is Hero → Projects → Skills → Experience → About → Contact.
  - **Hero:** an avatar greeting.
  - **Projects:** an app-icon carousel plus a project reel.
  - **Skills:** "terminal sheet" skill cards.
  - **Experience:** a scroll-driven rotating dial with the role card in the middle.
  - **About:** a photo, story and quote-style highlights.
  - **Contact:** a chrome Contact button and a minimal form.
- **Mikuro** is a real-time 3D liquid-chrome puffball cat: round iridescent body, cat ears, a cowlick curl, big glossy anime eyes, and 11 expressions. She's built procedurally with Three.js (`src/components/momo/three/MomoRenderer.ts`), so there are no model files. One instance (`MomoFlight`) glides between landing spots and stays about 60–90px beside the text, like a small guide.
- **Narration ("run-through"):**
  - **Intro:** when the page opens, Mikuro appears large, shrinks into place and greets the visitor.
  - **Sections:** in every section she says a line generated from the live content (`src/lib/assistant/tour.ts`), with karaoke-style highlighting where spoken words darken and the rest stay grey.
  - **Sound:** the "Tap for sound" chip turns on her voice (browsers block audio until a tap), and "Skip intro" skips the greeting.
  - **Tour:** the menu's "Play the tour" option auto-scrolls through every section.
  - **Off switch:** the owner can turn narration off.
- **Chat** supports text and microphone input, a mute button, replay and stop for each message, and a status line (listening, thinking, speaking). It scrolls the page to the section it's talking about.
- **Voice:** a mature, expressive woman's voice speaking English with a Japanese accent.
  - **ElevenLabs:** used when configured. The admin voice list ranks Japanese-accent female voices first, and Eleven v3+ gets an emotion tag per line.
  - **Browser voice (free fallback):** with the default "Japanese accent" setting, a Japanese female voice reads the English text. Edge's "Nanami (Natural)" sounds best. If no Japanese voice is installed, it falls back to a warm English voice. Pitch and speed are adjustable in admin.
- **Brain** uses Claude (via `@anthropic-ai/sdk`) when `ANTHROPIC_API_KEY` is set. Otherwise a built-in rule-based answerer replies. Both read the same published content from the database, and neither invents facts.
- **Admin (`/admin`)** uses Supabase Auth with a single owner. It has editors for every section, image uploads, drag-to-reorder lists, draft/published states, a contact-form inbox, assistant and voice settings, and JSON backup and restore.

### Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Three.js · Motion · Lenis · Supabase (Postgres, Auth, Storage, RLS) · Zod · Anthropic SDK · ElevenLabs REST API · Sonner · Lucide.

### Project layout

```
src/
  app/                    routes (public page, /admin/*, /api/*)
    api/chat              assistant replies (Claude → built-in fallback)
    api/tts               ElevenLabs proxy (key stays on the server)
    api/contact           contact form → Supabase
    api/admin/voices      owner-only: list ElevenLabs voices/models
  components/momo/        3D cat (three/), flight + tour, voice engine, chat UI
  components/site/        public sections
  components/admin/       dashboard UI + editors
  lib/content/queries.ts  single source of truth for site + assistant
  lib/assistant/          prompt, knowledge builder, fallback brain
  lib/admin/              data services, validation, backup
  proxy.ts                session refresh + /admin redirect
supabase/
  migrations/             schema, RLS policies, storage bucket
  seed-content.json       placeholder content (also the no-database fallback)
  seed.sql                generated from seed-content.json
  create-owner.sql        grants dashboard access to the owner
scripts/                  seed + placeholder generators, RLS security check
```

---

## Local development

Requirements: Node 20.9+ and Docker (for a local Supabase).

```bash
npm install
npx supabase start          # starts Postgres/Auth/Storage, applies migrations + seed
cp .env.example .env.local  # paste the URL + publishable key printed by the command above
npm run dev                 # http://localhost:3000
```

To create a local owner for `/admin`, use **Studio → Authentication → Add user** (`npx supabase start` without `-x studio`), or call the Auth admin API. Then run [`supabase/create-owner.sql`](supabase/create-owner.sql) with that email.

Without Supabase variables, the public site still renders with the placeholder content and `/admin` shows setup instructions.

Useful scripts:

| Command | What it does |
|---|---|
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm run check:security` | Signs in and verifies RLS. Needs `OWNER_EMAIL` and `OWNER_PASSWORD` (optional: `OTHER_EMAIL` and `OTHER_PASSWORD` for a non-owner account) |
| `npm run db:seed:generate` | Rebuilds `supabase/seed.sql` after editing `seed-content.json` |
| `npm run placeholders` | Regenerates the placeholder SVG artwork |

---

## Deploying (owner's own accounts)

Everything below should be created **in the client's own accounts**, so they aren't dependent on the developer. If the developer sets it up first, transfer ownership as described in [Handover and ownership](#handover-and-ownership).

### 1. Supabase (database, login, images)

1. Create a project at [supabase.com](https://supabase.com). The free tier is enough.
2. **SQL Editor:** run every file in [`supabase/migrations/`](supabase/migrations) in date order, then [`supabase/seed.sql`](supabase/seed.sql) for the placeholder content. Alternatively: `npx supabase link --project-ref <ref>`, `npx supabase db push`, then run `seed.sql`.
   - The migration also creates the public `portfolio-media` storage bucket (5 MB limit, images only) and its access policies.
3. **Authentication → Sign In / Providers → Email:** turn **off** "Allow new users to sign up". There is no public registration.
4. **Authentication → URL Configuration:**
   - Site URL: `https://YOUR-DOMAIN`
   - Redirect URLs: `https://YOUR-DOMAIN/admin/auth/callback`. This is needed for password-reset emails.
5. **Create the owner account:** go to **Authentication → Users → Add user → Create new user**, enter the owner's email and a strong password, and tick *Auto Confirm User*. Then run [`supabase/create-owner.sql`](supabase/create-owner.sql) in the SQL Editor with that email.
6. Copy the **Project URL** and the **anon/publishable key** from **Project Settings → API**.
   *Never* put the `service_role` / secret key in Vercel or in the code. This app doesn't need it.

### 2. Vercel (hosting)

1. Push this repository to the client's GitHub account, then go to **vercel.com → Add New → Project → Import**.
2. Add these environment variables (Production + Preview):

| Variable | Required | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Same page (anon / publishable key) |
| `NEXT_PUBLIC_SITE_URL` | yes | The final site URL, e.g. `https://example-portfolio.vercel.app` |
| `ANTHROPIC_API_KEY` | optional | [console.anthropic.com](https://console.anthropic.com) → API Keys (paid, usage-based) |
| `ANTHROPIC_MODEL` | optional | Defaults to `claude-opus-5-5` |
| `ELEVENLABS_API_KEY` | optional | [elevenlabs.io](https://elevenlabs.io) → Developers → API Keys (paid plans recommended) |
| `ELEVENLABS_VOICE_ID` | optional | A default voice. The owner can also pick one in the dashboard. |

3. Deploy. Custom domain: **Vercel → Project → Settings → Domains**. Afterwards, update `NEXT_PUBLIC_SITE_URL` and the Supabase URL configuration.

Content changes never need a redeploy. The public page is rendered per request from Supabase.

### 3. Optional: voice and AI setup

**Claude (natural conversation).** With `ANTHROPIC_API_KEY` set, `/api/chat` streams replies from Claude. The system prompt is built on every request from published content only (`lib/assistant/knowledge.ts`), so edits are reflected immediately. The assistant is instructed not to invent facts and to say when it doesn't know. If the API errors, the visitor still gets an answer from the built-in responder.

**ElevenLabs (anime-style English voice).**
1. In ElevenLabs, open **Voice Library** and add a young, bright, expressive female English voice to "My Voices". Search terms like *anime*, *cute* or *young female* help. Do **not** assume any particular voice ID exists.
2. Set `ELEVENLABS_API_KEY` in Vercel and redeploy.
3. In **/admin → AI Assistant**, click *Load my ElevenLabs voices*, pick the voice, and choose the model. Eleven v3 or newer supports emotion tags like `[excited]` and `[curious]`, which the app adds automatically per reply. Then save and press *Hear Mikuro*.
4. If the configured model isn't available on the plan, the server retries with `eleven_multilingual_v2`. If ElevenLabs fails entirely, the browser voice takes over.

Costs to expect: both providers bill per use. `/api/chat` and `/api/tts` have a per-IP rate limit (`src/lib/rate-limit.ts`, best effort, per server instance). For stricter protection, add Vercel Firewall rules or set spending limits in each provider's console.

### 4. Contact form email notifications (optional)

Messages are stored in Supabase and shown in **/admin → Contact**. For email alerts, add a Supabase **Database Webhook** on `contact_messages` INSERT that calls an email service such as Resend, or extend `src/app/api/contact/route.ts`.

---

## Security model

- All reads and writes use the public anon key. **Row Level Security** in Postgres decides what's allowed:
  - Visitors can read published content only (draft projects and experience are hidden) and can *insert* contact messages.
  - Only users listed in `public.admin_users` can write content, upload images or read messages.
- `/admin` is checked three times: an optimistic redirect in `src/proxy.ts`, a server-side session and owner check in the dashboard layout, and RLS on every query.
- Third-party keys (Anthropic, ElevenLabs) are only read in server route handlers. The dashboard only ever sees whether a key is set.
- Inputs are validated with Zod on the client and again server-side (API routes, plus database CHECK constraints).
- `npm run check:security` re-verifies these rules against any Supabase project.

---

## Handover and ownership

| Service | Used for | Owner should hold |
|---|---|---|
| GitHub | Source code | Repository in their account (or transfer: Settings → Transfer) |
| Vercel | Hosting, domain, environment variables | Project in their account (Project → Settings → Transfer) |
| Supabase | Database, login, images | Project in their organization (Project Settings → General → Transfer project) |
| Domain registrar | Custom domain | Their registrar account |
| Anthropic (optional) | AI conversations | Their API key and billing |
| ElevenLabs (optional) | Voice | Their API key, voice and billing |

After transferring: rotate any keys the developer created, remove the developer from each team, and confirm the owner can sign in at `/admin` and reset their password.

---

## Replacing the placeholder content

The starting content is Pushkar Panwar's real profile, gathered from his public GitHub, LeetCode and profile README. Project covers and the portrait in `public/placeholders/` are generated artwork; upload real screenshots and a photo in the dashboard to replace them. To change the starting content before handover instead, edit `supabase/seed-content.json` and run `npm run db:seed:generate`. Placeholder artwork lives in `public/placeholders/`, and uploads replace it.
