import { z } from "zod";

/** Validated table state from the URL (?q=&status=&page=). */
export const listParamsSchema = z.object({
  q: z.string().trim().max(120).catch(""),
  status: z.string().trim().max(40).catch(""),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
});
export type ListParams = z.infer<typeof listParamsSchema>;
export type SearchParams = Record<string, string | string[] | undefined>;

export function listParams(raw: SearchParams): ListParams {
  const pick = (k: string) => (Array.isArray(raw[k]) ? raw[k]?.[0] : raw[k]);
  return listParamsSchema.parse({
    q: pick("q") ?? "",
    status: pick("status") ?? "",
    page: pick("page") ?? 1,
  });
}

export const PAGE_SIZE = 20;
export const offset = (p: ListParams, size = PAGE_SIZE) => (p.page - 1) * size;
/** SQL ILIKE pattern with wildcards in the user's text escaped. */
export const likePattern = (q: string) =>
  `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;

export function pageHref(
  base: string,
  p: ListParams,
  page: number,
  extra: Record<string, string> = {},
) {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.status) sp.set("status", p.status);
  for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v);
  if (page > 1) sp.set("page", String(page));
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}
