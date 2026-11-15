# Source investigation — 15 November 2026

## Live cameras

Inspected the raw HTML of [World-Cam's Almaty directory](https://world-cam.ru/cams/web-camera-almaty-online/) and all five camera detail pages, then requested the discovered endpoints.

| Source page suffix         | Published integration                               | Check                                                                                | Configuration                                    |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `skating-rink-medeo/`      | `https://rtsp.me/embed/bFDa3RAb` iframe             | Embed HTTP 200, but browser player reports access temporarily restricted by provider | External fallback (embed URL retained in config) |
| `ski-resort-shymbulak/`    | `https://ipcam.kz:443/cam5/index.m3u8` via Playerjs | HTTP 200 HLS master; `Access-Control-Allow-Origin: *`                                | HLS                                              |
| `chimbulak-ski-resort-ss/` | `https://ipcam.kz/cam6/index.m3u8` via Playerjs     | HTTP 200 HLS master; CORS enabled                                                    | HLS                                              |
| `chimbulak-ski-resort/`    | `https://ipcam.kz:443/cam1/index.m3u8` via Playerjs | HTTP 200 HLS master; CORS enabled                                                    | HLS                                              |
| `chimbulak-ski-resort-/`   | `https://ipcam.kz:443/cam2/index.m3u8` via Playerjs | HTTP 404                                                                             | External source fallback                         |

Each suffix is under `https://world-cam.ru/cams/web-camera-almaty-online/`. URLs are reproduced from public integrations, not reverse-engineered private endpoints. CORS or an embed code is a technical capability, not a blanket copyright licence: confirm operator permission for your deployment and keep credits. No stream is proxied, downloaded for rehosting, or stripped of provider UI. Exact camera elevations/angles not specified by the directory are not asserted.

## Curated events

Own summaries of date/venue facts, verified on these primary listings:

- [City Run 2026](https://almaty-marathon.kz/en/events/city__run_2026/), 15 November, Astana Square. The canonical page supersedes an older cached index listing 8 November. No start time asserted.
- [MOLDANAZAR](https://ticketon.kz/concerts/event/tckt2-kontsert-gruppy-moldanazar-v-almaty), 28 November, 20:00, Republic Palace.
- [LEVEL UP Festival](https://ticketon.kz/en/concerts/event/level-up-festival), 13 December, 17:00, Almaty Arena. Separate from its older June event.

No event posters or source descriptions were copied. The sources are credited on every card. Permitted feed configuration is intentionally empty until the owner supplies a licensed/authorised source. A city news RSS feed was rejected because publication dates do not identify event dates.

## Travel facts

- [Medeu reconstruction — Almaty government](https://www.gov.kz/org/almaty/press/news/details/1092075?lang=ru)
- [Big Almaty Lake access restrictions — Almaty communications service](https://rsk.almaty.kz/en/news/43814)
- [Shymbulak gondola tickets](https://shymbulak.com/en/tickets/)
- [Local transport directory](https://nta.visitalmaty.kz/en/transit)
- [QazETA](https://qazeta.kz/en/) and [passport-specific entry guidance example](https://www.gov.uk/foreign-travel-advice/kazakhstan/entry-requirements)
- [Visitor practical guide](https://nta.visitalmaty.kz/en/guides/almaty-practical-tips)
- [SIM/device registration](https://beeline.kz/ru/ctn-registration?isFrame=false&region=akm)

Access rules and event schedules can change. Recheck them when editing the guide.

## Browser playback observations

The Medeu RTSP.me player displayed a provider access restriction. It is therefore configured as an external fallback until the operator restores service. HLS cam5 timed out in the in-app browser and correctly switched to its source fallback. Manifest HTTP 200/CORS checks alone do not prove full video playback.
