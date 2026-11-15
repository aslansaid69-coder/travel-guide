import { createHash } from "node:crypto";
import { cameraFetch, type CameraResponse } from "./transport";
import { CameraPolicyError, cameraHosts, validateCameraUrl } from "./policy";
import type { CameraConfig, ProbeResult } from "./types";
type Transport = (
  url: string,
  limit?: number,
  range?: boolean,
) => Promise<CameraResponse>;
function assertResponse(r: CameraResponse) {
  validateCameraUrl(r.url, cameraHosts());
  if ([401, 402, 403].includes(r.status))
    throw new CameraPolicyError(
      "Provider requires access, authentication, or payment.",
    );
  if (r.status !== 200 && r.status !== 206)
    throw new Error(`Stream returned HTTP ${r.status}.`);
}
function playlistUris(body: string, base: string) {
  // Inspect every URI, including key, map, audio and alternate-variant URLs.
  const raw = [
    ...body
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter((x) => x && !x.startsWith("#")),
    ...Array.from(body.matchAll(/URI="([^"]+)"/g), (m) => m[1]),
  ];
  return raw.map(
    (uri) => validateCameraUrl(new URL(uri, base).href, cameraHosts()).href,
  );
}
export async function probeCamera(
  camera: Pick<CameraConfig, "streamUrl" | "sourceUrl">,
  previousHash: string | null = null,
  transport: Transport = cameraFetch,
): Promise<ProbeResult> {
  try {
    validateCameraUrl(camera.streamUrl, cameraHosts());
    validateCameraUrl(camera.sourceUrl, cameraHosts());
    let response = await transport(camera.streamUrl);
    assertResponse(response);
    let body = new TextDecoder().decode(response.bytes);
    if (!body.trimStart().startsWith("#EXTM3U"))
      throw new Error("Response is not an HLS playlist.");
    let uris = playlistUris(body, response.url);
    if (body.includes("#EXT-X-STREAM-INF")) {
      if (!uris.length) throw new Error("No HLS rendition found.");
      response = await transport(uris[0]);
      assertResponse(response);
      body = new TextDecoder().decode(response.bytes);
      if (!body.trimStart().startsWith("#EXTM3U"))
        throw new Error("Rendition is not HLS.");
      uris = playlistUris(body, response.url);
    }
    if (body.includes("#EXT-X-ENDLIST"))
      throw new Error("Stream has ended; this is not a live playlist.");
    const segments = body
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter((x) => x && !x.startsWith("#"));
    if (!segments.length || !body.includes("#EXTINF:"))
      throw new Error("Live playlist has no video segments.");
    const date = Array.from(body.matchAll(/#EXT-X-PROGRAM-DATE-TIME:(.+)/g)).at(
      -1,
    )?.[1];
    if (
      date &&
      (!Number.isFinite(Date.parse(date)) ||
        Date.now() - Date.parse(date) > 180000)
    )
      throw new Error("Camera playlist is stale (over three minutes old).");
    const hash = createHash("sha256").update(body).digest("hex");
    if (previousHash === hash)
      throw new Error("Camera playlist has stopped advancing.");
    const segment = await transport(
      new URL(segments.at(-1)!, response.url).href,
      32768,
      true,
    );
    assertResponse(segment);
    const b = segment.bytes;
    const text = new TextDecoder().decode(b.slice(0, 1000));
    const ts = b.length > 376 && b[0] === 0x47 && b[188] === 0x47;
    const mp4 =
      b.length > 16 &&
      /ftyp|styp|moof/.test(new TextDecoder().decode(b.slice(4, 32)));
    if (!ts && !mp4)
      throw new Error(
        /login|paywall|payment|subscription/i.test(text)
          ? "Provider returned an access/payment page."
          : "Video segment is not valid MPEG-TS or fragmented MP4.",
      );
    // The transport verifies actual media bytes. Visual overlays and decoding still need player checks.
    return {
      ok: true,
      reason: "Live playlist and video segment verified.",
      manifestHash: hash,
      finalUrl: response.url,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Stream check failed.",
      blocked: error instanceof CameraPolicyError && error.blocked,
    };
  }
}
