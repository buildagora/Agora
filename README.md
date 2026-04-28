# Agora

Reverse-auction marketplace for construction materials. Buyers post RFQs, sellers bid, buyers award. See [.cursor/rules/agora.md](.cursor/rules/agora.md) for the canonical product spec.

## Stack

- Next.js 16 (App Router) + React 19, Turbopack dev
- PostgreSQL + Prisma 7 (`@prisma/adapter-pg`)
- Custom JWT auth (jose + bcryptjs, cookie sessions)
- Resend (transactional email), OpenAI SDK (experimental agent)
- Tailwind 4

## Prerequisites

- Node.js 20+
- PostgreSQL (local or remote)

## Setup

All commands run from the repo root.

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env.local` in the repo root:
   ```bash
   DATABASE_URL=postgresql://user:password@localhost:5432/agora
   AUTH_SECRET=your-secret-key-at-least-32-characters-long
   RESEND_API_KEY=re_xxxxxxxxxxxxx
   EMAIL_FROM="Agora <onboarding@resend.dev>"

   # Gemini (chat assistant + supplier-search classifier)
   GEMINI_API_KEY=...
   GEMINI_MODEL=gemini-2.5-flash

   # Twilio (buyer-supplier SMS — leave SID/TOKEN blank in dev to log SMS to console)
   TWILIO_ACCOUNT_SID=
   TWILIO_AUTH_TOKEN=
   TWILIO_FROM_NUMBER=+15551234567
   APP_URL=http://localhost:3000
   ```

   **About Twilio:** The buyer-supplier flow sends supplier replies to the buyer
   as SMS. With `TWILIO_ACCOUNT_SID` empty (default in dev), outbound SMS is
   logged to the dev console instead of actually sent — full UX works without
   a real account. Set all three Twilio vars to send for real.

   For **inbound** SMS (buyer texts back into the conversation), you also need
   to point a Twilio number's webhook at this server:
   - In dev, expose your local server with `ngrok http 3000`.
   - In the Twilio console: *Phone Numbers → your number → Messaging → "A message comes in" → Webhook → POST →* `https://<ngrok>.ngrok-free.app/api/sms/inbound`.
   - Without `TWILIO_AUTH_TOKEN`, signature validation is bypassed (dev only)
     so `scripts/sim-inbound-sms.ts` can exercise the route without ngrok:
     `npx tsx scripts/sim-inbound-sms.ts --from "+15555551234" --body "yes please"`.

3. Sync the database schema:
   ```bash
   npm run db:migrate:dev   # with migration history (recommended)
   # or
   npm run db:push          # faster, no migration history
   ```

4. Start the dev server:
   ```bash
   npm run dev
   ```
   App runs at <http://127.0.0.1:3000>.

## Common commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) on port 3000 |
| `npm run dev:webpack` | Dev server with webpack fallback |
| `npm run dev:clean` | Wipe `.next` cache, then `dev` |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate:dev` | Apply migrations + regenerate client |
| `npm run db:push` | Push schema without creating a migration |
| `npm run db:status` | Show migration status |
| `npm run db:studio` | Open Prisma Studio |
| `npm run dev:reset` | **Wipe all auth/RFQ/bid data.** Use before testing signup/login. |

Domain smoke tests live in `scripts/test-*.ts` — run them as `npm run test:auth`, `npm run test:requests`, `npm run test:orders`, etc. (full list in [package.json](package.json)).

## Project layout

```
src/
  app/          Next.js App Router (pages + /api routes)
    (auth)/     Auth pages
    buyer/      Buyer dashboard + nested API
    seller/     Seller dashboard + nested API
    supplier/   Supplier member onboarding
    ops/        Internal ops
    api/        Cross-cutting API routes (auth, public, health, internal)
  lib/          Domain logic (auth, rfq, bids, suppliers, messages, recommendation, dispatch, email)
  components/   React components (ui2/ is the current design system)
  config/, hooks/
prisma/
  schema.prisma   Canonical data model
  migrations/
scripts/        Setup, seed, smoke tests, dev guards
docs/           Active docs (docs/history/ holds historical refactor notes)
experimental/   In-progress AI agent (not fully wired in)
```

## Static assets

Place static files (images, fonts) in [public/](public/). Next.js serves only from this directory.

## Dev login bypass (local only)

For smoke tests and quick role switching, an env-gated dev login is available:

```bash
ENABLE_DEV_LOGIN=true
DEV_LOGIN_TOKEN=changeme
NEXT_PUBLIC_DEV_LOGIN_TOKEN=changeme
```

Then run `npm run smoke`. The bypass is hard-disabled when `NODE_ENV=production`.

## Auth API quick reference

```bash
# Sign up
curl -X POST http://localhost:3000/api/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123","role":"BUYER"}'

# Login (saves cookie)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}' \
  -c cookies.txt

# Current user / logout
curl    http://localhost:3000/api/auth/me     -b cookies.txt
curl -X POST http://localhost:3000/api/auth/logout -b cookies.txt
```

## Troubleshooting

- **Schema mismatch on signup** — run `npm run db:migrate:dev` (or `db:push`), then `db:generate`, restart.
- **"Engine type client" Prisma error** — check `.env.local` for stray `PRISMA_CLIENT_ENGINE_TYPE` / `PRISMA_ENGINE_TYPE` vars and remove them. Fall back to `npm run dev:webpack` if it persists.
- **Wrong workspace root under Turbopack** — caused by a stray `package-lock.json` in a parent directory. Remove it, or rely on the `turbopack.root` setting in [next.config.ts](next.config.ts) plus the `assert-cwd` / `assert-project-root` startup guards.
- **Don't import `@prisma/client/runtime/*`** in route handlers — incompatible with Turbopack. Use [src/lib/db.server.ts](src/lib/db.server.ts) for the client and `GET /api/health/prisma-engine` for diagnostics.

## Deploy

Configured for Vercel ([vercel.json](vercel.json)). `npm run build` runs `prisma generate && next build`.
