export type CameraConfig = {
  id: string;
  name: string;
  location: string;
  type: "hls";
  streamUrl: string;
  sourceUrl: string;
  sourceName: string;
  poster: string;
  posterAlt: string;
  permissionNote: string;
};
export type Camera = CameraConfig & {
  status: "online" | "offline" | "hidden";
  failures: number;
  manualHidden: boolean;
  blocked: boolean;
  lastCheck: string | null;
  reason: string | null;
  manifestHash: string | null;
};
export type ProbeResult = {
  ok: boolean;
  reason: string;
  blocked?: boolean;
  manifestHash?: string;
  finalUrl?: string;
};
export function nextHealth(camera: Camera, result: ProbeResult) {
  const failures = result.ok ? 0 : camera.failures + 1;
  const blocked = camera.blocked || !!result.blocked;
  const hidden = camera.manualHidden || blocked || failures >= 3;
  return {
    failures,
    blocked,
    status: hidden
      ? ("hidden" as const)
      : result.ok
        ? ("online" as const)
        : ("offline" as const),
    reason: blocked
      ? "Blocked provider or redirect. Owner review required."
      : camera.manualHidden
        ? "Hidden by owner."
        : result.ok
          ? null
          : result.reason,
  };
}
