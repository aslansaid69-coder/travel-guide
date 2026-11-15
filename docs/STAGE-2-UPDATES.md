# Stage 2 — weather and durable updates

Stack inspected before changes: Next.js 16.4.6 App Router, React 19.3.1, TypeScript, Tailwind CSS 4.3.5, Node 22, Vercel, Neon Postgres/Auth, GitHub Actions/OIDC. Existing ipcam.kz camera monitoring remains separate. No paid service was purchased.

## Delivered

- Current city-centre conditions and seven forecast days, including temperature/feels-like, humidity, wind/gusts, precipitation probability, UV, sunrise and sunset, attributed to Open-Meteo.
- Rule-based layers, footwear, rain/snow gear, wind and sun protection, humidity/hydration cues, future daylight outdoor window and planning cautions. This is a city forecast, not a mountain forecast or an official weather warning service. No LLM/key is needed.
- Daily source refresh targeting **05:00 Asia/Almaty** (`0 0 * * *` UTC). Hourly weather refresh at minute 17 keeps “current” conditions current between daily runs.
- Durable per-source snapshots, health, timestamps, failure counts, request counts and run history. Invalid/null/stale responses fail validation. Failed sources retain their exact last-good payload and success timestamp. Other sources continue.
- Owner workspace at `/admin/updates`: Run update now, source status, run/source history and email alert delivery state. Both page and API enforce the existing verified owner session.
- After two consecutive failed runs of a job (daily or hourly weather), enqueue one owner email for that incident. More failures do not create repeat emails. Recovery resets the count and resolves any undelivered old alert. Delivery uses stable Resend idempotency keys and bounded retries.
- External content adapters refresh only licensed/authorised sources. New and changed external records are stored as candidates; unreviewed feed changes cannot replace the published version. Publication UI arrives with the catalog/approval stages.

## What is actually refreshing at this stage

| Group                      | Current behaviour                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Weather                    | Real Open-Meteo forecast; one request per hourly/daily run                                                                    |
| Clothing                   | Derived from the validated weather snapshot; old snapshot retained on weather failure                                         |
| Events                     | Imports owner-approved local listings and refreshes any enabled permitted event feeds into candidates                         |
| Places                     | Imports approved guide data; external discovery/reverification awaits stage 3                                                 |
| Restaurants, menus, prices | Adapter slots and logs are ready, but are **not configured** until real owner/partner data sources are supplied in stages 4–5 |

Importing a local guide does not claim an external venue's hours/menu/prices were reverified. Empty restaurant/menu/price data is not fabricated. Disabled/unconfigured optional sources are visible as such, not as successful refreshes. A run can therefore be `partial` while all configured adapters succeed. Real source failures mark it `failed`. Missing required weather setup is `needs_configuration` and does not create a misleading provider-outage alert.

## Hosting and schedules

Three GitHub workflows now serve separate jobs:

- `camera-health.yml`: existing camera health target every 15 minutes.
- `daily-updates.yml`: daily 05:00 Almaty target.
- `weather-refresh.yml`: hourly weather refresh.

They use short-lived GitHub OIDC tokens with exact workflow, immutable repository/owner IDs, main-branch, audience and event restrictions. No new GitHub secret is needed. Each run has a durable idempotency ID; manual runs count at most once per five-minute window and do not consume that day’s scheduled run. An exclusive lease prevents an hourly/daily/manual overlap.

**GitHub scheduled jobs may be delayed or dropped and can be disabled after repository inactivity.** This is a target time, not a guaranteed exact-minute SLA. For tighter timing, configure QStash and run `npm run schedules:configure`, which creates the camera, daily timezone-aware and hourly schedules. Disable the three GitHub schedules when switching; do not run both schedulers. No free scheduler guarantees outage-free execution.

The old Vercel 07:00 cron is removed from `vercel.json`. `/api/cron/events` remains an authenticated compatibility alias for the new durable daily job; it no longer pretends a cache expiry fetched external content.

## Environment setup

Configured server-side database/auth values from stage 1 are preserved. Never put keys in client components or commit `.env*`.

