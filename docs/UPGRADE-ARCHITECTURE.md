# Travel hub upgrade — architecture and stage gates

Inspected 2026-11-16 before implementation. Keep the mountain-blue / cream / orange design and the existing application.

## Stack found

Next.js 16.4.6 App Router, React 19.3.1, TypeScript, Tailwind CSS 4.3.5, hls.js 1.7.4, Node 22 LTS, Vercel with GitHub main-branch deployment. Data was JSON; events used a cached route and daily cron. Contact used a mailto draft. No durable database, staff identity, bookings, payments, or transactional job history existed.

## Target structure

- **Next.js:** existing public pages plus weather, catalog/map, restaurants, itinerary editor, checkout, share pages, and a protected staff workspace. Keep browser editing responsive and accessible; use drag controls plus keyboard move buttons.
- **Postgres:** Neon stores catalog and published versions, approval queues, menus, prices, itinerary snapshots, orders, inventory, jobs, audit events, subscriptions and consent. Stage 1 provisions the operational database and camera tables only.
- **Identity:** Managed Neon Auth for staff/client sessions. Server-enforced owner, manager, partner and client scopes; a role is never accepted from a browser. Owner email-code login is the first slice. Manager and partner assignments arrive with their workflows. Partner restaurant access is by assigned restaurant IDs.
- **Schedules:** GitHub Actions for the initial 15-minute camera target, authenticated by short-lived signed OIDC tokens restricted to this repository/workflow/main branch. Scheduled Actions can be delayed/dropped; use QStash for tighter scheduling and retries. QStash signature support and a setup script are included. Do not enable both schedulers. The 05:00 Asia/Almaty daily refresh and weekly closure scan arrive in stages 2–3; jobs use durable leases, run IDs and last-good snapshots. Current daily event cron remains until replacement.
- **Integrations:** server adapters for weather, Places/OSM, routes, rates and allowed event feeds. Cache and log each provider separately. A failed provider retains its last-good snapshot and flags its age; it never overwrites valid data with an empty response. Two consecutive failed runs create one deduplicated notification in an outbox.
- **Maps:** Google Maps when licensed keys and billing limits are configured; OSM data with an approved tile provider and clustering as fallback. Server-only Places key; if Google Maps JavaScript requires a public browser key, restrict it to domains and APIs. Never expose a server key. Approximate straight-line distances must be labelled; live road travel times require a routing provider.
- **Itineraries:** anonymous client-side draft saved locally; durable random share ID plus separate high-entropy edit capability stored as a hash. Public share views exclude contact details. Versioned prices, plan changes, conflicts and an approval snapshot prevent stale quotes. PDF export generates a readable real document. Email capture and recovery require explicit consent; no reminder to an address merely typed into an unfinished form.
- **Pricing:** integer minor units, explicit currency, min/max, adult/child or group basis, effective dates, source/confidence and confirmation date. Store a quote snapshot for each order. Exchange rates are dated and estimated; a displayed conversion does not change settlement currency. Markup/group/season rules have deterministic order and audit history.
- **Inventory and orders:** one package order with line items and a state machine. Reserve inventory atomically in Postgres using transactional constraints/capacity checks, expiration and idempotency keys. Stripe Checkout/webhooks reconcile paid state; the browser cannot mark an order paid. Pay-on-arrival is supported when enabled. Slot holds expire and are released on cancellations. Weather alternatives require client consent.
- **Messages:** durable notification outbox for owner alerts, quote links, reminders and reviews; provider delivery IDs and retries. Resend for email, optional SMS/WhatsApp provider, Telegram Bot API for staff. Do not call a mailto draft automatic delivery.
- **Analytics/privacy:** first-party event aggregates, consent-aware optional analytics, no raw itinerary contact information in public analytics, retention policies and CSV export scoped by role. Cookie banner reflects actual optional cookies. PWA caching excludes admin, auth, API responses with private information, and checkout.

## Stage delivery and confirmation

