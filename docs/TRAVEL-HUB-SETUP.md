# Almaty travel hub — deployment and operations

Implemented on the existing Next.js 16 / React 19 / TypeScript / Tailwind 4 application. Vercel hosts the app; Neon Postgres and managed Neon Auth provide durable records and identity. The original mountain-blue, cream and orange design and direct ipcam.kz streams are retained. RTSP.me is not used.

The owner approved completing stages 3–8 together on 16 November 2026. No paid subscription, payment account or third-party sender was created.

## Start here

Public routes: `/`, `/explore`, `/plan`, `/trip/[random-id]`, `/emergency`, `/privacy`. Clients use `/account` and `/auth/sign-in`. Staff use `/admin/hub`; existing camera and update workspaces remain at `/admin/cameras` and `/admin/updates`.

1. Sign in with the verified owner address already allowed by `OWNER_EMAILS`.
2. Open **Travel desk → Settings**. Enter the legal operator identity, address, final quote/cancellation terms and any return-trip offer. Confirm the deposit percentage and pay-on-arrival setting.
3. Open **Catalog**. Review discovered candidates, correct their location, descriptions and verified hours, supply permitted photos, add real prices and approve the records. The seven original guide places are approved; their unknown prices are deliberately unpriced. No fictional restaurants, menus, ratings, prices or inventory are published.
4. Add real restaurant records and menus. Menu prices use integer minor units internally (100 minor units = 1 major unit for all supported currencies). The UI accepts major currency units. Dietary claims require owner/partner verification.
5. For a bookable tour, activity, transfer, rental or table, enable **Bookable service**, add a dated capacity slot and any blackout. Slot edits update capacity/blackout; create a new slot to change its time/service.
6. Ask a manager/partner to sign in and verify their email, then assign the role and restaurant IDs in Settings. A partner can submit only assigned restaurant menus and cannot read customer requests.
7. Configure email and, if wanted, online payments. Until then, saved plans and manager requests work, and queued messages visibly require configuration. Online card payment is unavailable rather than simulated.

## Environment variables

Set in Vercel → Project → Settings → Environment Variables → **Production**, then redeploy. Keep all secret values server-side. Do not put keys in JSON content, client components or `NEXT_PUBLIC_*` variables.

| Variables                                                                                               | Required for                                      | Current/fallback behaviour                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `OWNER_EMAILS`, `NEXT_PUBLIC_SITE_URL` | Database, identity, canonical origin              | Already provisioned. Preserve the cookie secret; rotating it ends sessions and invalidates signed newsletter preference links.                                                                         |
| `CRON_SECRET`                                                                                           | Trusted manual/server job calls                   | Already configured. GitHub schedules use OIDC and need no copied secret.                                                                                                                               |
| `RESEND_API_KEY`, `ALERT_FROM`, `ALERT_TO`                                                              | Automatic owner failure alerts                    | `ALERT_TO` is the approved owner Gmail. Supply a Resend key and a sender on a verified domain. Gmail is a recipient, not a verified sender domain.                                                     |
| `CONTACT_FROM`                                                                                          | Client confirmations, quotes, recovery, digest    | Optional sender override; falls back to `ALERT_FROM`. Uses the same `RESEND_API_KEY`.                                                                                                                  |
| `WEATHER_MODE`, `OPEN_METEO_API_KEY`                                                                    | Weather                                           | Evaluation mode is active for the prototype. Commercial use requires a licensed subscription and `WEATHER_MODE=commercial`.                                                                            |
| `GOOGLE_PLACES_API_KEY`                                                                                 | Optional Google discovery/live details            | Enable Places API (New), restrict the server key and billing quota. Without it, OSM discovery is used. No Maps browser key is exposed.                                                                 |
| `OVERPASS_ENDPOINT`                                                                                     | Optional dedicated/permitted OSM endpoint         | Default tries two documented public Overpass instances with bounded timeouts. Public availability is not guaranteed. Keep a commercial/dedicated endpoint if your usage grows.                         |
| `ORS_API_KEY`                                                                                           | Road route geometry and provider travel estimates | Optional openrouteservice key. Without it, the map shows a straight-line overview and explicitly estimated travel time/distance.                                                                       |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                                                            | Deposits/full card payments                       | Requires your eligible Stripe business account, correct settlement currencies and provider approval. Do not invent an eligible country or use somebody else’s account. Pay on arrival is configurable. |
| `MENU_AI_URL`, `MENU_AI_KEY`, `MENU_AI_MODEL`                                                           | Optional image/PDF menu extraction                | Full HTTPS URL to an authorised OpenAI-compatible chat endpoint with image/PDF support. Text import works without AI. Results are never published without review. Files are not stored by the app.     |
| `TRANSLATION_AI_URL`, `TRANSLATION_AI_KEY`, `TRANSLATION_AI_MODEL`                                      | Optional Russian translation drafts               | Same endpoint contract; bounded to three pending records per daily run. Owner-entered translations and the curated bilingual guide work without a model.                                               |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`                                                                | Optional instant staff Telegram notifications     | Server-side Bot API. No Telegram account was created.                                                                                                                                                  |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`                                                | Optional transactional SMS reminders              | Requires an approved sender and visitor opt-in. WhatsApp uses a manager deep link; automated WhatsApp templates/inbound inbox are not enabled.                                                         |
| `QSTASH_TOKEN`, signing keys                                                                            | Optional tighter scheduling                       | See stage-2 guide. Disable duplicate GitHub schedules before switching.                                                                                                                                |

