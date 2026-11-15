# Almaty, with love

A responsive English travel guide built with **Next.js 16, React 19, TypeScript, and Tailwind CSS 4**. Includes real Tian Shan photography, click-to-load live webcams, attributed event listings, seven places, travel tips, and an email contact form.

## Run locally

Use Node.js 22 or newer.

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

Fonts and photos are served locally. No Google Fonts request, remote image key, or webcam API key is required. The site works with curated events before any feed is configured. Contact delivery requires the variables below; it never pretends to send a message when they are absent.

## Deploy to Vercel

1. Import `aslansaid69-coder/travel-guide` into Vercel. Select Next.js and Node 22+. Repository root is the project root.
2. Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS domain. This controls canonical URLs, Open Graph URLs, robots.txt and sitemap.xml. Redeploy after changing it.
3. Add a strong `CRON_SECRET` (for example, generate one using `openssl rand -hex 32`).
4. Add email credentials if you want the contact form to deliver messages.
5. Deploy. `vercel.json` schedules `/api/cron/events` daily at **02:00 UTC / 07:00 Almaty**. Vercel sends the secret in an Authorization Bearer header. Confirm cron availability on your plan.

## Deploy to Netlify

Import the same repository. `netlify.toml` sets `npm run build`, `.next`, and Node 22. Netlify's Next.js adapter provides SSR, route handlers, image optimization and ISR; this is **not** a static export. Set the same environment variables in the Netlify dashboard. [Netlify Next.js documentation](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

On-demand daily revalidation works on both hosts. Vercel's cron configuration is Vercel-specific. For a timed Netlify refresh, configure your scheduler to GET `https://YOUR_DOMAIN/api/cron/events` with `Authorization: Bearer YOUR_CRON_SECRET` once daily. Do not put that secret in a public URL, client code, or repository.

## Manual configuration

| Setting                   | Purpose                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`    | Your deployed canonical HTTPS URL. Default is localhost for development.                          |
| `RESEND_API_KEY`          | Server-only Resend email key; needed for contact delivery.                                        |
| `CONTACT_FROM`            | Sender on a domain verified in your Resend account.                                               |
| `CONTACT_TO`              | Your inbox receiving contact submissions.                                                         |
| `CRON_SECRET`             | Protects daily cache refresh; endpoint denies access when unset.                                  |
| `data/site.json`          | Your own Instagram/Facebook URLs; empty values hide links rather than invent accounts.            |
| `data/event-sources.json` | Only feeds whose owner permits ingestion and republication. Empty by default.                     |
| Source permissions        | Confirm continued webcam embedding and any event-feed/image permissions with the relevant owners. |

Before opening email delivery publicly, enable your host's rate limiting/bot protection for `/api/contact`. The route already checks origin, content type and input, uses a honeypot, and sends plain text. It stores no messages in this app, but delivery uses Resend. A provider timeout is reported as a send failure; check your provider logs before retrying repeatedly. Never commit `.env.local` or API keys.

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

## Cameras

Edit `data/cameras.json`. Supported `type` values:

- `hls`: HTTPS `.m3u8` stream; native HLS on Safari, dynamically imported hls.js elsewhere.
- `iframe`: an explicitly supplied embed URL, including a permitted YouTube live embed.
- `external`: a source-link card when embedding is unavailable.

Each entry contains `id`, `name`, `location`, `type`, `streamUrl`, `sourceUrl`, `sourceName`, `poster`, `posterAlt`, `verifiedAt`, and `note`. Use an independently licensed local poster and descriptive alt text. The caption explicitly identifies posters as scenic previews.

Players make no provider requests until a visitor clicks. HLS errors/timeouts show a **Watch live** source link. A **Live now** pulsing badge appears only after video begins playing. Cross-origin iframes cannot reliably report internal stream errors to this app, so the source link remains visible beneath them. Third-party player interfaces can use the visitor's browser language or the provider's language; all guide-owned text is English.

Verified 2026-11-15: three HLS manifests returned HTTP 200 with CORS; Medeu's published iframe returned HTTP 200 but its player reported provider-side access restricted; the older cam2 feed returned 404. Both are configured as external fallbacks. A tested HLS player timed out in the in-app browser and correctly displayed its source fallback; full live playback was not confirmed there. Source response is not a guarantee of continuous playback. Full URLs and evidence are in `docs/INTEGRATIONS.md`.

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

The server cache expires after 86,400 seconds. The authenticated cron endpoint expires the event cache, fetches the authorised sources, and invalidates the homepage. The open browser refreshes events hourly. `/api/events` exposes only visible events and a generic source status, never feed credentials. Failed feeds retain the curated seed records; this implementation does not persist the last successful remote feed snapshot, so remote-only events may temporarily disappear during an outage. For durable remote history, periodically use the maintenance script or add a database.

```sh
npm run events:refresh
```

This optional local command fetches enabled permitted feeds, merges current records, prunes expired events, and atomically rewrites `data/events.json`. Review the diff and commit it. If tokens live in `.env.local`, export them first or run `node --env-file=.env.local --import tsx scripts/refresh-events.ts`.

No Kuda Almaty, Kuda Fest, Instagram or ticketing-site scraper is enabled. No verified reusable event feed was found, so the shipped data contains three manually verified, attributed listings. Add a licensed feed for new automatic discoveries. Instagram Graph API integration would require the account owner's authorization and appropriate current Meta permissions. oEmbed displays known public posts; it is not an event discovery API and does not supply event dates.

## Images, accessibility and performance

`data/photo-credits.json` records photographer, original URL, licence and modifications for every image. `/credits` exposes the attributions. Hero/Shymbulak image adaptations retain CC BY-SA 4.0; other images use CC BY or CC0. These licences concern the images, not the application code. Event cards use clearly labelled editorial city photographs, not unlicensed event posters.

Next Image optimises and lazy-loads imagery; the hero alone is prioritised. Fonts are locally bundled through `next/font/local`. Semantic navigation, visible focus states, a skip link, labelled forms, native details/summary tips and reduced-motion support are included. There is no autoplay sound or video download before a click.

## Checks

`npm test` verifies event date boundaries, malformed records, source permissions, RSS semantics, feed failure fallback and mocked contact delivery. `npm run build` performs the production compilation and TypeScript check. Tests do not send real emails. Real email delivery needs your credentials and a test from your deployment; webcams remain external dependencies.
