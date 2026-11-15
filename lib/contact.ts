export function validateContact(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.name !== "string" ||
    typeof v.email !== "string" ||
    typeof v.message !== "string"
  )
    return null;
  const name = v.name.trim(),
    email = v.email.trim(),
    message = v.message.trim();
  if (
    name.length < 2 ||
    name.length > 100 ||
    /[\r\n]/.test(name) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    message.length < 10 ||
    message.length > 4000
  )
    return null;
  return {
    name,
    email,
    message,
    website: typeof v.website === "string" ? v.website : "",
  };
}
