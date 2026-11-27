import Link from "next/link";
import { requirePage } from "@/lib/auth/session";
import { database } from "@/lib/db";
import { likePattern, listParams, offset, PAGE_SIZE, type SearchParams } from "@/lib/admin/list";
import { paymentProvider } from "@/lib/payments";
import { Badge, Empty, Filters, formatDate, formatMoney, PageHeader, Pagination } from "@/components/admin/ui";

export const metadata = { title: "Payments" };
const STATUSES = ["created", "paid", "failed", "expired", "refunded", "partially_refunded"] as const;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePage("payments.view", "/admin/payments");
  const p = listParams(await searchParams);
  const status = (STATUSES as readonly string[]).includes(p.status) ? p.status : "";
  const sql = database();
  const like = likePattern(p.q);
  const where = sql`(${p.q} = '' OR t.id ILIKE ${like} OR t.booking_id ILIKE ${like} OR t.provider_payment_id ILIKE ${like} OR b.email ILIKE ${like}) AND (${status} = '' OR t.status = ${status})`;
  const [rows, count, totals] = await Promise.all([
    sql`SELECT t.*,b.email FROM tour_payments t JOIN tour_bookings b ON b.id=t.booking_id WHERE ${where} ORDER BY t.created_at DESC LIMIT ${PAGE_SIZE} OFFSET ${offset(p)}`,
    sql`SELECT count(*)::int AS n FROM tour_payments t JOIN tour_bookings b ON b.id=t.booking_id WHERE ${where}`,
    sql`SELECT currency, sum(amount_minor - refunded_minor) FILTER (WHERE status IN ('paid','partially_refunded'))::bigint AS net, count(*) FILTER (WHERE status='paid')::int AS paid FROM tour_payments WHERE created_at > now() - interval '30 days' GROUP BY currency`,
  ]);
  const provider = paymentProvider();
  return (
    <>
      <PageHeader title="Payments" intro="Card payments for self-service tours. Refunds are issued from a booking.">
        {user.role === "owner" && (
          <Link className="admin-button" href="/admin/payments/desk">
            Travel-desk payments, codes & payouts →
          </Link>
        )}
      </PageHeader>
      <div className="admin-grid">
        <div className="admin-card admin-stat">
          <span>Provider</span>
          <strong>{provider.label}</strong>
          <Badge tone={provider.configured() ? (provider.testMode() ? "warn" : "ok") : "bad"}>
            {provider.configured() ? (provider.testMode() ? "Test mode" : "Live") : "Not configured"}
          </Badge>
        </div>
        {totals.map((t) => (
          <div className="admin-card admin-stat" key={String(t.currency)}>
            <span>Net received · 30 days · {String(t.currency)}</span>
            <strong>{formatMoney(Number(t.net || 0), String(t.currency))}</strong>
            <span>{Number(t.paid)} payments</span>
          </div>
        ))}
      </div>
      <Filters params={p} statuses={STATUSES} placeholder="Search payment, booking or email" />
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Payment</th>
              <th>Booking</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td>
                  {String(r.id)}
                  <small>
                    {String(r.provider)} {r.livemode ? "· LIVE" : "· test"} · {String(r.provider_payment_id || r.provider_session_id || "")}
                  </small>
                </td>
                <td>
                  <Link href={`/admin/bookings/${String(r.booking_id)}`}>{String(r.booking_id)}</Link>
                  <small>{String(r.email)}</small>
                </td>
                <td>
                  {formatMoney(Number(r.amount_minor), String(r.currency))}
                  {Number(r.refunded_minor) > 0 && <small>refunded {formatMoney(Number(r.refunded_minor), String(r.currency))}</small>}
                </td>
                <td>
                  <Badge tone={r.status === "paid" ? "ok" : r.status === "created" ? "warn" : "bad"}>{String(r.status)}</Badge>
                </td>
                <td>{formatDate(r.created_at as string)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <Empty>No payments yet.</Empty>}
      <Pagination base="/admin/payments" params={p} total={Number(count[0]?.n || 0)} />
    </>
  );
}
