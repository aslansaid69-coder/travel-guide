import "server-only";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { database } from "@/lib/db";
import { itemSchema } from "@/lib/hub/types";
import { likePattern } from "@/lib/admin/list";
import { publicMatch, quoteTour } from "@/lib/tours/service";
import { HttpError } from "@/lib/hub/security";

type Lang = "en" | "ru" | "kk";
export type ToolAction = { type: "add_to_tour"; placeId: string; name: string; slug: string };
export type ToolContext = { lang: Lang; actions: ToolAction[] };

const kzt = (minor: number) => `${Math.round(minor / 100).toLocaleString("ru-RU")} ₸`;

const searchInput = z.object({
  query: z.string().trim().max(120).optional(),
  category: itemSchema.shape.category.optional(),
  limit: z.number().int().min(1).max(10).default(6),
});
const estimateInput = z.object({
  placeIds: z.array(z.string().max(120)).min(1).max(6),
  adults: z.number().int().min(1).max(40).default(2),
  children: z.number().int().min(0).max(40).default(0),
  startDate: z.iso.date().optional(),
});
const guidesInput = z.object({
  placeIds: z.array(z.string().max(120)).min(1).max(6),
  startDate: z.iso.date(),
  language: z.string().max(5).optional(),
});
const addInput = z.object({ placeId: z.string().min(1).max(120) });

/** Tool definitions sent to Claude. Order and text are stable so the prompt prefix caches. */
export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_places",
    description:
      "Search OUR published catalog of places in Almaty and Almaty Region. Returns id, slug, name (EN/RU/KZ), category, region, typical visit minutes, published entrance price with source, and a short description. Use before recommending any place.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free text, e.g. 'lake', 'museum', 'Kok Tobe', 'горы'. Omit to list popular places." },
        category: { type: "string", enum: [...itemSchema.shape.category.options] },
        limit: { type: "integer", minimum: 1, maximum: 10 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "estimate_tour",
    description:
      "Approximate tour price from OUR pricing engine for 1–6 place ids: range (min–max) in KZT with breakdown (entrance tickets × travellers, transport by distance, guide day rate × days, service fee), number of days, distance and driving time. The only allowed source of tour prices.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        placeIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
        adults: { type: "integer", minimum: 1, maximum: 40 },
        children: { type: "integer", minimum: 0, maximum: 40 },
        startDate: { type: "string", description: "YYYY-MM-DD, optional" },
      },
      required: ["placeIds"],
      additionalProperties: false,
    },
  },
  {
    name: "find_guides",
    description:
      "Find OUR guides who cover the regions of these places, are free on the dates and speak the language. Returns name, languages, experience, rating and day rate. Needs a start date.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        placeIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        language: { type: "string", description: "Two-letter code such as en, ru, kk" },
      },
      required: ["placeIds", "startDate"],
      additionalProperties: false,
    },
  },
  {
    name: "add_to_tour",
    description:
      "Add one of our places (by id) to the traveller's tour in the tour builder. Only when the traveller asks or agrees.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { placeId: { type: "string" } },
      required: ["placeId"],
      additionalProperties: false,
    },
  },
];

async function searchPlaces(raw: unknown) {
  const q = searchInput.parse(raw);
  const like = likePattern(q.query || "");
  const rows = await database()`SELECT data,status FROM hub_catalog WHERE status='approved'
    AND (${q.query || ""} = '' OR data->>'name' ILIKE ${like} OR data->>'nameRu' ILIKE ${like} OR data->>'nameKk' ILIKE ${like} OR data->>'description' ILIKE ${like} OR data->>'descriptionRu' ILIKE ${like} OR data->>'category' ILIKE ${like})
    AND (${q.category || ""} = '' OR data->>'category' = ${q.category || ""})
    ORDER BY (data->>'sort')::int DESC NULLS LAST, updated_at DESC LIMIT ${q.limit}`;
  return rows.map((r) => {
    const i = itemSchema.parse({ ...(r.data as object), status: r.status });
    return {
      id: i.id,
      slug: i.slug || i.id,
      name: i.name,
      nameRu: i.nameRu || undefined,
      nameKk: i.nameKk || undefined,
      category: i.category,
      region: i.region,
      typicalVisitMinutes: i.duration,
      entrancePrice:
        i.priceStatus === "not_found" || !i.price
          ? "not published"
          : i.price.type === "free"
            ? "free"
            : `${kzt(i.price.min)}${i.price.max > i.price.min ? `–${kzt(i.price.max)}` : ""} ${i.price.type === "per-group" || i.price.type === "fixed" ? "per group" : "per person"}${i.price.source === "estimated" ? " (unofficial estimate)" : ""}`,
      priceSource: i.price?.sourceUrl || undefined,
      priceCheckedAt: i.price?.checkedAt || undefined,
      description: i.description.slice(0, 400),
    };
  });
}

async function estimate(raw: unknown, ctx: ToolContext) {
  const q = estimateInput.parse(raw);
  const r = await quoteTour({ ...q, language: ctx.lang });
  const e = r.estimate;
  return {
    approximateTotal: `${kzt(e.total.min)} – ${kzt(e.total.max)}`,
    breakdown: e.lines.map((l) => ({ item: l.label, range: l.min === l.max ? kzt(l.min) : `${kzt(l.min)} – ${kzt(l.max)}`, detail: l.detail })),
    days: e.days,
    distanceKm: Math.round(e.distanceKm),
    drivingMinutes: e.driveMinutes,
    travellers: e.people,
    prepaymentOnline: kzt(e.depositMinor),
    entrancePriceNotPublished: e.unpricedPlaces,
    disclaimer: e.disclaimer,
    bookAt: "/build",
  };
}

async function guides(raw: unknown, ctx: ToolContext) {
  const q = guidesInput.parse(raw);
  const r = await quoteTour({ placeIds: q.placeIds, adults: 2, children: 0, startDate: q.startDate, language: (q.language as Lang) || ctx.lang });
  return (r.matches || []).slice(0, 5).map((m) => {
    const g = publicMatch(m, ctx.lang);
    return {
      id: g.id,
      name: g.name,
      languages: g.languages,
      experienceYears: g.experienceYears,
      rating: g.rating,
      reviews: g.reviewCount,
      dayRate: kzt(g.dayRateMinor),
      profile: `/guides/${g.id}`,
    };
  });
}

async function addToTour(raw: unknown, ctx: ToolContext) {
  const { placeId } = addInput.parse(raw);
  const row = (await database()`SELECT data FROM hub_catalog WHERE id=${placeId} AND status='approved'`)[0];
  if (!row) throw new HttpError(404, "Unknown place id. Search first.");
  const item = itemSchema.parse(row.data);
  ctx.actions.push({ type: "add_to_tour", placeId: item.id, name: item.name, slug: item.slug || item.id });
  return { added: item.name, openBuilder: "/build" };
}

/** Runs a validated tool call. Errors become `is_error` tool results the model can explain. */
export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<{ content: string; isError: boolean }> {
  try {
    const result =
      name === "search_places"
        ? await searchPlaces(input)
        : name === "estimate_tour"
          ? await estimate(input, ctx)
          : name === "find_guides"
            ? await guides(input, ctx)
            : name === "add_to_tour"
              ? await addToTour(input, ctx)
              : null;
    if (result === null) return { content: `Unknown tool ${name}`, isError: true };
    return { content: JSON.stringify(result), isError: false };
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? `Invalid input: ${error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
        : error instanceof HttpError
          ? error.message
          : "Tool failed. Tell the traveller this information is temporarily unavailable.";
    return { content: message, isError: true };
  }
}