Neon Auth provides sign-in codes independently of Resend. Before commercial staff/client rollout, configure your own Neon Auth SMTP and verify email-code delivery, session restoration and sign-out. Existing verified-owner allowlisting is enforced on the server. Managers and partners cannot grant themselves roles.

## Booking and payment flow

1. The browser builds a local draft, optionally auto-suggested from approved catalog entries, current weather, known hours and approximate distances. Local edits are saved on the device. A server save creates a cryptographically random public link and a separate high-entropy edit token; the hash is stored on the plan.
2. Public share links return the plan and version only. They do not return guest contact data, internal notes, message threads, quotes or payment state. A private link or linked verified account is needed for editing and client communication. Emailed private links expire after 30 days. Treat them like passwords.
3. “Book” or “Ask a manager” creates one package request. No booking is claimed as confirmed at this step. A manager edits the itinerary, supplies final total/currency/inclusions/terms and sends a versioned quote. The same public plan link updates.
4. The client reviews the current plan version and approves the quote. Quotes expire in three days by default. Editing the plan invalidates the previous quote for payment.
5. For bookable services, a chosen slot must match the service and exact planned date/time. Capacity is checked under ordered row locks in a Postgres transaction. A package cannot partially reserve slots. Arrival confirmation reserves capacity immediately; Stripe Checkout holds last 35 minutes while Checkout expires after 30 minutes.
6. Stripe success redirects do not mark requests paid. Signed webhooks reconcile the stored session, currency and exact amount. Duplicate provider events cannot add the paid amount twice. A late payment after hold expiry, a changed quote or cancellation enters capacity/refund review; it does not silently overbook or promise an automatic refund.
7. Cancellation releases reservations and flags paid requests for refund review under accepted terms. Weather rescheduling adds a client request; a manager and client agree changes through a new quote. Existing inventory is not silently replaced.

Configure Stripe webhook URL:

`https://YOUR_DOMAIN/api/payments/webhook`

Subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Configure sandbox keys first and test payment, decline, expiration, duplicate webhook, late webhook, cancellation, deposit/balance and capacity conflicts. Live card payment remains unverified until your account credentials are supplied.

## Pricing and routing

Catalog prices support free/fixed/per-person/per-group/range, adult/child values, currency, provenance and update time. Automatic estimates remain labelled as estimates; unknown fees are excluded and counted, rather than shown as free. Meal spend is an estimate based on one to two average menu items per guest. Owner markup, group discount and dated seasonal modifiers are deterministic. Transport is based on estimated city-centre round trips, owner minor-KZT rates and vehicle capacity. The sticky panel shows per-day, per-person and total ranges, plus unpriced lines.

