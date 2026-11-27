import type { Photo } from "@/lib/hub/types";

/** One photo per line: URL | alt text | author | licence | source page URL */
export function parsePhotos(text: string): Photo[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 24)
    .map((line) => {
      const [url = "", alt = "", author = "", licence = "", sourceUrl = ""] = line.split("|").map((s) => s.trim());
      return { url, alt, author, licence, sourceUrl, licenceUrl: "", provider: /wikimedia\.org/.test(url) ? "wikimedia" : "owner" } as Photo;
    })
    .filter((p) => /^https:\/\//.test(p.url) || p.url.startsWith("/images/"));
}


export function photosToText(photos: Photo[]) {
  return photos
    .map((p) => [p.url, p.alt, p.author, p.licence, p.sourceUrl].join(" | ").replace(/( \| )+$/, ""))
    .join("\n");
}
