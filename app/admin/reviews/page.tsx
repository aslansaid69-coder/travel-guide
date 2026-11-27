import Link from "next/link";
import { requirePage } from "@/lib/auth/session";
import { database } from "@/lib/db";
import { likePattern, listParams, offset, PAGE_SIZE, type SearchParams } from "@/lib/admin/list";
import { Badge, Empty, Filters, formatDate, Notice, PageHeader, Pagination } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/confirm";
import { moderate } from "./actions";

export const metadata = { title: "Reviews" };
const STATUSES = ["pending", "approved", "rejected"] as const;

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage("reviews.moderate", "/admin/reviews");
  const raw = await searchParams;
  const p = listParams({ status: "pending", ...raw });
  const status = (STATUSES as readonly string[]).includes(p.status) ? p.status : "";
  const sql = database();
  const like = likePattern(p.q);
  const where = sql`(${p.q} = '' OR r.body ILIKE ${like} OR r.author_name ILIKE ${like} OR c.data->>'name' ILIKE ${like}) AND (${status} = '' OR r.status = ${status})`;
  const [rows, count] = await Promise.all([
    sql`SELECT r.*,c.data->>'name' AS place,COALESCE(NULLIF(c.data->>'slug',''),c.id) AS slug FROM place_reviews r JOIN hub_catalog c ON c.id=r.place_id WHERE ${where} ORDER BY r.created_at DESC LIMIT ${PAGE_SIZE} OFFSET ${offset(p)}`,
    sql`SELECT count(*)::int AS n FROM place_reviews r JOIN hub_catalog c ON c.id=r.place_id WHERE ${where}`,
  ]);
  return (
    <>
      <PageHeader
        title="Reviews"
        intro="Traveller reviews appear on place pages after approval. Every review comes from a completed trip (“Verified trip”). Google reviews are shown live and cannot be edited."
      >
        <Link className="admin-button" href="/admin/hub">
          Guide & trip reviews (travel desk) →
        </Link>
      </PageHeader>
      <Notice message={raw.notice} tone="ok" />
      <Notice message={raw.error} tone="bad" />
      <Filters params={p} statuses={STATUSES} placeholder="Search text, author or place" />
      <div className="admin-results">
        {rows.map((r) => (
          <article key={String(r.id)} className="admin-card">
            <p>
              <Link href={`/places/${String(r.slug)}`} target="_blank">
                <strong>{String(r.place)}</strong>
              </Link>{" "}
              · {"★".repeat(Number(r.rating))} · {String(r.author_name)} · {formatDate(r.created_at as string)}{" "}
              <Badge tone={r.status === "approved" ? "ok" : r.status === "rejected" ? "bad" : "warn"}>{String(r.status)}</Badge>{" "}
              {r.verified ? <Badge tone="ok">Verified trip · {String(r.booking_ref)}</Badge> : null}
            </p>
            {r.title ? <strong>{String(r.title)}</strong> : null}
            <p style={{ whiteSpace: "pre-wrap" }}>{String(r.body)}</p>
            <form action={moderate} className="admin-actions">
              <input type="hidden" name="id" value={String(r.id)} />
              <input name="note" placeholder="Internal note (optional)" maxLength={500} defaultValue={String(r.moderation_note || "")} />
              <SubmitButton name="status" value="approved">Approve</SubmitButton>
              <SubmitButton name="status" value="rejected" variant="default">Reject</SubmitButton>
            </form>
          </article>
        ))}
      </div>
      {!rows.length && <Empty>Nothing to moderate.</Empty>}
      <Pagination base="/admin/reviews" params={p} total={Number(count[0]?.n || 0)} />
    </>
  );
}
