import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import type { CatalogItem, Plan } from "./types";
import { dayDate, money, type estimate } from "./core";
export async function planPdf(
  plan: Plan,
  items: CatalogItem[],
  pricing?: ReturnType<typeof estimate>,
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    await readFile(
      path.join(process.cwd(), "assets/fonts/NotoSans-Regular.ttf"),
    ),
    { subset: true },
  );
  let page = pdf.addPage([595, 842]),
    y = 785;
  const line = (value: string, size = 11) => {
    const paragraphs = value.split("\n");
    for (const paragraph of paragraphs) {
      let current = "";
      const flush = () => {
        if (y < 55) {
          page = pdf.addPage([595, 842]);
          y = 785;
        }
        page.drawText(current, {
          x: 45,
          y,
          size,
          font,
          color: rgb(0.12, 0.23, 0.3),
        });
        y -= size + 8;
        current = "";
      };
      for (const word of paragraph.split(/\s+/)) {
        const candidate = current ? current + " " + word : word;
        if (font.widthOfTextAtSize(candidate, size) > 500 && current) flush();
        current = current ? current + " " + word : word;
        if (font.widthOfTextAtSize(current, size) > 500) {
          for (const chunk of current.match(/.{1,65}/g) || []) {
            current = chunk;
            flush();
          }
        }
      }
      flush();
    }
  };
  line("ALMATY, WITH LOVE", 11);
  line(plan.title, 24);
  line(
    `${plan.adults} adults, ${plan.children} children | ${plan.days.length} days`,
  );
  y -= 12;
  plan.days.forEach((d, i) => {
    line(`Day ${i + 1} · ${dayDate(plan.startDate, i)}`, 16);
    d.stops.forEach((s) => {
      const item = items.find((i) => i.id === s.itemId);
      line(
        `${s.start}  ${item?.name || "Unavailable stop"} · ${s.duration} min`,
        12,
      );
      if (s.note) line(s.note);
      if (item?.sourceUrl) line(item.sourceUrl, 9);
    });
    y -= 14;
  });
  if (pricing) {
    line("PRICE ESTIMATE", 16);
    line(`Priced portion: ${money(pricing.min)} – ${money(pricing.max)}`);
    line(
      `Per person: ${money(pricing.perPerson.min)} – ${money(pricing.perPerson.max)}`,
    );
    if (pricing.unknown)
      line(
        `${pricing.unknown} unpriced item(s) are excluded and need confirmation.`,
      );
    pricing.lines.forEach((l) =>
      line(
        `${l.name}: ${l.unknown ? "price to confirm" : `${money(l.min)} – ${money(l.max)}`} · ${l.confirmed ? "confirmed price" : "estimate"}`,
        10,
      ),
    );
  }
  line("Estimate only; the final price is confirmed by our team.", 10);
  line(
    "Opening hours, weather and route times need checking before travel.",
    10,
  );
  return pdf.save();
}
