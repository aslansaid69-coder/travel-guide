import { unstable_cache } from "next/cache";
import seed from "@/data/events.json";
import sources from "@/data/event-sources.json";
import {
  fetchEventSources,
  visibleEvents,
  type EventSource,
} from "./event-core";
const cachedEvents = unstable_cache(
  () => fetchEventSources(sources as EventSource[], seed),
  ["almaty-events-v1"],
  { revalidate: 86400, tags: ["events"] },
);
export async function getEvents() {
  const result = await cachedEvents();
  return { ...result, events: visibleEvents(result.events) };
}