National Bank of Kazakhstan daily rates are dated indicative conversions. They do not change the quote’s settlement currency. ORS road routes are cached for 24 hours; public provider quotas and routing access restrictions can still apply. The fallback is clearly approximate and not live traffic or mountain navigation.

## Source updates and approval

- Default daily target: **05:00 Asia/Almaty** (00:00 UTC). The existing daily GitHub workflow triggers it. The hourly weather worker also checks whether the owner-selected daily hour is due; custom hours are serviced at the hourly worker’s minute 17, not an exact-minute SLA.
- Weather refreshes hourly. Camera monitoring and the communication/reminder worker target every 15 minutes. GitHub can delay/drop schedules or disable inactive repository schedules; use QStash for tighter delivery.
- Daily adapters: real weather, clothing advice, approved events/catalog/restaurants/menus, exchange rates, permitted configured feeds and OSM discovery. A weekly scan flags explicit OSM closure tags; a missing record is not proof of permanent closure. Last-good snapshots and timestamps survive source failure.
- Google discovery stores Place IDs only. Live Google details have attribution and are not copied into a permanent OSM catalog or rendered as Google data on an OSM map. Owners provide independent catalog text/photos. Auto-publish is optional, off by default, and accepts valid independently sourced permitted-feed records rated 4.3+ with 50+ reviews; it does not confirm their prices.
- Instagram KudaFest/Sxodim are credited outbound links. There is no unauthorised Instagram scraper. Add a permitted JSON/RSS feed in `data/event-sources.json`; generic catalog/menu/price feed contracts live in `data/update-sources.json`. Changed external versions enter review and cannot silently replace approved content.
- Menu feeds use `{id,itemId,items:[{id,name,description,price,tags,photo}],currency}`. Price feeds use `{id,itemId,price:{type,min,max,child?,currency,source,updatedAt,note}}`. New records need stable IDs, reviewed HTTPS sources and recorded permission. Owner publication validates the final domain schema.
- Daily runs can be partial when optional services are unconfigured. This is distinct from a real failed source. After two distinct failed daily/weather runs, one owner alert is queued for that incident. Missing Resend credentials remain visible, not reported as delivered mail.

## Communications and privacy

The dashboard shows requests by status, date, manager, group size and quote value, with search, guarded CSV export, client messages, internal notes and audit history. Formula-like CSV values are escaped. Assignment uses language preference when selected, otherwise active workload with deterministic ordering. Client email replies should be handled by the manager; there is no inbound email/WhatsApp ingestion webhook. The website client thread is the durable common conversation, with email notifications and a WhatsApp deep link.

Outbox IDs deduplicate request confirmations, SLA reminders, trip reminders, reviews, recovery and daily digests. Resend requests use provider idempotency keys. Provider failures retry with backoff and remain visible. A one-time recovery email requires separate opt-in and 24 hours of inactivity; marketing requires separate consent. Daily digests require confirmation by email, and include an unsubscribe link. No emails or SMS were sent during automated tests.

Optional analytics are off until consent and contain no client names/contact fields. Reports include consented visits/actions, requests, revenue by currency, average paid order, removed/added places, camera checks and source HTTP counts. They are not external provider invoices and do not claim complete visitor tracking. The PWA caches only a static offline page and icon, never client/admin APIs, quote responses, private plans, video or map tiles. Curated public copy, main UI and weather guidance support English/Russian; source/partner content falls back to English until a reviewed translation is entered. Staff operations and integration error messages currently use English.

## Local setup, tests and deployment

```sh
npm ci
cp .env.example .env.local
# Fill in real server-side configuration; never commit environment files.
npm run db:migrate
npm run dev
```

Production:

```sh
npm test
npm run build
# Apply migration 003 only after testing on a branch, then push main for Vercel deploy.
```

Migration scripts use a dollar-quote-aware SQL splitter for Postgres functions. Existing owner content is preserved by idempotent seeds. Test on a Neon branch first. The isolated integration command is guarded by `INTEGRATION_BRANCH=stage-2-updates-test` in ignored `.env.stage2-test`:

