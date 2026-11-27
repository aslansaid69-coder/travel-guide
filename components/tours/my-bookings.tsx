import Link from "next/link";
import { database } from "@/lib/db";
import { currentUser } from "@/lib/auth/session";
import { STATUS_LABELS, type BookingStatus } from "@/lib/tours/status";

/** Server component: the signed-in traveller's tour bookings (shown on /account). */
export async function MyBookings() {
  const user = await currentUser();
  if (!user) return null;
  const rows = await database()`SELECT id,start_date,end_date,status,place_ids,estimate_min_minor,estimate_max_minor,currency FROM tour_bookings WHERE user_id=${user.id} ORDER BY created_at DESC LIMIT 50`.catch(() => []);
  if (!rows.length) return null;
  const money = (m: unknown, c: unknown) =>
    new Intl.NumberFormat("ru-KZ", { style: "currency", currency: String(c), maximumFractionDigits: 0 }).format(Number(m) / 100);
  return (
    <section className="tour-card" style={{ marginBottom: 20 }}>
      <h2>Your tours · Ваши туры</h2>
      <ul>
        {rows.map((r) => (
          <li key={String(r.id)}>
            <Link href={`/bookings/${String(r.id)}`}>
              {String(r.start_date).slice(0, 10)} · {(r.place_ids as string[]).length} places ·{" "}
              {STATUS_LABELS[r.status as BookingStatus]?.en} · ≈ {money(r.estimate_min_minor, r.currency)}–{money(r.estimate_max_minor, r.currency)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
