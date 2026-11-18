import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Plan, CatalogItem } from "@/lib/hub/types";
export async function documentPdf(
  title: string,
  lines: string[],
  route?: { plan: Plan; items: CatalogItem[] },
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
  const write = (value: string, size = 11) => {
    let text = "";
    const flush = () => {
      if (y < 55) {
        page = pdf.addPage([595, 842]);
        y = 785;
      }
      page.drawText(text, {
        x: 45,
        y,
        size,
        font,
        color: rgb(0.12, 0.23, 0.3),
      });
      y -= size + 8;
      text = "";
    };
    for (const word of value
      .replace(/[\u0000-\u0008\u000b-\u001f]/g, "")
      .split(/\s+/)) {
      if (font.widthOfTextAtSize(text + " " + word, size) > 500 && text)
        flush();
      if (font.widthOfTextAtSize(word, size) > 500) {
        for (const chunk of word.match(/.{1,60}/g) || []) {
          text = chunk;
          flush();
        }
      } else text += (text ? " " : "") + word;
    }
    flush();
  };
  write("ALMATY, WITH LOVE", 10);
  y -= 14;
  write(title, 23);
  lines.forEach((line) => write(line));
  if (route)
    for (let day = 0; day < route.plan.days.length; day++) {
      const places = route.plan.days[day].stops
        .map((stop) => route.items.find((i) => i.id === stop.itemId))
        .filter((i): i is CatalogItem => !!i);
      if (!places.length) continue;
      page = pdf.addPage([595, 842]);
      y = 785;
      write(`Day ${day + 1}: your route at a glance`, 21);
      write(
        "Schematic only. Markers are spaced for legibility; lines are not roads.",
        10,
      );
      const loLat = Math.min(...places.map((i) => i.lat)),
        hiLat = Math.max(...places.map((i) => i.lat)),
        loLng = Math.min(...places.map((i) => i.lng)),
        hiLng = Math.max(...places.map((i) => i.lng));
      const positions: { x: number; y: number }[] = [];
      for (const item of places) {
        const base = {
          x: 65 + ((item.lng - loLng) / Math.max(0.01, hiLng - loLng)) * 420,
          y: 230 + ((item.lat - loLat) / Math.max(0.01, hiLat - loLat)) * 430,
        };
        let pos = { ...base },
          attempt = 0;
        while (
          positions.some((p) => Math.hypot(p.x - pos.x, p.y - pos.y) < 29) &&
          attempt < 80
        ) {
          attempt++;
          const angle = attempt * 2.4,
            radius = 12 * Math.sqrt(attempt);
          pos = {
            x: Math.max(60, Math.min(525, base.x + Math.cos(angle) * radius)),
            y: Math.max(225, Math.min(690, base.y + Math.sin(angle) * radius)),
          };
        }
        positions.push(pos);
      }
      positions.forEach((pos, i) => {
        if (i)
          page.drawLine({
            start: positions[i - 1],
            end: pos,
            thickness: 1.5,
            color: rgb(0.12, 0.23, 0.3),
          });
        page.drawCircle({ ...pos, size: 11, color: rgb(1, 0.42, 0.21) });
        const number = String(i + 1);
        page.drawText(number, {
          x: pos.x - font.widthOfTextAtSize(number, 10) / 2,
          y: pos.y - 3.5,
          font,
          size: 10,
          color: rgb(0.05, 0.1, 0.13),
        });
      });
      y = 190;
      places.forEach((p, i) =>
        write(
          `${i + 1}. ${p.name} (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})`,
          9,
        ),
      );
    }
  const count = pdf.getPageCount();
  pdf.getPages().forEach((p, i) =>
    p.drawText(`${i + 1} / ${count}`, {
      x: 510,
      y: 25,
      size: 9,
      font,
      color: rgb(0.3, 0.4, 0.45),
    }),
  );
  return pdf.save();
}
export function pdfResponse(bytes: Uint8Array, name: string) {
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