```sh
npm run test:updates:integration
npm run test:hub:integration
```

Vercel: Node 22, build `npm run build`, framework Next.js, production environment variables. GitHub main deploy is connected. Neon must be reachable; include `/assets/fonts/**` in server traces for the PDF route (already configured). New authenticated pages and APIs are excluded from indexing and offline caching. Netlify can run the same Next.js app with its maintained Next.js runtime, the same environment variables/database and an authenticated scheduler pointing to its own canonical origin; GitHub OIDC audience URLs/workflow configuration must match that origin.

## Testing checklist

- [x] Unit/contract tests: prices, unknown fees, currencies, weather/hours, replacements, menu parsing, role scopes, URL restrictions and migration splitting.
- [x] Isolated Postgres: private/public separation, expired email capabilities, optimistic saves, real PDF generation, origin/admin guards, competing reservations, atomic rollback, expired holds, duplicate/mismatched webhooks and cancellation.
- [ ] Desktop/mobile browser layout, keyboard ordering, map clustering and browser persistence (browser preview permission was declined earlier; no workaround was used).
- [ ] Owner/manager/partner/client sign-in with real email delivery and each role’s UI.
- [ ] Resend delivery, newsletter confirmation/unsubscribe, 24-hour recovery, SLA, weather and review messages with a controlled test recipient.
- [ ] Stripe sandbox and live provider webhook flows with an eligible account.
- [ ] AI menu extraction and translation review with the configured provider/model.
- [ ] Owner legal identity, real approved prices/menus/photos, inventory and cancellation terms before taking sales.

## Estimated monthly cost

Planning estimate in USD, checked 16 November 2026; no paid services were activated:

| Service                           | Low-traffic prototype                                       | Commercial planning                                                                     |
| --------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Vercel                            | Existing free tier within its permitted use/quotas          | Pro starts at $20/month plus usage/taxes.                                               |
| Neon                              | Free within current compute/storage quotas                  | Usage-based; current example typical Launch spend is $15/month, not a fixed minimum.    |
| GitHub public scheduled workflows | Typically $0 for standard public-repo runners               | No exact-time guarantee; optional scheduler cost is separate.                           |
| Weather                           | Evaluation/prototype endpoint, roughly 750 HTTP calls/month | Licensed commercial weather subscription; variable selection can affect billable units. |
| OSM discovery/maps                | Bounded community-service usage; no key                     | Dedicated capacity/tile provider may be needed as traffic grows.                        |
| Resend                            | Free allowance currently 3,000 emails/month, 100/day        | A daily digest can exceed this quickly; select a suitable plan.                         |
| Google Places, ORS, AI, SMS       | Disabled without keys                                       | Metered, quota dependent. Set provider budgets before enabling.                         |
| Stripe                            | No online charge until configured                           | Country/account/currency-dependent transaction fees.                                    |

A small commercial launch should plan roughly **$35–75/month for hosting/database/email/scheduling**, plus the selected commercial weather plan, maps/routing/AI/SMS usage, domain and payment fees. This is a budget estimate, not a quote or a subscription purchase.

Official references: [Vercel](https://vercel.com/pricing), [Neon](https://neon.com/pricing), [Resend](https://resend.com/pricing), [Open-Meteo](https://open-meteo.com/en/pricing), [Stripe eligibility](https://stripe.com/global), [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment), [Places policy](https://developers.google.com/maps/documentation/places/web-service/policies), [key-free Maps links](https://developers.google.com/maps/documentation/urls/get-started), [OSM tiles](https://operations.osmfoundation.org/policies/tiles/), [Overpass instances](https://wiki.openstreetmap.org/wiki/Overpass_API), [Private.coffee service](https://overpass.kumi.systems/), [National Bank rates](https://nationalbank.kz/ru/news/tehnicheskie-resursy/7469), [Kazakhstan emergency contacts](https://www.gov.kz/article/19305?lang=en).
