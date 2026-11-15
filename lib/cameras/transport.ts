import { lookup } from "node:dns/promises";
import { request } from "node:https";
import {
  CameraPolicyError,
  cameraHosts,
  publicAddress,
  validateCameraUrl,
} from "./policy";
export type CameraResponse = {
  url: string;
  status: number;
  headers: Record<string, string>;
  bytes: Uint8Array;
};
export async function cameraFetch(
  raw: string,
  maxBytes = 128_000,
  range = false,
  redirects = 0,
): Promise<CameraResponse> {
  if (redirects > 4) throw new CameraPolicyError("Too many redirects.");
  const url = validateCameraUrl(raw, cameraHosts());
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new CameraPolicyError(
      "Camera host resolves to a private or unsupported address.",
    );
  const response = await new Promise<CameraResponse>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": "AlmatyGuide-CameraHealth/1.0",
          ...(range ? { Range: "bytes=0-32767" } : {}),
        },
        lookup: (_host, options, callback) => {
          if (options.all)
            (
              callback as unknown as (
                error: null,
                records: { address: string; family: number }[],
              ) => void
            )(null, addresses);
          else callback(null, addresses[0].address, 4);
        },
      },
      (res) => {
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(res.headers))
          if (value)
            headers[key] = Array.isArray(value) ? value.join(",") : value;
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          resolve({
            url: url.href,
            status: res.statusCode,
            headers,
            bytes: new Uint8Array(),
          });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let settled = false;
        res.on("data", (chunk: Buffer) => {
          if (settled) return;
          const remaining = maxBytes - size;
          chunks.push(chunk.subarray(0, remaining));
          size += Math.min(remaining, chunk.length);
          if (size >= maxBytes && !range) {
            settled = true;
            reject(new Error("Camera playlist exceeds the size limit."));
            res.destroy();
            return;
          }
          if (size >= maxBytes) {
            settled = true;
            resolve({
              url: url.href,
              status: res.statusCode || 0,
              headers,
              bytes: Buffer.concat(chunks),
            });
            res.destroy();
          }
        });
        res.on("end", () => {
          if (!settled) {
            settled = true;
            resolve({
              url: url.href,
              status: res.statusCode || 0,
              headers,
              bytes: Buffer.concat(chunks),
            });
          }
        });
        res.on("error", (err) => {
          if (!settled) reject(err);
        });
      },
    );
    req.setTimeout(8000, () =>
      req.destroy(new Error("Camera request timed out.")),
    );
    req.on("error", reject);
    req.end();
  });
  if (response.status >= 300 && response.status < 400) {
    const target = new URL(response.headers.location || "", url).href;
    validateCameraUrl(target, cameraHosts());
    return cameraFetch(target, maxBytes, range, redirects + 1);
  }
  return response;
}
