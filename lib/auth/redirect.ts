/** Only same-site relative paths are accepted as a post-login destination (no open redirects). */
export function safeNext(value: string | string[] | undefined | null) {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.includes("\\")) return "";
  if ([...v].some((c) => c.charCodeAt(0) < 32)) return "";
  return v.slice(0, 500);
}
