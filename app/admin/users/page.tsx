import { requirePage } from "@/lib/auth/session";
import { can, roleFromDatabase, ROLE_LABELS } from "@/lib/auth/roles";
import { database } from "@/lib/db";
import { likePattern, listParams, offset, PAGE_SIZE, type SearchParams } from "@/lib/admin/list";
import { Badge, Empty, Filters, formatDate, Notice, PageHeader, Pagination } from "@/components/admin/ui";
import { ConfirmButton } from "@/components/admin/confirm";
import { setRole } from "./actions";

export const metadata = { title: "Users & roles" };
const ROLE_FILTERS = ["owner", "admin", "guide", "partner", "tourist"] as const;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const viewer = await requirePage("users.view", "/admin/users");
  const raw = await searchParams;
  const p = listParams(raw);
  const sql = database();
  const like = likePattern(p.q);
  const roleFilter = ROLE_FILTERS.includes(p.status as (typeof ROLE_FILTERS)[number]) ? p.status : "";
  let rows: Record<string, unknown>[] = [];
  let total = 0;
  let error = "";
  try {
    const where = sql`(${p.q} = '' OR u.email ILIKE ${like} OR u.name ILIKE ${like}) AND (${roleFilter} = '' OR COALESCE(CASE WHEN s.role='manager' THEN 'admin' ELSE s.role END,'tourist') = ${roleFilter})`;
    rows = await sql`SELECT u.id,u.name,u.email,u."emailVerified" AS verified,u."createdAt" AS created_at,s.role,s.updated_at FROM neon_auth."user" u LEFT JOIN staff_roles s ON s.user_id=u.id WHERE ${where} ORDER BY (s.role IS NULL), s.role, u."createdAt" DESC LIMIT ${PAGE_SIZE} OFFSET ${offset(p)}`;
    total = Number(
      (await sql`SELECT count(*)::int AS n FROM neon_auth."user" u LEFT JOIN staff_roles s ON s.user_id=u.id WHERE ${where}`)[0]?.n || 0,
    );
  } catch {
    error = "The user directory is unavailable (Neon Auth tables not reachable).";
  }
  const manage = can(viewer.role, "users.manage");
  return (
    <>
      <PageHeader
        title="Users & roles"
        intro="Everyone who signed in with a verified email. Only the owner changes roles; the owner role itself comes from OWNER_EMAILS on the server."
      />
      <Notice message={raw.notice} tone="ok" />
      <Notice message={raw.error || error} tone="bad" />
      <Filters params={p} statuses={ROLE_FILTERS} placeholder="Search email or name" />
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Joined</th>
              {manage && <th>Change role</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const role = roleFromDatabase(r.role as string | null);
              const self = r.id === viewer.id;
              return (
                <tr key={String(r.id)}>
                  <td>
                    <strong>{String(r.email)}</strong>
                    <small>{String(r.name || "")}</small>
                  </td>
                  <td>
                    <Badge tone={role === "owner" ? "ok" : undefined}>{ROLE_LABELS[role]}</Badge>
                  </td>
                  <td>{formatDate(r.created_at as string)}</td>
                  {manage && (
                    <td>
                      {role === "owner" || self ? (
                        <span className="admin-muted">Protected</span>
                      ) : (
                        <form action={setRole} className="admin-actions">
                          <input type="hidden" name="userId" value={String(r.id)} />
                          <select name="role" defaultValue={role === "tourist" ? "none" : role} aria-label="New role">
                            <option value="none">Tourist</option>
                            <option value="admin">Admin</option>
                            <option value="guide">Guide</option>
                            <option value="partner">Partner</option>
                          </select>
                          <ConfirmButton variant="default" message="Change this user's role? The change is logged.">
                            Save
                          </ConfirmButton>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && !error && <Empty>No users match these filters.</Empty>}
      <Pagination base="/admin/users" params={p} total={total} />
      <p className="admin-muted">
        Guides should be invited from Guides → Invite so their profile, terms and calendar are linked. Assigning the Guide role here
        only grants access to the guide workspace.
      </p>
    </>
  );
}