| Variable                                                                | Purpose                                                                       |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `WEATHER_MODE=evaluation`                                               | Free evaluation/prototype endpoint. No key. Current prototype mode.           |
| `WEATHER_MODE=commercial`                                               | Use the customer endpoint with your licensed subscription.                    |
| `OPEN_METEO_API_KEY`                                                    | Required in commercial mode; server-only, never sent in public JSON or logs.  |
| `RESEND_API_KEY`                                                        | Required to deliver owner failure alerts.                                     |
| `ALERT_FROM`                                                            | Sender on a domain verified in your Resend account.                           |
| `ALERT_TO`                                                              | Owner recipient, for example the already-approved `aslansaid69@gmail.com`.    |
| `NEXT_PUBLIC_SITE_URL`                                                  | Canonical production origin and scheduler audience; already configured.       |
| `DATABASE_URL`                                                          | Durable snapshots/history/outbox; already configured.                         |
| `CRON_SECRET`                                                           | Existing secret for trusted manual/server calls; OIDC schedules need no copy. |
| `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | Optional scheduler alternative.                                               |

Resend credentials are not present in the connected deployment at implementation time. Until they are added, delivery is **not active**: the dashboard shows configuration required and the outbox is retained. This is separate from the public mailto contact form, which still uses the visitor's email app. A Gmail address is a recipient, not a verified sending domain. Add the Resend settings in Vercel Production and redeploy; the next job retries eligible queued alerts. Email-provider failures are logged without exposing credentials. Alerts stop retrying after five delivery attempts; investigate the dashboard then.

## Add permitted data feeds

`data/event-sources.json` retains its documented JSON/RSS event contract. Do not substitute publication dates for event dates or scrape Instagram.

`data/update-sources.json` accepts reviewed server configuration, initially empty:

```json
[
  {
    "id": "partner-menu",
    "kind": "menus",
    "label": "Authorised partner menu",
    "url": "https://YOUR_PARTNER_HOST/menu.json",
    "enabled": false,
    "permissionConfirmed": false,
    "permissionNote": "Record the actual licence or owner permission",
    "tokenEnv": "PARTNER_FEED_TOKEN"
  }
]
```

Replace the illustrative URL and confirm permission before enabling. JSON is an array or `{ "items": [...] }`, with stable string IDs, at most 500 records and a 2 MB payload. Allowed kinds: events, places, restaurants, menus, prices. Feed URLs are trusted, reviewed repository configuration, never visitor input. HTTPS only; redirects are refused to avoid credential forwarding. A malformed or empty feed is treated as a failed update and retains its last good snapshot. Final domain-specific menu/price/catalog validation is added with those stages; these generic records remain unpublished candidates.

## Migration and validation

```sh
npm ci
npm run db:migrate
npm test
npm run build
```

Migration `002-source-updates.sql` was tested on the isolated Neon branch `stage-2-updates-test` before application to production. For the optional integration check, configure `.env.stage2-test` with that branch's DATABASE_URL and `INTEGRATION_BRANCH=stage-2-updates-test`, then run `npm run test:updates:integration`. Never point that command at production.

Testing checklist:

- [ ] Current conditions and all seven local forecast dates render; sunrise/sunset and attribution are present.
- [ ] Clothing changes for cold, heat, rain/snow, wind, UV and humidity; no outdoor window is suggested in a dangerous forecast.
- [ ] A malformed/null/stale weather payload is rejected; saved data and success timestamp remain unchanged.
- [ ] One failed source does not stop another source; unconfigured sources are explicit.
- [ ] Two distinct failed job runs create one alert; retries/extra failures do not duplicate it; recovery resets the incident.
- [ ] Mocked email delivery uses correct recipient and stable idempotency key; no real email is sent in tests.
- [ ] Unauthenticated admin/job calls are denied; the correct signed cloud workflow can run.
- [ ] Daily and hourly runs record results in Postgres; duplicate IDs do not inflate failure counts.
- [ ] Desktop/mobile layout, loading/empty/stale states and reduced-motion behaviour remain usable.
- [ ] With real Resend credentials, verify one owner email from a controlled failure incident before relying on delivery.

## Usage and estimated cost

The active weather schedule is roughly **25 HTTP requests/day**, about **750/month**, independent of visitor count. Manual refreshes add requests. Provider billing can weight requests by variable count/forecast length; the admin count is HTTP requests, not a promise of billable units. Browser weather JSON is edge-cached for 60 seconds and polls every 15 minutes; it does not directly call the provider.

For the current prototype, incremental base cost can remain **$0/month within existing Vercel/Neon/GitHub quotas**, plus any domain costs. Low-volume Resend alerts fit its current free allowance (3,000 emails/month, 100/day) once a sender is verified. For commercial launch, budget Vercel Pro (currently $20/month for one developer seat), your selected Open-Meteo commercial subscription and any database overages; the weather subscription's exact price must be confirmed at checkout. Maps/routing, bookings and messaging are not enabled by stage 2 and have separate future costs. No paid plan was activated.

Official references checked 2026-11-16: [Open-Meteo forecast fields](https://open-meteo.com/en/docs), [weather pricing/licence](https://open-meteo.com/en/pricing), [weather terms](https://open-meteo.com/en/terms), [Resend pricing](https://resend.com/pricing), [Resend API](https://resend.com/docs/api-reference/emails/send-email), [GitHub schedule limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [QStash timezone schedules](https://upstash.com/docs/qstash/features/schedules).

## Verification record for this delivery

Unit/contract tests cover weather rules, payload/date validation, last-good orchestration, scheduler restrictions and mocked Resend delivery. Isolated Postgres integration passed retention/timestamps, two-failure alert threshold, deduplication, recovery and job lease checks. The real weather provider returned seven valid forecast days and the populated weather/event APIs returned HTTP 200; unauthenticated owner/job requests returned HTTP 401. Browser access to the local preview was declined, so rendered desktop/mobile visual QA could not be completed in this run. Real Resend delivery remains unverified until the owner adds its credentials.
