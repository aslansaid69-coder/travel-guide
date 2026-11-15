# Live operations

- Public website: https://almaty-travel-guide.vercel.app
- Source: https://github.com/aslansaid69-coder/travel-guide
- Vercel project: `atik24/almaty-travel-guide`
- Production branch: `main`
- Runtime: Node 22 LTS

## Daily work

1. **Cloud refresh:** Vercel cron calls `/api/cron/events` once daily at 02:00 UTC, in the 07:00–07:59 Asia/Almaty window on the current Hobby plan. The secret is configured in Vercel, not in Git. This refresh expires cached events, fetches any configured permitted feeds, filters dates, and invalidates the homepage. It runs independently of the owner's computer. The authenticated production endpoint was manually verified with HTTP 200 on 2026-11-15.
2. **Content review:** The active Codex automation `update-almaty-guide-daily` runs at 08:30 Asia/Almaty in the original chat. It verifies new event facts, existing camera sources, and material changes in official travel guidance, then tests, commits and pushes verified changes. The computer and desktop app must be running for this local automation. Usage limits, unavailable sources or required approvals can prevent a run; inspect its result in the app.
3. **Publication:** GitHub pushes to `main` trigger Vercel production deployments. Check the deployment result before treating a content change as published.

The cloud refresh is not an event-discovery service. No third-party content feed is enabled without documented permission. The content review researches original factual summaries and does not scrape Instagram, copy posters, or invent event dates. If there is no verified new information, the site retains its valid current data and removes expired listings from the visible date window.

## Contact and local sources

The approved contact destination is `aslansaid69@gmail.com`. `data/site.json` selects `email-app` mode. The form creates a mailto draft and clearly asks the visitor to review and send it in their email app. No message is sent or stored by this website, and no Resend key is required.

KudaFest and Sxodim Instagram links are local inspiration sources. They are not presented as the owner's personal accounts. Tracking parameters from the supplied URLs are removed.

## Maintenance

- Keep `.env.local` and `.vercel` ignored. Never publish or log secrets.
- `NEXT_PUBLIC_SITE_URL` is configured for production and preview; `CRON_SECRET` is configured only for production.
- Camera provider outages are handled by source-link fallbacks. A successful HLS manifest response alone does not prove continuous playback.
- To pause the editorial review, pause `Update Almaty guide daily` in the app. To change cloud refresh, edit `vercel.json` and deploy.
- For a new hosting account, follow README deployment steps. Optional server-delivered email requires a verified Resend sender and host rate limiting.

## Camera upgrade — stage 1, 2026-11-16

The owner explicitly retained ipcam.kz and removed RTSP.me. The three remaining feeds have no World-Cam URLs or outbound-player fallbacks. Camera configuration, checks and owner actions persist in the Neon project `almaty-travel-hub` (`old-dream-49782525`). See `docs/CAMERA-AUDIT.md` for evidence.

Camera monitoring uses the GitHub Actions schedule at minutes 7, 22, 37 and 52. The job authenticates with a short-lived signed GitHub OIDC token; the server checks the immutable repository/owner IDs, main branch, exact workflow, audience and event type. Logs are retained for 30 days. At most one check per 15-minute window contributes to consecutive failures. GitHub may delay or drop scheduled runs; QStash is the supplied alternative for tighter timing.

The current 07:00 event refresh and 08:30 local editorial review are distinct from camera monitoring. Stage 2 will replace the data refresh with the requested 05:00 Asia/Almaty source-by-source job. Do not claim that new weather, menus, prices, payments or bookings are active before their respective stages ship.
