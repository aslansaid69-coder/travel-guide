/**
 * Role-based access control. Pure functions only (no I/O) so they can be unit
 * tested and imported from proxy, route handlers, server actions and pages.
 *
 * OWNER   – the business owner (bootstrapped from OWNER_EMAILS). Everything.
 * ADMIN   – trusted staff: catalog, bookings, reviews, conversations.
 * GUIDE   – invited guides: their own tours, calendar and earnings (/guide).
 * PARTNER – legacy restaurant partner (menus only, no /admin access).
 * TOURIST – any signed-in traveller with a verified email.
 */
export const ROLES = ["owner", "admin", "guide", "partner", "tourist"] as const;
export type Role = (typeof ROLES)[number];

/** Roles that may be stored in `staff_roles` and assigned by the owner. */
export const ASSIGNABLE_ROLES = ["admin", "guide", "partner"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

const STAFF: readonly Role[] = ["owner", "admin"];
const OWNER: readonly Role[] = ["owner"];

export const PERMISSIONS = {
  "admin.access": STAFF,
  "dashboard.view": STAFF,
  "places.read": STAFF,
  "places.write": STAFF,
  "places.delete": STAFF,
  "places.import": STAFF,
  "places.ai": STAFF,
  "guides.view": STAFF,
  "guides.manage": OWNER,
  "bookings.view": STAFF,
  "bookings.manage": STAFF,
  "payments.view": STAFF,
  "payments.refund": OWNER,
  "reviews.moderate": STAFF,
  "pricing.manage": OWNER,
  "assistant.manage": OWNER,
  "assistant.conversations": STAFF,
  "users.view": STAFF,
  "users.manage": OWNER,
  "audit.view": STAFF,
  "settings.manage": OWNER,
  "guide.workspace": ["guide"],
  "trip.book": ["owner", "admin", "guide", "partner", "tourist"],
  "review.write": ["tourist", "owner", "admin", "guide", "partner"],
} as const satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof PERMISSIONS;

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role | null | undefined, permission: Permission) {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/**
 * Maps a `staff_roles.role` value to an application role. `manager` is the
 * legacy name of ADMIN (migration 009 renames stored rows). Missing or unknown
 * values fall back to TOURIST, never to a privileged role.
 */
export function roleFromDatabase(value: string | null | undefined): Role {
  if (value === "manager") return "admin";
  if (value === "owner" || value === "admin" || value === "guide" || value === "partner")
    return value;
  return "tourist";
}

/** Only the owner changes roles, and nobody can grant or remove OWNER through the UI. */
export function canAssignRole(
  actor: Role,
  target: Role | "none",
  currentTargetRole: Role,
) {
  if (actor !== "owner") return false;
  if (currentTargetRole === "owner") return false;
  return target === "none" || (ASSIGNABLE_ROLES as readonly string[]).includes(target);
}

/** Paths whose pages require an authenticated session before rendering. */
export function protectedArea(pathname: string): "admin" | "account" | null {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (
    pathname === "/account" ||
    pathname.startsWith("/account/") ||
    pathname === "/guide" ||
    pathname.startsWith("/bookings/")
  )
    return "account";
  return null;
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  guide: "Guide",
  partner: "Partner",
  tourist: "Tourist",
};
