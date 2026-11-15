import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    const cameraHosts = [
      "ipcam.kz",
      ...(process.env.CAMERA_ALLOWED_HOSTS || "").split(","),
    ]
      .map((host) => host.trim().toLowerCase())
      .filter((host) => /^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(host))
      .map((host) => `https://${host}`)
      .join(" ");
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `media-src 'self' blob: ${cameraHosts}; frame-src 'none'; connect-src 'self' ${cameraHosts}`,
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
