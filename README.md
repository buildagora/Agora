# Agora

Agora helps construction buyers find local material suppliers and get real quotes fast. A buyer describes what they need in plain language; an AI assistant refines that into a specific request, matches it against a database of local suppliers and their capabilities, and surfaces ranked supplier options with live product results. An operator-mediated flow then turns a buyer's interest into a verified quote.

> Originally a reverse-auction RFQ marketplace; the active product is now the chat-driven supplier-discovery flow described below. The older RFQ/bid models still exist in the schema. See [.cursor/rules/agora.md](.cursor/rules/agora.md) for the broader product spec (note: partially historical).

## How it works

1. **Chat intake (Gemini).** The home page is a chat assistant. The buyer describes their need; the assistant asks focused clarifying questions until the request is specific enough to search (material + brand + a spec), then hands off.
2. **Supplier search (DB + Gemini).** A lightweight Gemini call classifies the query into a canonical category to filter noise, then the request is matched against the `SupplierCapability` table (curated "what each supplier carries" data), distance-filtered around the buyer's location, and returned as ranked, confidence-coded supplier cards. Big-box retailers (Home Depot, Lowe's) are interleaved as live-catalog cards.
3. **Supplier detail (SerpAPI).** Clicking a supplier runs a live product lookup — SerpAPI Google Shopping for big-box, domain-scoped organic search for distributors — to show real products, images, and links. Results are disk-cached and pre-warmed at search time so the page renders near-instantly.
4. **Operator-mediated quote.** A buyer's interest creates a material request; an operator dashboard supports verifying availability, pricing, and lead time with the supplier. (A Twilio buyer–supplier SMS path also exists but is currently not the primary flow.)

### Data enrichment

The supplier catalog's capability data was enriched with a **Gemini + Google Search crawler**: for each supplier it researches the brands and product lines they carry and writes `SupplierCapability` rows. This is what makes search return meaningful results (≈166 of 203 suppliers enriched, ~5.6k capability rows). The crawler lives in [scripts/crawl-supplier-capabilities.ts](scripts/crawl-supplier-capabilities.ts); SerpAPI/Gemini responses flow through a disk cache so re-runs are cheap. The enriched data ships as a committed seed (see [Database](#database)).

## Stack

- Next.js 16 (App Router) + React 19, Turbopack dev
- PostgreSQL + Prisma 7 (`@prisma/adapter-pg`), local Postgres via Docker Compose
- Google Gemini (`@google/genai`) — chat assistant, query classifier, capability enrichment
- SerpAPI — live supplier/product results
- Custom JWT auth (jose + bcryptjs, cookie sessions)
- Resend (transactional email), Twilio (optional buyer–supplier SMS)
- Tailwind 4

## Prerequisites

- Node.js 20+
- Docker (for the local Postgres) — or your own PostgreSQL 17

## Setup

All commands run from the repo root.

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the local database (Docker):**
   ```bash
   docker compose up -d
   ```
   This runs PostgreSQL 17 as container `agora-pg`, exposed on host port **5433** (5432 is left for any system Postgres). Data persists in a named volume.

3. **Create `.env.local`** in the repo root:
   ```bash
   # Local Docker Postgres (note port 5433)
   DATABASE_URL=postgresql://peyton:agora_dev@localhost:5433/agora_local

   AUTH_SECRET=your-secret-key-at-least-32-characters-long

   # Gemini — chat assistant, search classifier, enrichment crawler
   GEMINI_API_KEY=...
   GEMINI_MODEL=gemini-2.5-flash

   # SerpAPI — live product results on the supplier detail page
   SERPAPI_API_KEY=...

   # Email (Resend)
   RESEND_API_KEY=re_xxxxxxxxxxxxx
   EMAIL_FROM="Agora <onboarding@resend.dev>"

   # Twilio (optional buyer–supplier SMS — leave SID/TOKEN blank in dev to log to console)
   TWILIO_ACCOUNT_SID=
   TWILIO_AUTH_TOKEN=
   TWILIO_FROM_NUMBER=+15551234567
   APP_URL=http://localhost:3000
   ```

4. **Create the schema and load the supplier seed:**
   ```bash
   npm run db:push    # create tables from prisma/schema.prisma
   npm run db:seed    # load the committed supplier catalog + capability data
   ```

5. **Start the dev server:**
   ```bash
   npm run dev                          # http://127.0.0.1:3000
   # for phone/LAN testing:
   npm run dev -- --hostname 0.0.0.0    # then visit http://<your-LAN-IP>:3000
   ```

## Database

The local DB runs in Docker (`docker-compose.yml`). Schema is managed by Prisma; **supplier reference data ships as a committed seed** so every collaborator works against an identical catalog.

