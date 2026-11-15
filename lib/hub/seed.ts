import places from "@/data/places.json";
import { database } from "@/lib/db";
import { itemSchema, defaultSettings } from "./types";
const positions: Record<string, [number, number, number]> = {
  medeu: [43.1579, 77.0583, 120],
  shymbulak: [43.1289, 77.0804, 240],
  "big-almaty-lake": [43.0528, 76.985, 300],
  "kok-tobe": [43.2223, 76.975, 120],
  panfilov: [43.2594, 76.9538, 90],
  "green-bazaar": [43.2636, 76.9532, 90],
  charyn: [43.3505, 79.0815, 480],
};
export async function seedCatalog() {
  const sql = database();
  for (const p of places) {
    const [lat, lng, duration] = positions[p.id];
    const item = itemSchema.parse({
      ...p,
      lat,
      lng,
      duration,
      category:
        p.id === "panfilov"
          ? "park"
          : p.id === "green-bazaar"
            ? "market"
            : p.id === "kok-tobe"
              ? "viewpoint"
              : "mountains",
      status: "approved",
      outdoor: true,
      source: "Owner-approved travel guide",
      sourceUrl: p.url,
      website: p.url,
      price: null,
      sort: 10,
    });
    await sql`INSERT INTO hub_catalog(id,data,status) VALUES(${item.id},${JSON.stringify(item)}::jsonb,'approved') ON CONFLICT(id) DO NOTHING`;
  }
  await sql`INSERT INTO hub_settings(id,data) VALUES(true,${JSON.stringify(defaultSettings)}::jsonb) ON CONFLICT DO NOTHING`;
}
