import { listCameras, publicCamera } from "@/lib/cameras/store";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const cameras = await listCameras();
    return Response.json(
      {
        cameras: cameras
          .filter((c) => c.status !== "hidden" && !c.manualHidden && !c.blocked)
          .map(publicCamera),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30",
        },
      },
    );
  } catch {
    return Response.json(
      { cameras: [], message: "Camera status is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
