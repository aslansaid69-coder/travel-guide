"use client";
import { useState, useEffect } from "react";
import { ShieldCheck, ArrowRight, LockKeyhole } from "lucide-react";
import {
  Shell,
  usePrivate,
  useResource,
  Money,
  Button,
  Field,
  Status,
  Empty,
  downloadPrivate,
} from "./shared";
export function Checkout({
  id,
  statusOnly = false,
}: {
  id: string;
  statusOnly?: boolean;
}) {
  const access = usePrivate(),
    s = useResource(`booking/${id}`, access.key, access.ready),
    [currency, setCurrency] = useState("KZT"),
    [promo, setPromo] = useState<string | null>(null),
    [voucher, setVoucher] = useState<string | null>(null),
    [accepted, setAccepted] = useState(false);
  const d = s.data;
  useEffect(() => {
    if (!statusOnly || !access.ready) return;
    let attempts = 0;
    const timer = setInterval(() => {
      if (attempts++ >= 6) {
        clearInterval(timer);
        return;
      }
      void s.load();
    }, 10000);
    return () => clearInterval(timer);
  }, [statusOnly, access.ready, s.load]);
  const convert = (n: number) => {
    if (!d?.quote) return n;
    const from = d.quote.currency;
    const rateFrom = from === "KZT" ? 1 : d.rates?.rates?.[from],
      rateTo = currency === "KZT" ? 1 : d.rates?.rates?.[currency];
    return rateFrom && rateTo ? Math.round((n / rateFrom) * rateTo) : null;
  };
  const amount = (n: number) => {
    const v = convert(n);
    return v === null ? (
      <span>Rate unavailable</span>
    ) : (
      <Money amount={v} currency={currency} />
    );
  };
  const confirmed = d?.quote?.status === "approved",
    current = d && d.quote?.plan_version === d.plan_version;
  return (
    <Shell
      title={
        statusOnly
          ? "Your payment, clearly."
          : "One trip. Every detail covered."
      }
      kicker={statusOnly ? "PAYMENT STATUS" : "YOUR ALMATY CHECKOUT"}
      intro="Review your package, your travel details and the final terms. Your travel desk is here for anything that needs adjusting."
    >
      <div className="platform-steps">
        <span>1 · Build your trip</span>
        <span>2 · Approve your quote</span>
        <span aria-current="step">
          3 · {statusOnly ? "Payment status" : "Checkout"}
        </span>
      </div>
      <Status message={s.message} busy={s.busy} />
      {!d ? (
        <Empty>
          Open the private booking link sent by your travel desk, or sign in to
          the account linked to your plan. <a href="/account">My plans</a>
        </Empty>
      ) : (
        <div className="platform-two">
          <div>
            <section className="platform-card">
              <div className="platform-panel-title">
                <h2>{d.plan.title}</h2>
                <span className="platform-badge">{d.request.status}</span>
              </div>
              <p>
                {d.plan.startDate} · {d.plan.days.length} days · {d.plan.adults}{" "}
                adults, {d.plan.children} children
              </p>
              <p>
                {d.request.guest.name} ·{" "}
                {d.request.guest.language.toUpperCase()} · Guide:{" "}
                {d.guide?.name || "To be arranged"}
              </p>
              <ul className="platform-list">
                {d.plan.days.map((day: any, i: number) => (
                  <li key={i}>
                    <strong>Day {i + 1}</strong>
                    <p>
                      {day.stops
                        .map(
                          (stop: any) =>
                            `${stop.start} ${d.items.find((x: any) => x.id === stop.itemId)?.name || "Unavailable service"}`,
                        )
                        .join(" → ")}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="platform-actions">
                <a href={`/trip/${d.request.planId}`}>Edit itinerary ↗</a>
                <a href={`/tour/${id}?plan=${d.request.planId}`}>
                  Private trip & chat ↗
                </a>
              </div>
            </section>
            {d.weather?.advice?.cautions?.length > 0 && (
              <p className="platform-warning">
                {d.weather.advice.cautions.join(" ")} Ask the team for a
                suitable indoor alternative.
              </p>
            )}
            {!statusOnly && (
              <section className="platform-card">
                <h2>A little extra, thoughtfully chosen.</h2>
                <p>
                  Transfers and indoor activities can help on unsettled days.
                  Your manager will confirm each addition and send a new quote.
                </p>
                {d.upsells.length ? (
                  d.upsells.map((item: any) => (
                    <div className="platform-line" key={item.id}>
                      <span>
                        {item.name}
                        <small className="platform-muted">
                          {" "}
                          · {item.category}
                        </small>
                      </span>
                      <Button
                        busy={s.busy}
                        onClick={() =>
                          void s.run({ action: "upsell", itemId: item.id })
                        }
                      >
                        Request addition
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="platform-muted">
                    No additional bookable services have been published for this
                    trip yet.
                  </p>
                )}
              </section>
            )}
            <section className="platform-card">
              <h2>Terms & cancellation</h2>
              {d.quote ? (
                <>
                  <p>{d.quote.terms}</p>
                  <p>{d.terms.clientTerms}</p>
                  <p>
                    Free cancellation until {d.terms.freeCancellationHours}{" "}
                    hours before the trip’s start date at 00:00 Almaty time.
                    Later card refund: {d.terms.lateRefundPercent}% of the
                    unrefunded amount paid. Contact the team for cash or voucher
                    adjustments.
                  </p>
                </>
              ) : (
                <p>
                  Your manager will provide the final terms with your quote.
                </p>
              )}
              <a href="/terms">Client terms</a> · <a href="/privacy">Privacy</a>
            </section>
          </div>
          <aside className="platform-card platform-sticky">
            <ShieldCheck size={28} />
            <h2>{statusOnly ? "Payment overview" : "Your package total"}</h2>
            <span className="platform-badge">{d.request.paymentStatus}</span>
            {!d.quote ? (
              <Empty>
                Your request is with the travel desk. A confirmed final quote is
                needed before checkout.
              </Empty>
            ) : (
              <>
                <Field label="Display currency">
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    {["KZT", "USD", "EUR", "GBP", "RUB"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <p className="platform-total">{amount(d.totalMinor)}</p>
                <div className="platform-line">
                  <span>Subtotal</span>
                  {amount(d.terms.subtotalMinor)}
                </div>
                <div className="platform-line">
                  <span>{d.terms.taxLabel} · included</span>
                  {amount(d.terms.taxMinor)}
                </div>
                <div className="platform-line">
                  <span>Service fee · included</span>
                  {amount(d.terms.feeMinor)}
                </div>
                <div className="platform-line">
                  <span>Discount</span>−{amount(d.discountMinor)}
                </div>
                <div className="platform-line">
                  <span>Voucher</span>−{amount(d.voucherMinor)}
                </div>
                <div className="platform-line">
                  <span>Already paid</span>
                  {amount(d.request.paidMinor)}
                </div>
                <p className="platform-muted">
                  Payment is collected in {d.quote.currency}. Other currencies
                  are indicative, using{" "}
                  {d.rates?.source || "the last available exchange rate"}. Your
                  card issuer may use a different rate. Group discounts and
                  manager adjustments are included in the quoted total.
                </p>
                {!current && (
                  <p className="platform-warning">
                    Your plan changed. Ask the manager for a new quote before
                    paying.
                  </p>
                )}
                {!statusOnly && (
                  <div className="platform-form">
                    <Field label="Promo / returning traveller code">
                      <input
                        disabled={
                          ["confirmed", "completed"].includes(
                            d.request.status,
                          ) || d.request.paidMinor > 0
                        }
                        value={promo ?? d.checkout?.promo_code ?? ""}
                        onChange={(e) => setPromo(e.target.value.toUpperCase())}
                        placeholder={d.checkout?.promo_code || "Optional"}
                        maxLength={64}
                      />
                    </Field>
                    <Field label="Gift voucher / loyalty credit">
                      <input
                        disabled={
                          ["confirmed", "completed"].includes(
                            d.request.status,
                          ) || d.request.paidMinor > 0
                        }
                        value={voucher ?? d.checkout?.voucher_code ?? ""}
                        onChange={(e) =>
                          setVoucher(e.target.value.toUpperCase())
                        }
                        placeholder={d.checkout?.voucher_code || "Optional"}
                        maxLength={64}
                      />
                    </Field>
                    <label className="platform-check">
                      <input
                        type="checkbox"
                        checked={accepted}
                        onChange={(e) => setAccepted(e.target.checked)}
                      />
                      I agree to the current quote, client terms and
                      cancellation policy.
                    </label>
                    <Button
                      busy={s.busy}
                      disabled={!accepted}
                      title={
                        !accepted
                          ? "Review and accept the terms first"
                          : undefined
                      }
                      onClick={() =>
                        void s.run({
                          action: "accept",
                          termsVersion: d.terms.version,
                          promo: promo ?? d.checkout?.promo_code ?? "",
                          voucher: voucher ?? d.checkout?.voucher_code ?? "",
                        })
                      }
                    >
                      Apply codes & accept terms
                    </Button>
                    {d.quote.status === "pending" && (
                      <Button
                        primary
                        busy={s.busy}
                        onClick={() =>
                          void s.run({ action: "approve", quoteId: d.quote.id })
                        }
                      >
                        Approve final quote
                      </Button>
                    )}
                    {d.checkout?.terms_accepted_at && confirmed && current && (
                      <>
                        <Button
                          primary
                          busy={s.busy}
                          disabled={!d.paymentsConfigured && d.totalMinor > 0}
                          title={
                            !d.paymentsConfigured
                              ? "Online payments need the operator’s Stripe configuration"
                              : undefined
                          }
                          onClick={() =>
                            void s.run({ action: "pay", mode: "full" })
                          }
                        >
                          <LockKeyhole size={17} />
                          Pay remaining balance <ArrowRight size={17} />
                        </Button>
                        {d.quote.deposit_percent < 100 &&
                          Number(d.request.paidMinor) <
                            Math.ceil(
                              (d.totalMinor * d.quote.deposit_percent) / 100,
                            ) && (
                            <Button
                              busy={s.busy}
                              disabled={!d.paymentsConfigured}
                              title={
                                !d.paymentsConfigured
                                  ? "Stripe is not configured"
                                  : undefined
                              }
                              onClick={() =>
                                void s.run({ action: "pay", mode: "deposit" })
                              }
                            >
                              Pay {d.quote.deposit_percent}% deposit
                            </Button>
                          )}
                        {d.payOnArrival && (
                          <Button
                            busy={s.busy}
                            onClick={() =>
                              void s.run({ action: "pay", mode: "arrival" })
                            }
                          >
                            Confirm pay on arrival
                          </Button>
                        )}
                      </>
                    )}
                    {!d.paymentsConfigured && (
                      <p className="platform-warning">
                        Online payments are awaiting operator setup. Your
                        manager can confirm pay on arrival where available.
                      </p>
                    )}
                    <p className="platform-muted">
                      Eligible card, Apple Pay and Google Pay options appear on
                      Stripe’s secure hosted page. We do not store card data.
                    </p>
                  </div>
                )}
                <div className="platform-detail">
                  <h3>Payment history</h3>
                  {d.payments.length ? (
                    d.payments.map((p: any) => (
                      <p key={p.id}>
                        <Money amount={p.amount_minor} currency={p.currency} />{" "}
                        · {p.status}
                        {p.refunded_minor > 0 && (
                          <>
                            {" "}
                            · refunded{" "}
                            <Money
                              amount={p.refunded_minor}
                              currency={p.currency}
                            />
                          </>
                        )}
                        {p.receipt_url && (
                          <>
                            {" "}
                            ·{" "}
                            <a
                              href={p.receipt_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Stripe receipt
                            </a>
                          </>
                        )}
                      </p>
                    ))
                  ) : (
                    <p className="platform-muted">
                      No card payment has been recorded.
                    </p>
                  )}
                  {d.documents.map((doc: any) => (
                    <p key={doc.id}>
                      <Button
                        onClick={() =>
                          void downloadPrivate(
                            `document/${doc.id}`,
                            access.key,
                            "almaty-payment.pdf",
                          ).catch((e) => s.setMessage(e.message))
                        }
                      >
                        Download payment PDF
                      </Button>
                    </p>
                  ))}
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </Shell>
  );
}
