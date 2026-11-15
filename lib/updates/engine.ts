import { almatyDay } from "@/lib/event-view";
import type { Adapter, SourceResult } from "./types";
export async function runAdapters(
  items: Adapter[],
  save: (
    adapter: Adapter,
    result: SourceResult,
    duration: number,
  ) => Promise<void>,
) {
  return Promise.all(
    items.map(async (adapter) => {
      const start = Date.now();
      let result: SourceResult;
      try {
        result = await adapter.load();
      } catch (error) {
        // Provider exception messages are controlled in the adapters; never log a credential-bearing URL or response body.
        const safe =
          error instanceof Error &&
          /^(Weather|Source|Event source)/.test(error.message)
            ? error.message
            : "Source fetch or validation failed; previous data retained.";
        result = { status: "failed", reason: safe, requests: 1 };
      }
      await save(adapter, result, Date.now() - start);
      return { key: adapter.key, kind: adapter.kind, ...result };
    }),
  );
}

export function updateRunKey(
  job: "daily" | "weather",
  now: Date,
  manual = false,
) {
  return manual
    ? `manual:${job}:${Math.floor(now.valueOf() / 300000)}`
    : job === "daily"
      ? `daily:${almatyDay(now)}`
      : `weather:${Math.floor(now.valueOf() / 3600000)}`;
}
