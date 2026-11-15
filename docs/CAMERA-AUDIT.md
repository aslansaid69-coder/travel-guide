# Camera audit — 2026-11-16 (Asia/Almaty)

Latest owner instruction takes precedence over the earlier broad removal rule: **retain ipcam.kz, remove RTSP.me**. All guide-owned World-Cam credits and outbound links are removed.

| Previous camera   | Result                                                                    | Action                                |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------------- |
| Shymbulak cam5    | Direct HTTPS HLS master, media playlist and actual MPEG-TS segment passed | Retain direct player; credit ipcam.kz |
| Shymbulak cam6    | Direct HTTPS HLS master, media playlist and actual MPEG-TS segment passed | Retain direct player; credit ipcam.kz |
| Shymbulak cam1    | Direct HTTPS HLS master, media playlist and actual MPEG-TS segment passed | Retain direct player; credit ipcam.kz |
| Shymbulak cam2    | HTTP 404                                                                  | Remove inactive fallback entry        |
| Medeu via RTSP.me | Previously provider-restricted; latest owner says remove                  | Remove entry and embed                |

The historical investigation in INTEGRATIONS.md describes the former implementation only. It is not an active source list. The live configuration in Postgres and approved JSON seed include no World-Cam or RTSP.me URL.

The owner-authorised ipcam.kz streams do not require an API key. A public stream response or the owner's instruction does not itself create a copyright licence; respect the operator's continuing embedding terms. Do not add camera positions/elevations that the operator has not specified.

Health checks fetch at most a 128 KB playlist and 32 KB media sample per request, reject login/payment HTML, nonlive/ended/stale playlists, stalled sequence hashes, bad HTTP responses and forbidden redirect/playlist hosts. MPEG-TS/fMP4 signatures are verified. This detects transport/media failures but does not inspect visual payment overlays or prove browser decoding. Client playback checks handle decode/playback errors without sending visitors away.

A failure changes status to offline. Three consecutive failed checks hide the feed; success resets the counter and restores nonmanual/nonblocked cameras. A forbidden-provider redirect blocks immediately and permanently until a reviewed replacement is added. Manual show runs validation first; it cannot override a forbidden-provider block. Every check and owner action is logged. New additions support direct HLS with allowlisted hosts; YouTube/MJPEG adapters are deferred rather than accepted without real validation.

Initial transport implementation produced three failed checks from a DNS callback issue. Those logs are retained. After fixing the callback, all three media probes passed and counters reset; no false healthy result was recorded from the earlier attempt.
