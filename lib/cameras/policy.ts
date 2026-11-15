import { isIP } from "node:net";
export class CameraPolicyError extends Error {
  constructor(
    message: string,
    public blocked = false,
  ) {
    super(message);
  }
}
export function bannedHost(host: string) {
  const h = host.toLowerCase().replace(/\.$/, "");
  return ["world-cam.ru", "rtsp.me"].some(
    (b) => h === b || h.endsWith("." + b),
  );
}
export function validateCameraUrl(raw: string, allowedHosts = ["ipcam.kz"]) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CameraPolicyError("Enter a valid HTTPS URL.");
  }
  if (bannedHost(url.hostname))
    throw new CameraPolicyError("This provider is permanently blocked.", true);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    isIP(url.hostname) ||
    !allowedHosts.includes(url.hostname.toLowerCase())
  )
    throw new CameraPolicyError(
      "Use HTTPS on an approved camera host without credentials or custom ports.",
    );
  return url;
}
// DNS addresses are checked and pinned by the HTTP transport, including every redirect.
export function publicAddress(ip: string) {
  if (isIP(ip) !== 4) return false; // IPv4 only; rejecting IPv6 avoids mapped/private-address ambiguity.
  const [a, b] = ip.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
export function cameraHosts() {
  return [
    "ipcam.kz",
    ...(process.env.CAMERA_ALLOWED_HOSTS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  ];
}
