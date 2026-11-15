import test from "node:test";
import assert from "node:assert/strict";
import { validateCameraUrl, publicAddress } from "../lib/cameras/policy";
import { nextHealth, type Camera } from "../lib/cameras/types";
import { probeCamera } from "../lib/cameras/probe";
import { allowedWorkflow } from "../lib/cameras/scheduler-auth";
const camera: Camera = {
  id: "test",
  name: "Test",
  location: "Almaty",
  type: "hls",
  streamUrl: "https://ipcam.kz/cam5/index.m3u8",
  sourceUrl: "https://ipcam.kz/",
  sourceName: "ipcam.kz",
  poster: "/images/hero.jpg",
  posterAlt: "Scenery",
  permissionNote: "Test permission",
  status: "online",
  failures: 0,
  manualHidden: false,
  blocked: false,
  lastCheck: null,
  reason: null,
  manifestHash: null,
};
const enc = new TextEncoder();
function response(url: string, body: string | Uint8Array, status = 200) {
  return {
    url,
    status,
    headers: {},
    bytes: typeof body === "string" ? enc.encode(body) : body,
  };
}
const playlist = "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:123\n#EXTINF:5,\nsegment.ts\n";
const segment = new Uint8Array(600);
segment[0] = segment[188] = segment[376] = 0x47;
test("blocked, spoofed and private camera destinations are rejected", () => {
  for (const url of [
    "https://world-cam.ru/cam",
    "https://x.world-cam.ru/cam",
    "https://rtsp.me/embed/test",
    "https://ipcam.kz@world-cam.ru/a",
    "http://ipcam.kz/a",
    "https://127.0.0.1/a",
    "https://ipcam.kz:8443/a",
    "https://evil.example/a",
  ])
    assert.throws(() => validateCameraUrl(url));
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "172.16.0.1",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
  ])
    assert.equal(publicAddress(ip), false);
  assert.equal(publicAddress("8.8.8.8"), true);
});
test("three failures hide, success recovers, manual hide and banned-provider blocks persist", () => {
  let c = camera;
  for (let i = 1; i <= 3; i++) {
    c = { ...c, ...nextHealth(c, { ok: false, reason: "Offline" }) };
    assert.equal(c.failures, i);
    assert.equal(c.status, i === 3 ? "hidden" : "offline");
  }
  assert.equal(nextHealth(c, { ok: true, reason: "OK" }).status, "online");
  assert.equal(
    nextHealth({ ...c, manualHidden: true }, { ok: true, reason: "OK" }).status,
    "hidden",
  );
  const banned = {
    ...c,
    ...nextHealth(c, { ok: false, blocked: true, reason: "Blocked redirect" }),
  };
  assert.equal(nextHealth(banned, { ok: true, reason: "OK" }).status, "hidden");
});
test("a successful manifest alone cannot mark a stream healthy", async () => {
  const result = await probeCamera(camera, null, async (url) =>
    response(url, url.endsWith(".ts") ? "<html>login</html>" : playlist),
  );
  assert.equal(result.ok, false);
});
test("master, media playlist and video bytes are checked", async () => {
  const calls: string[] = [];
  const result = await probeCamera(camera, null, async (url) => {
    calls.push(url);
    return response(
      url,
      url.endsWith(".ts")
        ? segment
        : url.includes("media")
          ? playlist
          : "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nmedia.m3u8\n",
    );
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 3);
});
test("banned embedded HLS URI or final redirect causes a permanent block", async () => {
  const result = await probeCamera(camera, null, async (url) =>
    response(
      url,
      '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://world-cam.ru/key"\n#EXTINF:5,\na.ts\n',
    ),
  );
  assert.equal(result.blocked, true);
  const redirected = await probeCamera(camera, null, async () =>
    response("https://world-cam.ru/camera", playlist),
  );
  assert.equal(redirected.blocked, true);
});
test("frozen, ended and stale playlists are not healthy", async () => {
  const fetcher = async (url: string) =>
    response(url, url.endsWith(".ts") ? segment : playlist);
  const first = await probeCamera(camera, null, fetcher);
  assert.equal(first.ok, true);
  assert.equal(
    (await probeCamera(camera, first.manifestHash!, fetcher)).ok,
    false,
  );
  for (const extra of [
    "#EXT-X-ENDLIST",
    "#EXT-X-PROGRAM-DATE-TIME:2020-01-01T00:00:00Z",
  ])
    assert.equal(
      (
        await probeCamera(camera, null, async (url) =>
          response(url, playlist + extra),
        )
      ).ok,
      false,
    );
});
test("scheduler identity restricts exact repository, owner, branch, event and workflow", () => {
  const p = {
    repository_id: "1458725366",
    repository_owner_id: "354138630",
    repository: "aslansaid69-coder/travel-guide",
    ref: "refs/heads/main",
    workflow_ref:
      "aslansaid69-coder/travel-guide/.github/workflows/camera-health.yml@refs/heads/main",
    event_name: "schedule",
  };
  assert.equal(allowedWorkflow(p), true);
  for (const patch of [
    { repository_id: "1" },
    { repository_owner_id: "1" },
    { ref: "refs/heads/test" },
    { event_name: "pull_request" },
    { workflow_ref: "other" },
  ])
    assert.equal(allowedWorkflow({ ...p, ...patch }), false);
});
