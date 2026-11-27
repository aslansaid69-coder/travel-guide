const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya", ә: "a", ғ: "g", қ: "q", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};

/** URL slug from any name (Latin, Russian or Kazakh Cyrillic). */
export function slugify(input: string, max = 80) {
  const latin = [...input.toLowerCase()].map((c) => CYRILLIC[c] ?? c).join("");
  const slug = latin
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return slug || "place";
}

/** Appends -2, -3… until `taken` returns false. */
export async function uniqueSlug(base: string, taken: (slug: string) => Promise<boolean>) {
  const root = slugify(base);
  for (let i = 1; i < 200; i++) {
    const candidate = i === 1 ? root : `${root.slice(0, 74)}-${i}`;
    if (!(await taken(candidate))) return candidate;
  }
  return `${root.slice(0, 60)}-${Date.now().toString(36)}`;
}
