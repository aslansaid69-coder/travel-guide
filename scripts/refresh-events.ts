import { readFile, writeFile, rename } from "node:fs/promises";
import {
  fetchEventSources,
  visibleEvents,
  type EventSource,
} from "../lib/event-core";
const data = new URL("../data/", import.meta.url);
const seeds = JSON.parse(await readFile(new URL("events.json", data), "utf8"));
const sources: EventSource[] = JSON.parse(
  await readFile(new URL("event-sources.json", data), "utf8"),
);
const result = await fetchEventSources(sources, seeds);
const output = visibleEvents(result.events);
const temp = new URL("events.json.tmp", data);
await writeFile(temp, JSON.stringify(output, null, 2) + "\n");
await rename(temp, new URL("events.json", data));
console.log(
  `Saved ${output.length} current events. ${result.warnings.length} feed warning(s).`,
);
for (const warning of result.warnings) console.warn(warning);
