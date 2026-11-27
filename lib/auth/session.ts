import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./server";
import { ownerEmails } from "./owner";
import { can, roleFromDatabase, type Permission, type Role } from "./roles";
import { database } from "@/lib/db";
import { HttpError } from "@/lib/hub/security";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

/**
 * Resolves the signed-in user and their role, once per request.
 * Only verified emails count. OWNER is granted solely by the server-side
 * OWNER_EMAILS allowlist (and recorded in staff_roles for auditing).
 */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  let user: { id: string; email: string; name?: string | null; emailVerified: boolean } | undefined;
  try {
    const { data } = await getAuth().getSession();
    user = data?.user;
  } catch {
    return null;
  }
  if (!user?.emailVerified) return null;
  const email = user.email.toLowerCase();
  const sql = database();
  if (ownerEmails().includes(email)) {
    await sql`INSERT INTO staff_roles (user_id,email,role) VALUES (${user.id},${user.email},'owner') ON CONFLICT (user_id) DO UPDATE SET email=EXCLUDED.email,role='owner'`;
    return { id: user.id, email: user.email, name: user.name || "", role: "owner" };
  }
  const rows = await sql`SELECT role FROM staff_roles WHERE user_id=${user.id}`;
  const stored = roleFromDatabase(rows[0]?.role as string | undefined);
  // An owner row without a matching allowlist entry is not trusted.
  const role: Role = stored === "owner" ? "tourist" : stored;
  return { id: user.id, email: user.email, name: user.name || "", role };
});

/** For route handlers and server actions: throws 401/403 instead of rendering. */
export async function authorize(permission: Permission): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Sign in to continue.");
  if (!can(user.role, permission))
    throw new HttpError(403, "Your role does not allow this action.");
  return user;
}

/** For server components/pages: redirects instead of throwing. */
export async function requirePage(permission: Permission, next = "/admin") {
  const user = await currentUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  if (!can(user.role, permission)) redirect("/account?denied=1");
  return user;
}

/** Client IP and user agent for the audit log (best effort, never trusted for auth). */
export async function requestContext() {
  const h = await headers();
  return {
    ip:
      h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "",
    userAgent: (h.get("user-agent") || "").slice(0, 300),
  };
}
