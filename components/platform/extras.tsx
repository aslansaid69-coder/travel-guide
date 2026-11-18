"use client";
import { useState, useEffect } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { useLanguage } from "@/components/hub/language";
import {
  Shell,
  useResource,
  Button,
  Field,
  Status,
  Empty,
  Money,
  platform,
} from "./shared";
export function TravelAssistant() {
  const [open, setOpen] = useState(false),
    [question, setQuestion] = useState(""),
    [reply, setReply] = useState<any>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [ai, setAI] = useState(false);
  const { lang } = useLanguage();
  return (
    <>
      <div className="platform-assistant">
        <Button
          primary
          aria-expanded={open}
          aria-controls="travel-assistant"
          onClick={() => setOpen(!open)}
        >
          <MessageCircle size={19} />
          {open
            ? lang === "ru"
              ? "Закрыть"
              : "Close"
            : lang === "ru"
              ? "Помощник"
              : "Ask a local"}
        </Button>
      </div>
      {open && (
        <section
          id="travel-assistant"
          className="platform-assistant-panel"
          aria-label="Travel assistant"
        >
          <div className="platform-panel-title">
            <h2>
              {lang === "ru"
                ? "Ваш помощник в Алматы"
                : "A little local knowledge."}
            </h2>
            <Button
              aria-label="Close travel assistant"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </Button>
          </div>
          <p className="platform-muted">
            {lang === "ru"
              ? "Места, погода и планирование. Бронирование и итоговые цены подтверждает команда."
              : "Places, weather and planning. Our team confirms bookings and final prices."}
          </p>
          <form
            className="platform-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              try {
                setReply(
                  await platform("assistant", {
                    question,
                    language: lang,
                    useAI: ai,
                  }),
                );
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label={
                lang === "ru"
                  ? "Что вас интересует?"
                  : "What would you like to know?"
              }
            >
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={1000}
                required
              />
            </Field>
            <label className="platform-check">
              <input
                type="checkbox"
                checked={ai}
                onChange={(e) => setAI(e.target.checked)}
              />
              {lang === "ru"
                ? "Использовать ИИ (если настроен); вопрос будет передан провайдеру."
                : "Use optional AI phrasing; sends your question to the configured provider."}
            </label>
            <Button primary busy={busy}>
              <Send size={16} />
              {lang === "ru" ? "Спросить" : "Ask"}
            </Button>
          </form>
          <Status message={message} busy={busy} />
          {reply && (
            <div aria-live="polite">
              <p>{reply.answer}</p>
              {reply.items.map((i: any) => (
                <div className="platform-evidence" key={i.id}>
                  <strong>{i.name}</strong>
                  <p className="platform-muted">
                    {i.category} ·{" "}
                    {i.price
                      ? `${i.price.min / 100}–${i.price.max / 100} ${i.price.currency} (${i.price.source})`
                      : "Price to confirm"}
                  </p>
                  <a
                    className="button button-outline"
                    href={`/plan?add=${i.id}`}
                  >
                    {lang === "ru" ? "Добавить в план" : "Add to plan"}
                  </a>
                </div>
              ))}
            </div>
          )}
          <p>
            <a href="/plan">
              {lang === "ru"
                ? "Попросить менеджера помочь ↗"
                : "Ask a manager to help ↗"}
            </a>
          </p>
        </section>
      )}
    </>
  );
}
export function Deals() {
  const s = useResource("deals");
  useEffect(() => {
    const f = new URLSearchParams(location.hash.slice(1)),
      value = f.get("confirm") || f.get("unsubscribe");
    if (value) {
      const [id, key] = value.split(":");
      void platform("waitlist", {
        action: f.has("unsubscribe") ? "unsubscribe" : "confirm",
        id,
        key,
      })
        .then(() =>
          s.setMessage(
            f.has("unsubscribe")
              ? "Unsubscribed from this service."
              : "Availability subscription confirmed.",
          ),
        )
        .catch((e) => s.setMessage(e.message));
      sessionStorage.setItem("almaty-waitlist", value);
      history.replaceState(null, "", location.pathname);
    }
  }, []);
  return (
    <Shell
      title="Leave room for a little spontaneity."
      kicker="DEALS & AVAILABILITY"
      intro="Owner-published offers and optional availability alerts. Every booking is confirmed by the travel desk; an alert never reserves a place."
    >
      <Status message={s.message} busy={s.busy} />
      <div className="platform-grid">
        {s.data?.deals.map((d: any) => (
          <article className="platform-card" key={d.id}>
            {d.image && (
              <img
                src={d.image}
                className="platform-image"
                alt={d.name}
                loading="lazy"
              />
            )}
            <span className="platform-badge">{d.percent}% owner offer</span>
            <h2>{d.name}</h2>
            <p>{d.note}</p>
            <p className="platform-muted">
              Until {new Date(d.ends_at).toLocaleDateString()}. Request the
              advertised discount in your final quote.
            </p>
            <a className="button button-accent" href={`/plan?add=${d.item_id}`}>
              Request this experience
            </a>
          </article>
        ))}
      </div>
      {s.data && !s.data.deals.length && (
        <Empty>
          There are no active deals right now. Good trips are still waiting in
          the <a href="/explore">place collection</a>.
        </Empty>
      )}
      <section className="platform-card platform-detail">
        <h2>Be the first to know.</h2>
        {s.data?.services.length ? (
          <form
            className="platform-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await platform("waitlist", {
                  email: f.get("email"),
                  itemId: f.get("item"),
                  guests: Number(f.get("guests")),
                  consent: f.get("consent") === "on",
                });
                s.setMessage(
                  "Confirmation email queued. Delivery requires the configured email sender.",
                );
              } catch (e) {
                s.setMessage((e as Error).message);
              }
            }}
          >
            <div className="platform-form-row">
              <Field label="Email">
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                />
              </Field>
              <Field label="Experience">
                <select name="item">
                  {s.data.services.map((i: any) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Guests">
                <input
                  name="guests"
                  type="number"
                  min="1"
                  max="80"
                  defaultValue="2"
                />
              </Field>
            </div>
            <label className="platform-check">
              <input name="consent" type="checkbox" required />
              Email me when a suitable slot or owner deal is available for this
              service. I can unsubscribe any time.
            </label>
            <Button primary>Request alerts</Button>
          </form>
        ) : (
          <p>
            Availability alerts will open when the owner publishes bookable
            services.
          </p>
        )}
        <Button
          onClick={async () => {
            const value = sessionStorage.getItem("almaty-waitlist");
            if (!value) {
              s.setMessage(
                "Open the private confirmation link from your email to manage this subscription.",
              );
              return;
            }
            const [id, key] = value.split(":");
            try {
              await platform("waitlist", { action: "unsubscribe", id, key });
              s.setMessage("Unsubscribed from this service.");
            } catch (e) {
              s.setMessage((e as Error).message);
            }
          }}
        >
          Unsubscribe using my confirmation link
        </Button>
      </section>
    </Shell>
  );
}
export function Loyalty() {
  const s = useResource("loyalty");
  return (
    <section className="platform-card platform-detail">
      <h2>Good journeys come around.</h2>
      <Status message={s.message} />
      {s.data ? (
        <>
          <p>
            Your referral code: <strong>{s.data.account.referral_code}</strong>
          </p>
          <p className="platform-muted">
            Give this code to a friend before they pay for their first trip.
            Rewards appear after a completed, fully paid, unrefunded booking.
            Sign in with your verified account to use account-bound credit.
          </p>
          <p>
            {s.data.account.points} loyalty points · reward credits below are
            used as vouchers, not cash.
          </p>
          {s.data.codes.map((c: any) => (
            <p key={c.code}>
              <strong>{c.code}</strong> ·{" "}
              {c.data.kind === "promo" ? (
                `${c.data.percent}% discount`
              ) : (
                <Money amount={c.balance_minor} currency={c.data.currency} />
              )}{" "}
              · expires {new Date(c.data.expiresAt).toLocaleDateString()}
            </p>
          ))}
        </>
      ) : (
        <p>
          Sign in with a verified account to see your referral code and
          returning traveller offers.
        </p>
      )}
    </section>
  );
}
