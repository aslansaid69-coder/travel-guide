import { getAuth } from "./server";
import { database } from "@/lib/db";
export const ownerEmails = () =>
  (process.env.OWNER_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
export async function ownerSession() {
  try {
    const { data: session } = await getAuth().getSession();
    const user = session?.user;
    if (
      !user ||
      !user.emailVerified ||
      !ownerEmails().includes(user.email.toLowerCase())
    )
      return null;
    const sql = database();
    // Only verified addresses in the server-side owner allowlist can bootstrap an owner role.
    const roles =
      await sql`INSERT INTO staff_roles (user_id,email,role) VALUES (${user.id},${user.email},'owner') ON CONFLICT (user_id) DO UPDATE SET email=EXCLUDED.email RETURNING role`;
    if (roles[0]?.role !== "owner") return null;
    return { id: user.id, email: user.email };
  } catch {
    return null;
  }
}
export function sameOrigin(request: Request) {
  try {
    return (
      new URL(request.headers.get("origin") || "").host ===
      (request.headers.get("host") || new URL(request.url).host)
    );
  } catch {
    return false;
  }
}
