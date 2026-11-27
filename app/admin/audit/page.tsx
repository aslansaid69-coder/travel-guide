import { requirePage } from "@/lib/auth/session";
import { database } from "@/lib/db";
import { likePattern, listParams, offset, PAGE_SIZE, type SearchParams } from "@/lib/admin/list";
import { Empty, Filters, formatDate, PageHeader, Pagination } from "@/components/admin/ui";

export const metadata = { title: "Audit log" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePage("audit.view", "/admin/audit");
  const p = listParams(await searchParams);
  const sql = database();
  const like = likePattern(p.q);
  const where = sql`(${p.q} = '' OR action ILIKE ${like} OR resource ILIKE ${like} OR actor_email ILIKE ${like} OR actor ILIKE ${like}) AND (${p.status} = '' OR split_part(action,'.',1) = ${p.status})`;
  const [rows, count, groups] = await Promise.all([
    sql`SELECT id,actor,actor_email,actor_role,action,resource,details,ip,created_at FROM admin_audit WHERE ${where} ORDER BY created_at DESC LIMIT ${PAGE_SIZE} OFFSET ${offset(p)}`,
    sql`SELECT count(*)::int AS n FROM admin_audit WHERE ${where}`,
    sql`SELECT DISTINCT split_part(action,'.',1) AS g FROM admin_audit ORDER BY 1 LIMIT 50`,
  ]);
  return (
    <>
      <PageHeader
        title="Audit log"
        intro="Every administrative change: who did it, what changed and when (Asia/Almaty time). Entries are append-only."
      />
      <Filters
        params={p}
        statuses={groups.map((g) => String(g.g))}
        placeholder="Search action, resource or email"
      />
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td>{formatDate(r.created_at as string)}</td>
                <td>
                  {String(r.actor_email || r.actor)}
                  <small>
                    {String(r.actor_role || "")} {r.ip ? `· ${String(r.ip)}` : ""}
                  </small>
                </td>
                <td>
                  <code>{String(r.action)}</code>
                </td>
                <td>{String(r.resource)}</td>
                <td>
                  <small>{JSON.stringify(r.details).slice(0, 240)}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <Empty>No entries yet.</Empty>}
      <Pagination base="/admin/audit" params={p} total={Number(count[0]?.n || 0)} />
    </>
  );
}
