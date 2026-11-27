# CLAUDE.md — Almaty Travel Guide

@AGENTS.md

## Stack

- **Next.js 16.4 (App Router) + React 19.3 + TypeScript (strict) + Tailwind CSS 4.** Next 16 differs from older versions:
  read `node_modules/next/dist/docs/` before using an API. `middleware.ts` is renamed to **`proxy.ts`**.
  Build uses webpack (`next build --webpack`).
- **Database:** Neon Postgres via `@neondatabase/serverless` (`lib/db.ts` → `database()` tagged-template SQL).
  **No ORM.** Schema lives in ordered SQL files in `migrations/` applied by `scripts/migrate.ts`.
  Many entities (catalog items, settings, guides) are stored as `jsonb` and validated with **zod** schemas
  (`lib/hub/types.ts`, `lib/platform/types.ts`).
- **Auth:** Neon Auth (`@neon/auth`), email one-time-code sign-in, proxied by `app/api/auth/[...path]/route.ts`.
  Roles: OWNER / ADMIN / GUIDE / TOURIST (+ legacy PARTNER). Pure RBAC in `lib/auth/roles.ts` (`can`, `PERMISSIONS`);
  server helpers in `lib/auth/session.ts` (`currentUser`, `authorize(permission)` for actions/APIs,
  `requirePage(permission)` for pages). OWNER comes only from `OWNER_EMAILS`; other roles live in `staff_roles`.
  `proxy.ts` gates `/admin/**` (owner/admin) and `/account`, `/guide` (signed in); every handler re-checks.
  Legacy helpers `lib/hub/access.ts` (`staffSession`, `requireStaff`) map DB `manager` → `admin`.
- **Payments:** Stripe hosted Checkout + webhook `app/api/payments/webhook/route.ts` (`lib/platform/commerce.ts`).
- **Maps:** Leaflet + OpenStreetMap tiles (`components/hub/map.tsx`); optional OpenRouteService for road routes.
- **Places discovery:** Google Places API (New) / OSM Overpass / Wikipedia (`lib/hub/discovery.ts`, `lib/platform/research.ts`).
- **Hosting:** Vercel (Node 22). Scheduled jobs via GitHub Actions OIDC (`.github/workflows`) or QStash.

## Layout

```
app/                 pages + route handlers (api/hub/[...path], api/platform/[...path] are big dispatchers)
app/admin/*          staff workspaces (hub, guides, payments, research, updates, cameras)
components/hub       public catalog/planner/map + travel-desk admin UI (admin.tsx is large)
components/platform  guides, checkout, trip, assistant (extras.tsx), payments admin
lib/hub              catalog, plans, bookings, routing, discovery, security helpers (HttpError, origin, body, limit)
lib/platform         guides, commerce (Stripe), research, assistant, payouts, jobs
lib/{cameras,updates,weather}  live cameras, daily source refresh, weather
migrations/          NNN-name.sql, additive + rerunnable (IF NOT EXISTS / CREATE OR REPLACE)
scripts/             migrate, schedules, integration tests (need a separate Neon branch)
tests/               node:test unit tests (`*.test.ts`, run through tsx)
data/                curated seed JSON (places, cameras, events, site)
docs/                setup / ops / architecture notes
```

## Commands

```bash
npm ci
npm run dev            # http://localhost:3000
npm test               # unit tests (node --test via tsx)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run build          # production build (must pass)
npm run db:migrate         # applies pending migrations (tracked in schema_migrations) using .env.local
npm run db:migrate:status  # dry run: lists pending migrations
npm run db:migrate:prod    # same runner, env taken from the shell (CI / production)
```

Run migrations against a **Neon dev branch** first; never run integration scripts against production.
A local Postgres 16 can be used for smoke-testing SQL (`DATABASE_URL=postgres://...`), but `@neondatabase/serverless`
needs a Neon (HTTP) endpoint at runtime.

## Environment variables

See `.env.example` (authoritative list). Core: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_AUTH_BASE_URL`,
`NEON_AUTH_COOKIE_SECRET`, `OWNER_EMAILS`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`. AI: `ANTHROPIC_API_KEY`
(server only). Places: `GOOGLE_PLACES_API_KEY`. Payments: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
Everything except `NEXT_PUBLIC_*` is server-only — never import secrets into client components.

## Conventions

- TypeScript strict, **no `any`**; validate every external input (request bodies, query, provider responses) with zod.
- Authorization is enforced **on the server** for every page, route handler and server action — never only in UI.
  Throw `HttpError(status, message)`; route dispatchers turn it into JSON.
- State-changing requests: `origin(request)` (same-origin check) + `limit(request, key, max)` (DB rate limit).
- Every admin mutation writes to `admin_audit` via `recordAudit()` (`lib/audit.ts`: who, role, action, target, details, IP, time).
- New admin pages live under `app/admin/*` (layout enforces `admin.access`), use server actions that start with
  `authorize(...)`, validate `FormData` with zod (`lib/admin/form.ts`) and paginate via `lib/admin/list.ts`.
- Money is integer minor units (`*_minor`) + ISO currency. Never invent prices: unknown stays `null` / "not found".
- Migrations: add a new numbered file, keep it idempotent, register it in `scripts/migrate.ts`. Never edit an applied one.
- UI copy supports EN/RU (`components/hub/language.tsx`); keep both when adding strings.
- Respect provider terms: Google Places content needs attribution and must not be cached beyond what the terms allow
  (only `place_id` may be stored indefinitely).
