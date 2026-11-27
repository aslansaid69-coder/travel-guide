"use client";
import { useState } from "react";
import { Shell, useResource, Button, Field, Status, Money } from "./shared";
import type { CommerceSettings } from "@/lib/platform/types";
import type { CommerceAdminView } from "./view-types";
type NumericSetting = {
  [K in keyof CommerceSettings]: CommerceSettings[K] extends number ? K : never;
}[keyof CommerceSettings];
export function PaymentsAdmin() {
  const s = useResource<CommerceAdminView>("admin/commerce"),
    [edited, setConfig] = useState<CommerceSettings | null>(null),
    [link, setLink] = useState<{ url: string; whatsapp?: string } | null>(null),
    [cashId, setCashId] = useState(() => crypto.randomUUID());
  const config = edited ?? s.data?.settings ?? null;
  const change = <K extends keyof CommerceSettings>(
    k: K,
    v: CommerceSettings[K],
  ) => config && setConfig({ ...config, [k]: v });
  return (
    <Shell
      title="Every booking, accounted for."
      kicker="OWNER · PAYMENTS & OPERATIONS"
      intro="Server-verified payment records, cancellations and guide earnings. Provider credentials remain in hosting environment variables."
      admin
    >
      <Status message={s.message} busy={s.busy} />
      {s.data && (
        <>
          <div className="platform-grid">
            {Object.entries(s.data.configuration).map(([name, ready]) => (
              <div className="platform-evidence" key={name}>
                <strong>{name}</strong>
                <p>{ready ? "Configured" : "Configuration required"}</p>
              </div>
            ))}
          </div>
          <section className="platform-card platform-detail">
            <div className="platform-panel-title">
              <h2>Booking payment desk</h2>
              <Button
                busy={s.busy}
                onClick={() => void s.run({ action: "tick" })}
              >
                Run operations update now
              </Button>
            </div>
            <div className="platform-table-wrap">
              <table className="platform-table">
                <thead>
                  <tr>
                    <th>Traveller / request</th>
                    <th>Status</th>
                    <th>Amount received</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {s.data.requests.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.name}
                        <br />
                        <small>{r.id}</small>
                      </td>
                      <td>
                        {r.status} · {r.payment_status}
                      </td>
                      <td>
                        <Money
                          amount={Number(r.paid_minor)}
                          currency={r.currency}
                        />
                      </td>
                      <td>
                        <div className="platform-actions">
                          <Button
                            busy={s.busy}
                            onClick={async () => {
                              const result = await s.run({
                                action: "link",
                                requestId: r.id,
                                stay: true,
                              });
                              if (result?.url)
                                setLink(
                                  result as { url: string; whatsapp?: string },
                                );
                            }}
                          >
                            Create & email payment link
                          </Button>
                          <a
                            className="button button-outline"
                            href={`/checkout/${r.id}?plan=${r.plan_id}`}
                          >
                            Checkout
                          </a>
                          {(r.status !== "cancelled" ||
                            r.payment_status === "refund-review") && (
                            <Button
                              busy={s.busy}
                              onClick={() => {
                                if (
                                  confirm(
                                    "Cancel this package and request the card refund allowed by the accepted policy? Cash/voucher adjustments need manual review.",
                                  )
                                )
                                  void s.run({
                                    action: "refund",
                                    requestId: r.id,
                                    reason:
                                      "Owner-approved cancellation under the accepted quote policy.",
                                  });
                              }}
                            >
                              Cancel & policy refund
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {link && (
              <div className="platform-warning platform-detail">
                <p>
                  Email queued. This link grants private booking access; share
                  only with the traveller.
                </p>
                <p className="platform-code">{link.url}</p>
                <div className="platform-actions">
                  <Button
                    onClick={() => void navigator.clipboard.writeText(link.url)}
                  >
                    Copy private link
                  </Button>
                  <a
                    href={link.whatsapp}
                    className="button button-outline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open WhatsApp draft
                  </a>
                </div>
              </div>
            )}
          </section>
          {config && (
            <section className="platform-card platform-detail">
              <h2>Pricing, policies & daily operations</h2>
              <p className="platform-muted">
                Quote totals entered by the manager include these tax and fee
                amounts. Settings are snapshotted for new quotes. Existing
                accepted terms remain stable. Fixed fees and rewards use the
                quote’s settlement currency; choose values suitable for your
                operating currency.
              </p>
              <form
                className="platform-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void s.run({ action: "settings", settings: config });
                }}
              >
                <div className="platform-form-row">
                  {(
                    [
                      ["taxBps", "Tax rate (basis points; 1200 = 12%)"],
                      ["feeMinor", "Included service fee (minor units)"],
                      [
                        "freeCancellationHours",
                        "Free cancellation window (hours)",
                      ],
                      ["lateRefundPercent", "Late refund (%)"],
                      [
                        "payoutDelayHours",
                        "Guide transfer delay after trip (hours)",
                      ],
                      ["referralRewardMinor", "Referral credit (minor units)"],
                      [
                        "returningDiscountPercent",
                        "Returning traveller discount (%)",
                      ],
                      ["maxPeakPercent", "Maximum peak-day increase (%)"],
                      ["maxSlowDiscount", "Maximum slow-day discount (%)"],
                    ] as const satisfies readonly (readonly [
                      NumericSetting,
                      string,
                    ])[]
                  ).map(([key, label]) => (
                    <Field label={label} key={key}>
                      <input
                        type="number"
                        min="0"
                        value={config[key]}
                        onChange={(e) => change(key, Number(e.target.value))}
                      />
                    </Field>
                  ))}
                  <Field label="Tax label">
                    <input
                      value={config.taxLabel}
                      onChange={(e) => change("taxLabel", e.target.value)}
                    />
                  </Field>
                  <Field label="Operator tax ID">
                    <input
                      value={config.operatorTaxId}
                      onChange={(e) => change("operatorTaxId", e.target.value)}
                    />
                  </Field>
                  <Field label="Invoice reference prefix">
                    <input
                      value={config.invoicePrefix}
                      onChange={(e) => change("invoicePrefix", e.target.value)}
                    />
                  </Field>
                </div>
                <label className="platform-check">
                  <input
                    type="checkbox"
                    checked={config.ownerDigest}
                    onChange={(e) => change("ownerDigest", e.target.checked)}
                  />
                  Daily owner operations digest
                </label>
                <label className="platform-check">
                  <input
                    type="checkbox"
                    checked={config.dynamicPricing}
                    onChange={(e) => change("dynamicPricing", e.target.checked)}
                  />
                  Enable weekday pricing adjustments for new estimates
                </label>
                {config.dynamicPricing && (
                  <div className="platform-form-row">
                    {[
                      "Sunday",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                    ].map((name, i) => (
                      <Field label={`${name} adjustment (%)`} key={name}>
                        <input
                          type="number"
                          min={-config.maxSlowDiscount}
                          max={config.maxPeakPercent}
                          value={config.weekdayAdjustments[i] || 0}
                          onChange={(e) =>
                            change("weekdayAdjustments", {
                              ...config.weekdayAdjustments,
                              [i]: Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                )}
                <Field label="Client terms (published)">
                  <textarea
                    rows={6}
                    value={config.clientTerms}
                    onChange={(e) => change("clientTerms", e.target.value)}
                  />
                </Field>
                <Field label="Guide terms (published)">
                  <textarea
                    rows={6}
                    value={config.guideTerms}
                    onChange={(e) => change("guideTerms", e.target.value)}
                  />
                </Field>
                <Button primary busy={s.busy}>
                  Save policies
                </Button>
              </form>
            </section>
          )}
          <div className="platform-two platform-detail">
            <section className="platform-card">
              <h2>Create a promo or gift voucher</h2>
              <form
                className="platform-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void s.run({
                    action: "code",
                    code: {
                      code: String(f.get("code")).toUpperCase(),
                      kind: f.get("kind"),
                      percent: Number(f.get("percent")),
                      amountMinor: Math.round(Number(f.get("amount")) * 100),
                      currency: f.get("currency"),
                      maxUses: Number(f.get("uses")),
                      minimumMinor: 0,
                      customerId: String(f.get("customer") || ""),
                      startsAt: new Date().toISOString(),
                      expiresAt: new Date(
                        String(f.get("expiry")) + "T23:59:59+05:00",
                      ).toISOString(),
                      active: true,
                    },
                  });
                }}
              >
                <Field label="Code (5–64 letters, numbers, hyphens)">
                  <input name="code" required minLength={5} maxLength={64} />
                </Field>
                <Field label="Type">
                  <select name="kind">
                    <option value="promo">Promo discount</option>
                    <option value="voucher">Gift voucher credit</option>
                  </select>
                </Field>
                <div className="platform-form-row">
                  <Field label="Discount (%)">
                    <input
                      name="percent"
                      type="number"
                      min="0"
                      max="80"
                      defaultValue="0"
                    />
                  </Field>
                  <Field label="Discount / voucher value (major units)">
                    <input
                      name="amount"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue="0"
                    />
                  </Field>
                  <Field label="Currency">
                    <select name="currency">
                      {["KZT", "USD", "EUR", "GBP", "RUB"].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Maximum uses">
                    <input name="uses" type="number" min="1" defaultValue="1" />
                  </Field>
                  <Field label="Expires (Almaty date)">
                    <input name="expiry" type="date" required />
                  </Field>
                  <Field label="Verified recipient user ID (optional)">
                    <input name="customer" />
                  </Field>
                </div>
                <Button busy={s.busy}>Create immutable code</Button>
              </form>
              <p className="platform-muted">
                A gift voucher is owner-issued credit. This screen does not sell
                vouchers or charge a card.
              </p>
              {s.data.codes.map((c) => (
                <p key={c.code}>
                  <strong>{c.code}</strong> · {c.data.kind} · {c.uses}/
                  {c.data.maxUses} uses · balance{" "}
                  <Money amount={c.balance_minor} currency={c.data.currency} />
                </p>
              ))}
            </section>
            <section className="platform-card">
              <h2>Last-minute deal</h2>
              <form
                className="platform-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void s.run({
                    action: "deal",
                    itemId: f.get("item"),
                    percent: Number(f.get("percent")),
                    startsAt: new Date(String(f.get("start"))).toISOString(),
                    endsAt: new Date(String(f.get("end"))).toISOString(),
                    note: f.get("note"),
                  });
                }}
              >
                <Field label="Catalog service ID">
                  <input name="item" required />
                </Field>
                <Field label="Discount (%)">
                  <input
                    name="percent"
                    type="number"
                    min="1"
                    max="80"
                    required
                  />
                </Field>
                <Field label="Starts (device local time)">
                  <input name="start" type="datetime-local" required />
                </Field>
                <Field label="Ends">
                  <input name="end" type="datetime-local" required />
                </Field>
                <Field label="Offer note">
                  <textarea name="note" maxLength={500} />
                </Field>
                <Button busy={s.busy}>
                  Publish deal & notify opted-in waitlist
                </Button>
              </form>
              <p className="platform-muted">
                Deals are quote requests; the manager must include the
                advertised discount in the final quote. They do not reserve
                inventory or charge clients.
              </p>
            </section>
          </div>
          <section className="platform-card platform-detail">
            <h2>Guide transfer ledger</h2>
            <p>
              Each allocation requires a completed, manager-approved tour,
              sufficient settled card funds, an eligible Connect account and the
              payout delay. A transfer credits the guide’s Stripe balance; bank
              payout timing is controlled by Stripe.
            </p>
            <form
              className="platform-actions"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (
                  confirm(
                    "Release eligible guide earnings to their Connect balance?",
                  )
                )
                  void s.run({ action: "payout", assignmentId: f.get("id") });
              }}
            >
              <input
                name="id"
                aria-label="Completed assignment ID"
                placeholder="Completed assignment ID"
                required
              />
              <Button busy={s.busy}>Release / safely retry allocation</Button>
            </form>
            {s.data.transfers.map((t) => (
              <p key={t.id}>
                <span className="platform-code">{t.assignment_id}</span> ·{" "}
                <Money amount={t.amount_minor} currency={t.currency} /> ·{" "}
                {t.status} {t.last_error}
              </p>
            ))}
          </section>
          <section className="platform-card platform-detail">
            <h2>Record actual cash received</h2>
            <p>
              For confirmed pay-on-arrival packages only. Enter the amount
              actually collected in the booking’s settlement currency. This does
              not trigger a card charge or a guide transfer.
            </p>
            <form
              className="platform-form-row"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (
                  !confirm(
                    "Confirm that you actually received this cash amount?",
                  )
                )
                  return;
                const result = await s.run({
                  action: "cash",
                  requestId: f.get("requestId"),
                  amountMinor: Math.round(Number(f.get("amount")) * 100),
                  cashId,
                });
                if (result) setCashId(crypto.randomUUID());
              }}
            >
              <Field label="Confirmed booking">
                <select name="requestId" required>
                  <option value="">Choose</option>
                  {s.data.requests
                    .filter((r) => r.status === "confirmed")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} · {r.currency} · {r.id}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Cash received (major currency units)">
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
              </Field>
              <Button busy={s.busy}>Record cash receipt</Button>
            </form>
            <h2 className="platform-detail">Record actual cash returned</h2>
            <p className="platform-muted">
              Record only cash you already returned to a traveller. This does
              not issue a card refund or change Stripe funds.
            </p>
            <form
              className="platform-form-row"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (
                  !confirm(
                    "Confirm that you already returned this cash amount?",
                  )
                )
                  return;
                const result = await s.run({
                  action: "cash-refund",
                  requestId: f.get("requestId"),
                  amountMinor: Math.round(Number(f.get("amount")) * 100),
                  cashId,
                });
                if (result) setCashId(crypto.randomUUID());
              }}
            >
              <Field label="Cancelled booking">
                <select name="requestId" required>
                  <option value="">Choose</option>
                  {s.data.requests
                    .filter((r) => r.status === "cancelled")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} · {r.currency} · {r.id}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Cash actually returned (major units)">
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
              </Field>
              <Button busy={s.busy}>Record cash refund</Button>
            </form>
            <h2 className="platform-detail">Refund ledger</h2>
            {s.data.refunds.map((r) => (
              <p key={r.id}>
                {r.request_id} · {r.amount_minor / 100} · {r.status} ·{" "}
                {r.reason}
              </p>
            ))}
            {!s.data.refunds.length && <p>No refunds requested.</p>}
          </section>
          <div className="platform-two platform-detail">
            <section className="platform-card">
              <h2>Operations history</h2>
              {s.data.jobs.map((j) => (
                <details className="platform-detail" key={j.key}>
                  <summary>
                    {new Date(j.created_at).toLocaleString()} · {j.status}
                  </summary>
                  <pre className="platform-code">
                    {JSON.stringify(j.details, null, 2)}
                  </pre>
                </details>
              ))}
            </section>
            <section className="platform-card">
              <h2>API usage · 30 days</h2>
              {s.data.usage.map((u) => (
                <p key={u.provider}>
                  {u.provider} · {u.requests} requests
                </p>
              ))}
              <p className="platform-muted">
                Provider invoices remain authoritative for cost. See the setup
                guide for quota and budget controls.
              </p>
            </section>
          </div>
        </>
      )}
    </Shell>
  );
}
