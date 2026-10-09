# CSWind America Procurement Workbench

Wind tower procurement workspace: deliveries, supplier schedules, BOM, logistics,
cashflow, NCR, ECN, and MCIP budget tracking. Runs as a Next.js app on Cloudflare
Workers via [vinext](https://github.com/cloudflare/vinext), with data shared
through Cloudflare D1.

## Prerequisites

- Node.js `>=22.13.0`

## Local development

```bash
npm install
npm run db:migrate:local      # create tables + demo data in the local D1 (.wrangler/)
echo VITE_DEV_USER_EMAIL=you@example.com > .env.development.local
npm run dev
```

The hosted site identifies users with Sites identity headers. The dev server has
none, so `VITE_DEV_USER_EMAIL` stands in for a signed-in user. It only applies in
dev mode and is compiled out of production builds. Without it the app runs in
"This device only" mode.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (`dist/`, includes `drizzle/` migrations) |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm test` | Unit + D1 integration tests (vitest), then build and SSR/API smoke tests |
| `npm run db:generate` | Generate a Drizzle migration after editing `db/schema.ts` |
| `npm run db:seed-sql` | Regenerate the demo seed migration from `lib/seed-data.ts` |
| `npm run db:migrate:local` | Apply migrations to the local dev D1 |

## Layout

- `app/` routes: the workbench page and `app/api/workspace/**` (read + sync API)
- `components/workbench/` one component per workbench section
- `hooks/` workspace state, derived values, actions, and server sync
- `lib/` framework-free logic (dates, risk, cashflow, parsers, sync engine)
- `server/` API validation, D1 read/write service, HTTP handlers
- `db/` Drizzle schema, row mappers, seed builder; `drizzle/` migrations
- `docs/d1-persistence-design.md` design and decisions for shared storage
- `tests/` unit, integration (local D1 via Miniflare), and SSR smoke tests

## Identity

`lib/auth-headers.ts` reads `oai-authenticated-user-email` (and the optional
percent-encoded full name). `app/chatgpt-auth.ts` keeps the Sign in with ChatGPT
helpers for pages that need them. Access to the workspace is restricted with the
Sites hosting access policy; every saved change records the editor's email.
