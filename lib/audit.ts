import "server-only";
import { database } from "@/lib/db";
import { requestContext, type CurrentUser } from "@/lib/auth/session";

/**
 * Append-only admin action log: who (id, email, role), what (action + resource),
 * details (JSON, never secrets), when, and from where (IP / user agent).
 */
export async function recordAudit(
  actor: Pick<CurrentUser, "id" | "email" | "role">,
  action: string,
  resource: string,
  details: Record<string, unknown> = {},
) {
  const ctx = await requestContext().catch(() => ({ ip: "", userAgent: "" }));
  await database()`INSERT INTO admin_audit(actor,actor_email,actor_role,action,resource,details,ip,user_agent) VALUES(${actor.id},${actor.email},${actor.role},${action.slice(0, 120)},${resource.slice(0, 300)},${JSON.stringify(details)}::jsonb,${ctx.ip},${ctx.userAgent})`;
}
