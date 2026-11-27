import { boundedBody } from "@/lib/updates/body";
import { HttpError } from "@/lib/hub/security";
import { siteUrl } from "@/lib/site";

export const USER_AGENT = `AlmatyTravelGuide/1.0 (+${siteUrl})`;

/** JSON fetch with timeout, size bound and no redirects to other hosts. */
export async function fetchJson<T>(
  url: string | URL,
  init: RequestInit & { maxBytes?: number; label: string },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...init.headers },
      signal: init.signal ?? AbortSignal.timeout(10000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new HttpError(503, `${init.label} is unreachable right now.`);
  }
  if (response.status === 429)
    throw new HttpError(503, `${init.label} rate limit reached. Try again later.`);
  if (!response.ok)
    throw new HttpError(503, `${init.label} returned HTTP ${response.status}.`);
  try {
    return JSON.parse(await boundedBody(response, init.maxBytes ?? 2_000_000)) as T;
  } catch {
    throw new HttpError(503, `${init.label} returned an unreadable response.`);
  }
}

export const clean = (v: unknown, max = 1800) =>
  String(v ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const KEYWORDS: [RegExp, import("./types").Category][] = [
  [/museum|gallery|memorial|monument|histor|cathedral|church|mosque|temple|theatre|theater/i, "museum"],
  [/viewpoint|observation|tower|hill|lookout|panorama/i, "viewpoint"],
  [/park|garden|botanic|zoo|square/i, "park"],
  [/market|bazaar|bazar|mall|shop|store/i, "market"],
  [/restaurant|food|dining|bar|pub/i, "restaurant"],
  [/cafe|coffee|bakery|tea/i, "cafe"],
  [/lake|canyon|mountain|peak|glacier|gorge|valley|natural|nature|national_park|waterfall|ski/i, "mountains"],
  [/beach/i, "beach"],
  [/amusement|activity|sport|stadium|rink|spa|attraction|tourist/i, "activity"],
];
export function guessCategory(...hints: (string | undefined)[]) {
  const text = hints.filter(Boolean).join(" ");
  for (const [re, cat] of KEYWORDS) if (re.test(text)) return cat;
  return "activity" as const;
}
