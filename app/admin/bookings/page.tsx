import Link from "next/link";
import { requirePage } from "@/lib/auth/session";
import { database } from "@/lib/db";
import { likePattern, listParams, offset, PAGE_SIZE, type SearchParams } from "@/lib/admin/list";
import { BOOKING_STATUSES, STATUS_LABELS, statusTone as tone, type BookingStatus } from "@/lib/tours/status";
import { Badge, Empty, Filters, formatDate, formatMoney, Notice, PageHeader, Pagination } from "@/components/admin/ui";

export const metadata = { title: "Bookings" };

export default async function BookingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage("bookings.view", "/admin/bookings");
  const raw = await searchParams;
  const p = listParams(raw);
  const status = (BOOKING_STATUSES as readonly string[]).includes(p.status) ? p.status : "";
  const sql = database();
  const like = likePattern(p.q);
  const where = sql`(${p.q} = '' OR b.id ILIKE ${like} OR b.email ILIKE ${like} OR b.contact->>'name' ILIKE ${like} OR b.contact->>'phone' ILIKE ${like}) AND (${status} = '' OR b.status = ${status})`;
  const [rows, count] = await Promise.all([
    sql`SELECT b.id,b.email,b.contact,b.status,b.start_date,b.end_date,b.adults,b.children,b.estimate_min_minor,b.estimate_max_minor,b.paid_minor,b.currency,b.created_at,g.data->>'name' AS guide FROM tour_bookings b LEFT JOIN guides g ON g.id=b.guide_id WHERE ${where} ORDER BY b.created_at DESC LIMIT ${PAGE_SIZE} OFFSET ${offset(p)}`,
    sql`SELECT count(*)::int AS n FROM tour_bookings b WHERE ${where}`,
  ]);
  return (
    <>
      <PageHeader title="Bookings" intro="Self-service tours. Status: pending → paid → confirmed → completed, or cancelled / refunded.">
        <Link className="admin-button" href="/admin/hub">
          Travel-desk requests →
        </Link>
      </PageHeader>
      <Notice message={raw.notice} tone="ok" />
      <Filters params={p} statuses={BOOKING_STATUSES} placeholder="Search id, email, name or phone" />
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Booking</th>
              <th>Traveller</th>
              <th>Dates</th>
              <th>Guide</th>
              <th>Estimate</th>
              <th>Paid</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = r.status as BookingStatus;
              const contact = r.contact as { name?: string; phone?: string };
              return (
                <tr key={String(r.id)}>
                  <td>
                    <Link href={`/admin/bookings/${String(r.id)}`}>
                      <strong>{String(r.id)}</strong>
                    </Link>
                    <small>{formatDate(r.created_at as string)}</small>
                  </td>
                  <td>
                    {contact.name || "—"}
                    <small>{String(r.email)} · {contact.phone}</small>
                  </td>
                  <td>
                    {String(r.start_date).slice(0, 10)}
                    <small>
                      {Number(r.adults) + Number(r.children)} travellers
                    </small>
                  </td>
                  <td>{String(r.guide || "—")}</td>
                  <td>
                    {formatMoney(Number(r.estimate_min_minor), String(r.currency))}–{formatMoney(Number(r.estimate_max_minor), String(r.currency))}
                  </td>
                  <td>{formatMoney(Number(r.paid_minor), String(r.currency))}</td>
                  <td>
                    <Badge tone={tone(s)}>{STATUS_LABELS[s].en}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && <Empty>No bookings match.</Empty>}
      <Pagination base="/admin/bookings" params={p} total={Number(count[0]?.n || 0)} />
    </>
  );
}
