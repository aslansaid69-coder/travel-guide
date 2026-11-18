# November 19 platform extension

Checkout/payment status, independent research and price review, guide profiles/invitations/calendars/matching, private trip chat/gallery/safety, owner payment/refund/transfer tools, assistant, bot hooks, deals/waitlists, loyalty and operations scheduling now extend the existing guide. Start with [Platform setup and practical limits](docs/PLATFORM-SETUP.md) and [UI state audit](docs/UI-STATE-AUDIT.md). Provider keys/eligibility remain required for real payments and message delivery. See the release report for actual verification; no browser accessibility score is claimed.

Client requests: **[Travel desk](https://almaty-travel-guide.vercel.app/admin/hub)**. Other owner workspaces: `/admin/research`, `/admin/guides`, `/admin/payments`. Public guides: `/guides`; invited guide workspace: `/guide`. No fictional guide profiles, restaurants, menus or prices are seeded.

# Almaty, with love — travel hub

The existing guide now includes an approved catalog/map, restaurants/menus, itinerary builder, share/PDF, package booking requests, inventory, quotes/payments integration, staff dashboard and owner insights. Start with [Travel hub setup](docs/TRAVEL-HUB-SETUP.md) for credentials, role assignment, source permissions, booking workflow, deployment and testing. Existing camera/weather operations continue below.

# Almaty, with love

A responsive English travel guide built with **Next.js 16, React 19, TypeScript, and Tailwind CSS 4**. Includes real Tian Shan photography, click-to-load live webcams, attributed event listings, seven places, travel tips, and an email contact form.

## Run locally

Use Node.js 22 LTS (the deployed runtime).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. For production:

```sh
npm test
npm run build
npm start
```

Fonts and photos are served locally. No Google Fonts request, remote image key, or webcam API key is required. The site works with curated events before any feed is configured. Contact is configured as an email-app draft form addressed to the owner’s approved Gmail address; no email API key is needed. Visitors review and send the draft in their own email app. Optional server delivery remains available for a future Resend setup.

## Current deployment

Live: https://almaty-travel-guide.vercel.app

The Vercel project is connected to GitHub `main`; pushes trigger production builds. The production domain and daily-refresh secret are already configured. The durable daily update targets 05:00 Asia/Almaty, and current weather refreshes hourly through signed GitHub workflows. A separate Codex daily content review is active at 08:30 Asia/Almaty and requires the computer and desktop app to be running. See [operations](docs/OPERATIONS.md).

## Deploy to Vercel

1. Import `aslansaid69-coder/travel-guide` into Vercel. Select Next.js and Node 22. Repository root is the project root.
2. Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS domain. This controls canonical URLs, Open Graph URLs, robots.txt and sitemap.xml. Redeploy after changing it.
3. Add a strong `CRON_SECRET` (for example, generate one using `openssl rand -hex 32`).
4. The default email-app form needs no credentials. Only add Resend credentials if switching `data/site.json` contactMode to `server`.
5. Deploy. The workflows in `.github/workflows` call the daily and hourly update endpoints with GitHub OIDC. The daily target is **00:00 UTC / 05:00 Almaty**. GitHub may delay scheduled runs. `vercel.json` no longer schedules the older 07:00 cache-only cron. See [stage 2 setup](docs/STAGE-2-UPDATES.md) for QStash as an alternative.

## Deploy to Netlify

Import the same repository. `netlify.toml` sets `npm run build`, `.next`, and Node 22. Netlify's Next.js adapter provides SSR, route handlers, image optimization and ISR; this is **not** a static export. Set the same environment variables in the Netlify dashboard. [Netlify Next.js documentation](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

For Netlify, update the workflow destination URLs and NEXT_PUBLIC_SITE_URL to the deployed origin, or configure QStash. The server endpoints accept signed scheduler calls or your CRON_SECRET Bearer header. Do not put that secret in a public URL, client code, or repository.

## Manual configuration

| Setting                   | Purpose                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`    | Your deployed canonical HTTPS URL. Default is localhost for development.                          |
| `RESEND_API_KEY`          | Optional server-only Resend email key; unused by email-app mode.                                  |
| `CONTACT_FROM`            | Sender on a domain verified in your Resend account.                                               |
| `CONTACT_TO`              | Your inbox receiving contact submissions.                                                         |
| `CRON_SECRET`             | Protects daily cache refresh; endpoint denies access when unset.                                  |
| `data/site.json`          | Approved contact address and third-party local source links (KudaFest and Sxodim).                |
| `data/event-sources.json` | Only feeds whose owner permits ingestion and republication. Empty by default.                     |
| Source permissions        | Confirm continued webcam embedding and any event-feed/image permissions with the relevant owners. |

If enabling optional server email delivery, enable your host's rate limiting/bot protection for `/api/contact`. The route already checks origin, content type and input, uses a honeypot, and sends plain text. It stores no messages in this app, but delivery uses Resend. A provider timeout is reported as a send failure; check your provider logs before retrying repeatedly. Never commit `.env.local` or API keys.

## Structure

```text
app/                  Homepage, credits, SEO and API routes
components/           Header, cameras, events, places, tips, contact
lib/                  Event validation/feeds/date window, cache, contact validation
data/                Curated, editable configuration (see below)
public/images/        Locally hosted licensed Almaty photographs
scripts/refresh-events.ts   Optional feed-to-JSON maintenance command
tests/                Date-window, permission, parsing and contact tests
docs/INTEGRATIONS.md   Camera investigation and source details
```

## Weather and automatic updates — stage 2

The homepage now includes current conditions, seven forecast days, clothing advice, planning cautions and an outdoor window beside the cameras. Durable per-source snapshots retain last-good data during outages. `/admin/updates` shows source/run/alert history and provides Run update now. The daily workflow targets 05:00 Almaty; weather refreshes hourly.

Open-Meteo evaluation mode serves this prototype. Before commercial operation, set WEATHER_MODE=commercial and OPEN_METEO_API_KEY. Owner failure alerts use Resend after two consecutive failed runs; delivery requires RESEND_API_KEY, ALERT_FROM (verified sender) and ALERT_TO. Missing credentials remain explicit in the owner dashboard.

See [full setup, source contracts, budget and testing checklist](docs/STAGE-2-UPDATES.md). Restaurant/menu/pricing adapters remain unconfigured until their later stages receive real data; no successful external refresh is claimed for them.

## Cameras — upgraded stage 1

Only direct ipcam.kz HLS streams remain. RTSP.me, World-Cam links and external-player fallback cards are removed. The owner's 2026-11-16 instruction explicitly retains ipcam.kz. `data/cameras.json` is the approved seed; live configuration and health now persist in Postgres.

- `/api/cameras`: public visible cameras; unavailable database fails closed.
- `/admin/cameras`: owner workspace, email-code login, status/history, validate-and-publish, manual hide/show, run check.
- `/api/jobs/cameras`: signed scheduler or server-secret endpoint. A public caller cannot trigger checks.
- `.github/workflows/camera-health.yml`: target every 15 minutes (7, 22, 37, 52 past each hour), short-lived GitHub OIDC identity. No repository secret is needed. GitHub can delay scheduled runs; use the optional QStash setup for tighter scheduling.

The monitor validates redirects, every embedded HLS URI, a media playlist and real MPEG-TS/fMP4 segment bytes, with DNS pinning/private-address rejection and bounded downloads. Three consecutive failed windows hide the camera; a later passing check restores it unless manually hidden. World-Cam/RTSP.me incidents create a persistent block and are never automatically restored. Visual overlays or successful browser decoding cannot be inferred from a server segment probe; an actual player shows Live now only while video is playing. New cameras currently accept HLS only; unsupported embeds are rejected.

Setup (already applied to the connected production database):

```sh
npm run db:migrate
```

Staff env: `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `OWNER_EMAILS`. Staff API/page authorization is enforced server-side and requires a verified email in the owner allowlist. Managed shared auth email is available for initial testing; configure a custom SMTP sender before production staff rollout. No password is stored by this app. The owner completes the email code sign-in themselves.

Additional hosts require `CAMERA_ALLOWED_HOSTS` in Vercel; add exact approved operator/CDN hosts, never wildcard domains. The admin must record embedding permission for every added feed. To use QStash instead of GitHub scheduling, set the three `QSTASH_*` values from `.env.example`, run `npm run schedules:configure`, and disable the GitHub workflow; do not run both.

See [architecture and stage gates](docs/UPGRADE-ARCHITECTURE.md) and [camera audit](docs/CAMERA-AUDIT.md). The larger travel-hub features are delivered in eight owner-confirmed stages. Stages 1–2 are implemented; stages 3–8 await their respective work and confirmation.

## Events

Edit `data/events.json` for curated events. Every item needs:

```json
{
  "id": "unique-event-id",
  "title": "An English event title",
  "startDate": "2026-12-01T19:00:00+05:00",
  "place": "Venue, Almaty",
  "category": "Music",
  "description": "Your original short summary, or text the source permits you to reuse.",
  "image": "/images/kok-tobe.jpg",
  "imageAlt": "Almaty city scenery, not an event photograph",
  "imageLabel": "Almaty city scenery",
  "sourceName": "The organiser",
  "sourceUrl": "https://organiser.example/event",
  "verifiedAt": "2026-11-15"
}
```

The URL above is an illustrative schema example, not an enabled source. If no time is known, use `YYYY-MM-DD` with `dateOnly: true`; do not invent a start time. Use `endDate` for multi-day events. Valid categories are open-ended; the existing quick filters cover Music and Outdoors, and All events displays every category. Keep English titles, descriptions and venue labels.

The date window uses **Asia/Almaty**, including events ending in the last 30 calendar days, ongoing events, and upcoming events. Expired items are removed from the public response without editing files. Dates are event dates, never a post's publication date. Duplicate IDs are merged, with an authorised feed's update taking precedence.

### Authorised daily feeds

Add sources to `data/event-sources.json` only after confirming permission. Example (disabled until you replace it):

```json
[
  {
    "id": "your-partner",
    "name": "Your partner calendar",
    "url": "https://YOUR_PARTNER_DOMAIN/events.json",
    "format": "json",
    "enabled": false,
    "permissionConfirmed": false,
    "permissionNote": "Record the licence or written permission here",
    "tokenEnv": "EVENTS_FEED_TOKEN"
  }
]
```

JSON feeds use the event schema above, either an array or `{ "events": [...] }`. Omit `tokenEnv` for a public authorised feed. Private credentials are read server-side from that environment variable. HTTPS only; redirects are rejected to avoid forwarding credentials. Feed URLs are trusted administrator configuration, never user-supplied request parameters.

RSS feeds must contain `event:startDate`, optional `event:endDate`, and `event:location`, plus title, description and link. Use `xmlns:event="urn:almaty:event"` or your agreed partner namespace. Ordinary news RSS is not an event calendar. Items without explicit valid event dates are skipped. Remote images are not imported automatically; add licensed images under `public/images` first.

The daily job persists a separate last-good snapshot for every permitted feed. Failed feeds retain their payload and success timestamp. New/changed external records go into `content_candidates`; only approved published versions are exposed to visitors. The open browser refreshes the approved event list hourly, and expired records are filtered by Almaty date. `/api/events` never exposes feed credentials.

```sh
npm run events:refresh
```

This legacy optional local command fetches enabled permitted feeds and rewrites `data/events.json`; do not run it as unattended publication because new candidates require owner review. Review every imported record and the diff before committing it. The cloud job uses durable candidate/snapshot tables instead. If tokens live in `.env.local`, export them first or run `node --env-file=.env.local --import tsx scripts/refresh-events.ts`.

KudaFest and Sxodim are linked as independent local sources. No Kuda Almaty, KudaFest, Sxodim, Instagram or ticketing-site scraper is enabled. No verified reusable event feed was found, so the shipped data contains three manually verified, attributed listings. Add a licensed feed for new automatic discoveries. Instagram Graph API integration would require the account owner's authorization and appropriate current Meta permissions. oEmbed displays known public posts; it is not an event discovery API and does not supply event dates.

## Images, accessibility and performance

`data/photo-credits.json` records photographer, original URL, licence and modifications for every image. `/credits` exposes the attributions. Hero/Shymbulak image adaptations retain CC BY-SA 4.0; other images use CC BY or CC0. These licences concern the images, not the application code. Event cards use clearly labelled editorial city photographs, not unlicensed event posters.

Next Image optimises and lazy-loads imagery; the hero alone is prioritised. Fonts are locally bundled through `next/font/local`. Semantic navigation, visible focus states, a skip link, labelled forms, native details/summary tips and reduced-motion support are included. There is no autoplay sound or video download before a click.

## Checks

`npm test` verifies event date boundaries, malformed records, source permissions, RSS semantics, feed failure fallback and mocked contact delivery. `npm run build` performs the production compilation and TypeScript check. Tests do not send real emails. Real email delivery needs your credentials and a test from your deployment; webcams remain external dependencies.