| Stage | Concrete deliverable and verification                                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Architecture, direct ipcam.kz cleanup, camera state/logs, owner Cameras page, add/validate/hide/show, scheduler and security tests. Pause for owner review.          |
| 2     | Current + seven-day weather, rule-based clothing/risk/activity hints, daily 05:00 job framework, last-good snapshots, run logs and deduplicated owner alerts. Pause. |
| 3     | Place discovery adapters, owner pending queue, editable catalog, hours and permanent-closure scan, map filters/clusters and routing. Pause.                          |
| 4     | Approved restaurants, menu editing and partner scope, reviewed menu import, price/dietary data and open-now calculation. Pause.                                      |
| 5     | Editable itinerary, weather/hour/travel conflicts, replacements, map routes, live range pricing, anonymous save/share and PDF. Pause.                                |
| 6     | Capacity inventory, package booking, guest preferences, payment or arrival option, provider webhooks, cancellation/reschedule and reminders. Pause.                  |
| 7     | Manager CRM, assignment/SLA, versioned quote approvals/payment links, internal notes/history, communication, analytics and reviews. Pause.                           |
| 8     | English/Russian, emergency guidance, newsletter/digest, consent/privacy, SEO schemas and PWA. Pause.                                                                 |

## Service keys and owner inputs

| Service          | Server configuration / owner decision                                                                                                                                                                                                                  | Needed at stage |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| Neon             | DATABASE_URL, NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET, OWNER_EMAILS. Provisioned for stage 1; use custom SMTP before production staff rollout.                                                                                                     | 1               |
| Cameras          | CAMERA_ALLOWED_HOSTS for new providers; documented embedding permission. ipcam.kz is retained by the owner's explicit latest instruction.                                                                                                              | 1               |
| Scheduler        | GitHub Actions works without new secrets using OIDC. Optional QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY for tighter scheduling. Existing CRON_SECRET remains server-only.                                                      | 1–2             |
| Weather          | Open-Meteo commercial subscription/API key or OpenWeather key for a commercial booking site; free Open-Meteo endpoint is noncommercial only.                                                                                                           | 2               |
| Alerts/email     | RESEND_API_KEY, CONTACT_FROM verified sender, CONTACT_TO; or TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. The current mailto form remains separate.                                                                                                        | 2               |
| Places/maps      | GOOGLE_PLACES_API_KEY (server), restricted browser Maps key if using Google JS, API billing caps, map IDs as needed. OSM-based providers have attribution and usage policies too.                                                                      | 3               |
| Routing          | Chosen road-routing provider/key if Google Routes is not used; cached estimates as fallback.                                                                                                                                                           | 3/5             |
| Menus/uploads    | Object storage credentials and model-provider key only for AI parsing. Owner supplies permitted menus/photos; all parses need review.                                                                                                                  | 4               |
| Payments         | Stripe business account eligibility, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, settlement currency, deposit/refund policy. A Kazakhstan-based owner must first verify Stripe account-country eligibility; never fake an unsupported business location. | 6               |
| SMS/WhatsApp     | Selected provider credentials, approved sender/templates and explicit customer consent.                                                                                                                                                                | 6–7             |
| Business content | Legal operator identity/contact, policies, real services/prices, capacities, managers, dietary claims and emergency/embassy sources.                                                                                                                   | Before sales    |

## Budget estimate (planning, USD/month)

These are estimates, not subscriptions activated by this upgrade. Check linked live pricing before purchase.

- Stage-1 prototype: $0 base on existing Hobby + Neon Free + public GitHub standard runners while within quotas. Approximately 2,880 scheduled checks/month and three cameras × about three HTTP reads per check; media stays provider-to-visitor, not proxied through the app.
- Commercial booking launch: budget $20–60/month for hosting and light database/scheduler/email use, plus metered maps/routing, optional AI and messaging, and payment transaction fees. Vercel Pro starts around $20/month for one seat; Neon usage depends on active compute. Set provider budgets before enabling discovery.
- QStash Free currently allows 1,000 messages/day, above the 96 camera checks/day target. Extra workflows/retries consume quota. GitHub scheduled runs have timing limitations and may be disabled after repository inactivity.
- Places discovery should be bounded by area/category and a weekly or daily cap; do not discover on every visitor request. Cache only fields and durations the provider licence permits. Prices/hours retain provenance and timestamps.

Sources checked 2026-11-16: [Vercel pricing](https://vercel.com/pricing), [Hobby terms](https://vercel.com/docs/plans/hobby), [cron limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing), [Neon pricing](https://neon.com/pricing), [QStash pricing](https://upstash.com/pricing/qstash), [GitHub scheduled workflow limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [Open-Meteo terms](https://open-meteo.com/en/terms), [Stripe countries](https://stripe.com/global).