### Getting an identical DB (collaborators start here)

```bash
docker compose up -d     # start Postgres (container agora-pg, port 5433)
npm run db:push          # create the schema
npm run db:seed          # load prisma/seed/agora-suppliers.sql
```

You'll have all 203 suppliers and ~5.6k Gemini-enriched capability rows — identical to everyone else — and a clean transactional slate. Create your own test buyer/operator accounts via the app or the auth API.

The seed (`prisma/seed/agora-suppliers.sql`) contains **only** the supplier reference tables (`Supplier`, `SupplierCapability`, `SupplierCategoryLink`, `SupplierContact`). User accounts, material requests, conversations, and analytics are intentionally excluded — they hold real PII and test noise and are never committed.

### Updating the seed (after enrichment changes)

If you re-run the enrichment crawler or edit the catalog, regenerate and commit the seed:

```bash
npm run db:seed:export   # rewrites prisma/seed/agora-suppliers.sql from your local DB
git add prisma/seed/agora-suppliers.sql && git commit -m "Refresh supplier seed"
```

`npm run db:seed` is safe to re-run on a fresh DB. On a DB that already has suppliers it refuses unless you pass `-- --force` (which truncates the reference tables and reloads), or you can wipe entirely with `docker compose down -v`.

> Migration history is currently unreliable on a shadow DB — prefer `npm run db:push` over `db:migrate:dev` until the history is rebaselined.

## Common commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) on 127.0.0.1:3000 |
| `npm run dev -- --hostname 0.0.0.0` | Dev server reachable on your LAN (phone testing) |
| `npm run dev:clean` | Wipe `.next` cache, then `dev` |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run lint` | ESLint |
| `npm run db:push` | Create/update schema from `schema.prisma` (no migration history) |
| `npm run db:seed` | Load the committed supplier seed into the local DB |
| `npm run db:seed:export` | Regenerate the seed file from the local DB |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:generate` | Regenerate the Prisma client |

## Demo recording

A scripted Playwright recorder produces an MP4 walkthrough of the buyer flow (chat → search → supplier detail) with a visible cursor:

```bash
npm run dev -- --hostname 0.0.0.0                 # terminal 1
npx tsx scripts/demo/record.ts                    # terminal 2 → demos/agora-desktop.mp4
npx tsx scripts/demo/record.ts --viewport=mobile  # → demos/agora-mobile.mp4
```

It uses a dev-only `/demo/seed` route to bootstrap location and a clean session. `demos/` is gitignored.

## Project layout

```
src/
  app/          Next.js App Router (pages + /api routes)
    chat/       Gemini chat assistant (home-page entry point)
    search/     Supplier search results
    request/    Supplier detail pages (live SerpAPI product results)
    ops/        Operator dashboard (quote verification)
    buyer/ seller/ supplier/   Role dashboards + nested API
    api/        Cross-cutting API routes (auth, chat, search, sms, health)
  lib/
    ai/         Gemini: chat prompt, query classifier, capability extraction
    search/     Capability search, ranking, distance, category ontology
    suppliers/  Per-supplier SerpAPI adapters + generic site search
    serpCache/  SerpAPI response disk cache
  components/   React components
prisma/
  schema.prisma   Canonical data model
  seed/           Committed supplier reference seed
scripts/
  crawl-supplier-capabilities.ts   Gemini + Google Search enrichment crawler
  db-seed-export.sh / db-seed-import.sh   Seed tooling
  demo/           Playwright demo recorder + cache warmer
```

## Troubleshooting

- **`npm run db:seed` says "schema not found" / Supplier query fails** — run `npm run db:push` first to create the tables.
- **Can't reach the app from your phone** — start with `npm run dev -- --hostname 0.0.0.0` and visit your machine's LAN IP, not `localhost`.
- **DB connection refused** — make sure `docker compose up -d` is running and `DATABASE_URL` points at port **5433**.
- **Supplier detail page is slow on first click** — the live SerpAPI lookup is cold; subsequent loads hit the disk cache. Search pre-warms the top results.
- **"Engine type client" Prisma error** — remove any stray `PRISMA_CLIENT_ENGINE_TYPE` / `PRISMA_ENGINE_TYPE` vars from `.env.local`; fall back to `npm run dev:webpack` if it persists.
- **Don't import `@prisma/client/runtime/*`** in route handlers (incompatible with Turbopack) — use [src/lib/db.server.ts](src/lib/db.server.ts).

## Deploy

Configured for Vercel ([vercel.json](vercel.json)). `npm run build` runs `prisma generate && next build`. Production needs a hosted Postgres (`DATABASE_URL`) plus the Gemini, SerpAPI, auth, and email env vars.
