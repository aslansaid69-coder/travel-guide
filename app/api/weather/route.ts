import { getWeather } from "@/lib/weather/read";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await getWeather(), {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
      },
    });
  } catch {
    return Response.json(
      {
        weather: null,
        advice: null,
        lastUpdated: null,
        stale: true,
        status: "unavailable",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
