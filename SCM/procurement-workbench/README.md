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

## Weekly plan files (MPP, MDMP, lead times)

Put the newest files in their folders (any subfolder) and publish them:

| Folder | File | Used by |
|---|---|---|
| `MPP/` | Master Production Plan, e.g. `2026/WK43 MPP 2026_R0.xlsx` | Material Plan |
| `MDMP/` | Material Delivery Management Plan, e.g. `2026/MDMP CSAM 2026_WK42_R1.xlsx` | Material Delivery, This Week, Cashflow |
| `Lead Time/` | Supplier lead-time workbook | Material Delivery, Material Plan lead times |

```bash
npm run plans:publish -- --dry-run   # check each file and print its summary
npm run plans:publish                # upload to the local dev server
```

The newest file per folder is picked by the year, week, and revision in its
name; a file already on the server is skipped (`--force` uploads it again).
The spreadsheets are git-ignored. To publish to the hosted site, set
`MPP_PUBLISH_URL` to the site URL and `MPP_PUBLISH_TOKEN` to the secret
configured on the site (at least 32 characters). That token can only upload
these shared plan files.

How the MDMP is read: each project sheet lists PO lines with Incoterms and
payment terms, and per week a `PO`, `OC`, pickup marker (`EXW`/`FCA`/`FOB`)
or the quantity arriving on site; green cells are done. For pickup Incoterms
the vendor invoices in the pickup week (when no marker is set, arrival minus the
observed or lead-time transit); for DAP/DDP in the arrival week. The due date is
the invoice date plus the payment terms (`EOM + N` counts from month end).
Amounts appear once SAP PO detail is uploaded in Supplier Schedule.

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
| `npm run plans:publish` | Publish the newest MPP, MDMP, and lead-time files (see above; `mpp:publish` is an alias) |

## Layout

- `app/` routes: the workbench page, `app/api/workspace/**` (read + sync) and `app/api/files/**` (attachments)
- `components/workbench/` one component per workbench section
- `hooks/` workspace state, derived values, actions, and server sync
- `lib/` framework-free logic (dates, risk, cashflow, parsers, sync engine)
- `server/` API validation, D1 read/write service, attachment (R2) service, HTTP handlers
- `db/` Drizzle schema, row mappers, seed builder; `drizzle/` migrations
- `docs/d1-persistence-design.md` design and decisions for shared storage
- `tests/` unit, integration (local D1 via Miniflare), and SSR smoke tests

## Identity

`lib/auth-headers.ts` reads `oai-authenticated-user-email` (and the optional
percent-encoded full name). `app/chatgpt-auth.ts` keeps the Sign in with ChatGPT
helpers for pages that need them. Access to the workspace is restricted with the
Sites hosting access policy; every saved change records the editor's email.
