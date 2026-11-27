import Link from "next/link";
import { requirePage } from "@/lib/auth/session";
import { database } from "@/lib/db";
import { claudeConfigured } from "@/lib/ai/claude";
import { paymentProvider } from "@/lib/payments";
import { configuredProviders } from "@/lib/places/providers";
import { BOOKING_STATUSES, STATUS_LABELS, statusTone, type BookingStatus } from "@/lib/tours/status";
import { Badge, formatDate, formatMoney, PageHeader } from "@/components/admin/ui";

export const metadata = { title: "Dashboard" };

/** Runs a dashboard query; a failing widget never breaks the whole page. */
async function safe<T>(fn: () => Promise<T>, fallback: T) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export default async function Dashboard() {
  const user = await requirePage("dashboard.view");
  const sql = database();
  type Row = Record<string, unknown>;
  const [byStatus, revenue, deskRevenue, reviews, places, assistant, recent, upcoming] = await Promise.all([
    safe(() => sql`SELECT status, count(*)::int AS n FROM tour_bookings GROUP BY status`, [] as Row[]),
    safe(
      () =>
        sql`SELECT currency, sum(amount_minor - refunded_minor)::bigint AS net, count(*)::int AS n FROM tour_payments WHERE status IN ('paid','partially_refunded') AND created_at > now() - interval '30 days' GROUP BY currency`,
      [] as Row[],
    ),
    safe(
      () =>
        sql`SELECT currency, sum(amount_minor - refunded_minor)::bigint AS net FROM hub_payment_sessions WHERE status='paid' AND created_at > now() - interval '30 days' GROUP BY currency`,
      [] as Row[],
    ),
    safe(
      () =>
        sql`SELECT (SELECT count(*) FROM place_reviews WHERE status='pending')::int AS places, (SELECT count(*) FROM guide_reviews WHERE status='pending')::int AS guides, (SELECT count(*) FROM hub_reviews WHERE status='pending')::int AS trips, (SELECT count(*) FROM place_reviews WHERE created_at > now() - interval '7 days')::int AS week`,
      [] as Row[],
    ),
    safe(
      () =>
        sql`SELECT count(*) FILTER (WHERE status='approved')::int AS published, count(*) FILTER (WHERE status='pending')::int AS drafts, count(*) FILTER (WHERE COALESCE(data->>'priceStatus','unknown') <> 'found' AND status='approved')::int AS unpriced FROM hub_catalog`,
      [] as Row[],
    ),
    safe(
      () => sql`SELECT count(*) FILTER (WHERE created_at > date_trunc('day', now()))::int AS today FROM assistant_messages WHERE role='user'`,
      [] as Row[],
    ),
    safe(
      () =>
        sql`SELECT id,email,status,start_date,estimate_max_minor,currency,created_at FROM tour_bookings ORDER BY created_at DESC LIMIT 6`,
      [] as Row[],
    ),
    safe(
      () =>
        sql`SELECT b.id,b.start_date,b.status,b.contact->>'name' AS name,g.data->>'name' AS guide FROM tour_bookings b LEFT JOIN guides g ON g.id=b.guide_id WHERE b.status IN ('paid','confirmed') AND b.start_date >= current_date ORDER BY b.start_date LIMIT 6`,
      [] as Row[],
    ),
  ]);
  const count = (s: BookingStatus) => Number(byStatus.find((r) => r.status === s)?.n || 0);
  const r = reviews[0] || {};
  const pendingReviews = Number(r.places || 0) + Number(r.guides || 0) + Number(r.trips || 0);
  const pay = paymentProvider();
  const setup = [
    { label: "Database", ok: !!process.env.DATABASE_URL },
    { label: "Sign-in (Neon Auth)", ok: !!process.env.NEON_AUTH_BASE_URL && !!process.env.NEON_AUTH_COOKIE_SECRET },
    { label: "Claude (ANTHROPIC_API_KEY)", ok: claudeConfigured() },
    { label: `Payments (${pay.label}${pay.configured() && pay.testMode() ? ", test mode" : ""})`, ok: pay.configured() },
    { label: "Google Places", ok: !!process.env.GOOGLE_PLACES_API_KEY },
    { label: `Place import: ${configuredProviders().map((p) => p.id).join(", ")}`, ok: true },
    { label: "Email (Resend)", ok: !!process.env.RESEND_API_KEY },
  ];
  return (
    <>
      <PageHeader title={`Hello, ${user.name || user.email.split("@")[0]}`} intro="What needs your attention today." />
      <div className="admin-grid">
        <Link href="/admin/bookings?status=paid" className="admin-card admin-stat">
          <span>Paid — awaiting confirmation</span>
          <strong>{count("paid")}</strong>
        </Link>
        <Link href="/admin/bookings?status=pending" className="admin-card admin-stat">
          <span>Awaiting payment</span>
          <strong>{count("pending")}</strong>
        </Link>
        <Link href="/admin/bookings?status=confirmed" className="admin-card admin-stat">
          <span>Confirmed tours</span>
          <strong>{count("confirmed")}</strong>
        </Link>
        <Link href="/admin/payments" className="admin-card admin-stat">
          <span>Revenue · 30 days</span>
          <strong>
            {[...revenue, ...deskRevenue].length
              ? Object.entries(
                  [...revenue, ...deskRevenue].reduce<Record<string, number>>((a, x) => {
                    const c = String(x.currency).toUpperCase();
                    a[c] = (a[c] || 0) + Number(x.net || 0);
                    return a;
                  }, {}),
                )
                  .map(([c, v]) => formatMoney(v, c))
                  .join(" · ")
              : formatMoney(0)}
          </strong>
          <span>tours + travel desk</span>
        </Link>
        <Link href="/admin/reviews" className="admin-card admin-stat">
          <span>Reviews to moderate</span>
          <strong>{pendingReviews}</strong>
          <span>{Number(r.week || 0)} new this week</span>
        </Link>
        <Link href="/admin/places?status=draft" className="admin-card admin-stat">
          <span>Places</span>
          <strong>{Number(places[0]?.published || 0)} published</strong>
          <span>
            {Number(places[0]?.drafts || 0)} drafts · {Number(places[0]?.unpriced || 0)} without a price
          </span>
        </Link>
        <Link href="/admin/assistant" className="admin-card admin-stat">
          <span>Assistant questions today</span>
          <strong>{Number(assistant[0]?.today || 0)}</strong>
        </Link>
      </div>
      <div className="admin-two">
        <div>
          <section className="admin-card">
            <h2>Upcoming tours</h2>
            {upcoming.length ? (
              <ul>
                {upcoming.map((b) => (
                  <li key={String(b.id)}>
                    <Link href={`/admin/bookings/${String(b.id)}`}>
                      {String(b.start_date).slice(0, 10)} · {String(b.name || "")} · guide {String(b.guide || "—")}
                    </Link>{" "}
                    <Badge tone={statusTone(b.status as BookingStatus)}>{STATUS_LABELS[b.status as BookingStatus].en}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="admin-muted">No paid or confirmed tours ahead.</p>
            )}
          </section>
          <section className="admin-card">
            <h2>Latest bookings</h2>
            {recent.length ? (
              <ul>
                {recent.map((b) => (
                  <li key={String(b.id)}>
                    <Link href={`/admin/bookings/${String(b.id)}`}>
                      {formatDate(b.created_at as string)} · {String(b.email)} · ≤ {formatMoney(Number(b.estimate_max_minor), String(b.currency))}
                    </Link>{" "}
                    <Badge tone={statusTone(b.status as BookingStatus)}>{STATUS_LABELS[b.status as BookingStatus].en}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="admin-muted">No bookings yet — share /build with your first travellers.</p>
            )}
            <p className="admin-muted">
              {BOOKING_STATUSES.map((s) => `${STATUS_LABELS[s].en}: ${count(s)}`).join(" · ")}
            </p>
          </section>
        </div>
        <section className="admin-card">
          <h2>Setup</h2>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 6 }}>
            {setup.map((s) => (
              <li key={s.label}>
                <Badge tone={s.ok ? "ok" : "bad"}>{s.ok ? "OK" : "Missing"}</Badge> {s.label}
              </li>
            ))}
          </ul>
          <p className="admin-muted">Keys are set in Vercel → Project → Settings → Environment Variables, then redeploy.</p>
        </section>
      </div>
    </>
  );
}
