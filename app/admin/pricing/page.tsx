import { requirePage } from "@/lib/auth/session";
import { pricingSettings } from "@/lib/tours/service";
import { estimateTour } from "@/lib/pricing/estimate";
import { formatMoney, Notice, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/confirm";
import { savePricing } from "./actions";
import type { SearchParams } from "@/lib/admin/list";

export const metadata = { title: "Pricing" };

export default async function PricingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage("pricing.manage", "/admin/pricing");
  const raw = await searchParams;
  const s = await pricingSettings();
  // Worked example so the owner sees the effect of the tariffs.
  const example = estimateTour(
    {
      places: [
        { id: "a", name: "Kok-Tobe", lat: 43.2223, lng: 76.975, durationMin: 120, ticket: { minMinor: 600000, maxMinor: 1000000, currency: s.currency } },
        { id: "b", name: "Medeu", lat: 43.1579, lng: 77.0583, durationMin: 120, ticket: { minMinor: 0, maxMinor: 0, currency: s.currency } },
        { id: "c", name: "Shymbulak", lat: 43.1289, lng: 77.0804, durationMin: 240, ticket: { minMinor: 700000, maxMinor: 1200000, currency: s.currency } },
      ],
      adults: 2,
      children: 0,
      guide: null,
    },
    s,
  );
  const major = (minor: number) => minor / 100;
  return (
    <>
      <PageHeader title="Pricing" intro="Tariffs for the approximate tour price. Shown to travellers as a range with a breakdown." />
      <Notice message={raw.notice} tone="ok" />
      <Notice message={raw.error} tone="bad" />
      <div className="admin-two">
        <form action={savePricing} className="admin-card admin-form">
          <h2>Transport</h2>
          <div className="admin-row">
            <label>
              Currency
              <select name="currency" defaultValue={s.currency}>
                {["KZT", "USD", "EUR"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Tariff per km <small>per vehicle, incl. driver & fuel</small>
              <input name="transportPerKm" type="number" step="any" min={0} defaultValue={major(s.transportPerKmMinor)} required />
            </label>
            <label>
              Minimum per day
              <input name="transportMinPerDay" type="number" step="any" min={0} defaultValue={major(s.transportMinPerDayMinor)} required />
            </label>
            <label>
              Seats per vehicle
              <input name="vehicleCapacity" type="number" min={1} max={60} defaultValue={s.vehicleCapacity} required />
            </label>
          </div>
          <div className="admin-row">
            <label>
              Road factor <small>straight line × factor</small>
              <input name="roadFactor" type="number" step="0.05" min={1} max={3} defaultValue={s.roadFactor} required />
            </label>
            <label>
              Average speed (km/h)
              <input name="averageSpeedKmh" type="number" min={5} max={120} defaultValue={s.averageSpeedKmh} required />
            </label>
            <label>
              Upper-bound buffer (%)
              <input name="transportBufferPercent" type="number" min={0} max={100} defaultValue={s.transportBufferPercent} required />
            </label>
          </div>
          <h2>Days, guide & fees</h2>
          <div className="admin-row">
            <label>
              Touring hours per day
              <input name="hoursPerDay" type="number" step="0.5" min={3} max={16} defaultValue={s.hoursPerDay} required />
            </label>
            <label>
              Fallback guide day rate <small>used when no guide is active</small>
              <input name="fallbackGuideDay" type="number" step="any" min={0} defaultValue={major(s.fallbackGuideDayMinor)} required />
            </label>
            <label>
              Service commission (%)
              <input name="commissionPercent" type="number" step="0.5" min={0} max={50} defaultValue={s.commissionPercent} required />
            </label>
            <label>
              Online prepayment (%)
              <input name="depositPercent" type="number" min={1} max={100} defaultValue={s.depositPercent} required />
            </label>
            <label>
              Child ticket (% of adult) <small>when no child price is published</small>
              <input name="childTicketPercent" type="number" min={0} max={100} defaultValue={s.childTicketPercent} required />
            </label>
            <label>
              Max places per tour
              <input name="maxPlaces" type="number" min={1} max={12} defaultValue={s.maxPlaces} required />
            </label>
          </div>
          <h2>Start point</h2>
          <div className="admin-row">
            <label>
              Label
              <input name="startLabel" defaultValue={s.startLabel} maxLength={120} required />
            </label>
            <label>
              Latitude
              <input name="startLat" type="number" step="any" defaultValue={s.startLat} required />
            </label>
            <label>
              Longitude
              <input name="startLng" type="number" step="any" defaultValue={s.startLng} required />
            </label>
          </div>
          <div className="admin-actions">
            <SubmitButton>Save pricing</SubmitButton>
          </div>
        </form>
        <section className="admin-card">
          <h2>Example: Kok-Tobe + Medeu + Shymbulak, 2 adults</h2>
          <table className="admin-table">
            <tbody>
              {example.lines.map((l) => (
                <tr key={l.key}>
                  <td>
                    {l.label}
                    <small>{l.detail}</small>
                  </td>
                  <td>
                    {formatMoney(l.min, s.currency)}
                    {l.max !== l.min && ` – ${formatMoney(l.max, s.currency)}`}
                  </td>
                </tr>
              ))}
              <tr>
                <td><strong>Total</strong></td>
                <td>
                  <strong>
                    ≈ {formatMoney(example.total.min, s.currency)} – {formatMoney(example.total.max, s.currency)}
                  </strong>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="admin-muted">
            {example.days} day(s) · ≈ {Math.round(example.distanceKm)} km · prepayment {formatMoney(example.depositMinor, s.currency)}
          </p>
        </section>
      </div>
    </>
  );
}
