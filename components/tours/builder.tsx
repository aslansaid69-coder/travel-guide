"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { pick, useLanguage, type Lang } from "@/components/hub/language";
import { bookTour, getQuote, type QuoteResult } from "@/app/build/actions";
import { RouteMap } from "./route-map";

export type BuilderPlace = {
  id: string;
  slug: string;
  name: string;
  nameRu: string;
  nameKk: string;
  category: string;
  region: string;
  image: string;
  duration: number;
  lat: number;
  lng: number;
  priceLabel: string;
};
type Draft = { ids: string[]; adults: number; children: number; startDate: string; guideId: string };
const DRAFT_KEY = "almaty-tour-draft";
const money = (minor: number, currency = "KZT") =>
  new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
const tomorrow = () => new Date(Date.now() + 5 * 3600000 + 86400000).toISOString().slice(0, 10);

const t = (lang: Lang, en: string, ru: string, kk: string) => pick(lang, { en, ru, kk });

export function TourBuilder({
  places,
  maxPlaces,
  start,
  depositPercent,
}: {
  places: BuilderPlace[];
  maxPlaces: number;
  start: { lat: number; lng: number; label: string };
  depositPercent: number;
}) {
  const { lang } = useLanguage();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({ ids: [], adults: 2, children: 0, startDate: "", guideId: "" });
  const [hydrated, setHydrated] = useState(false);
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [contact, setContact] = useState({ name: "", phone: "", notes: "", accept: false });
  const [bookingError, setBookingError] = useState("");
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();

  // Restore a saved draft (and ?add=<id> from place pages) after hydration.
  useEffect(() => {
    let saved: Draft | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
    const add = new URLSearchParams(location.search).get("add");
    const base: Draft = saved && Array.isArray(saved.ids) ? saved : { ids: [], adults: 2, children: 0, startDate: "", guideId: "" };
    const known = new Set(places.map((p) => p.id));
    base.ids = base.ids.filter((id) => known.has(id));
    if (add && known.has(add) && !base.ids.includes(add) && base.ids.length < maxPlaces) base.ids = [...base.ids, add];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the draft lives in localStorage, readable only after hydration
    setDraft(base);
    setHydrated(true);
  }, [places, maxPlaces]);
  useEffect(() => {
    if (hydrated) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, hydrated]);

  // Re-quote on the server whenever the selection changes (debounced).
  useEffect(() => {
    if (!hydrated || !draft.ids.length) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        setResult(
          await getQuote({
            placeIds: draft.ids,
            adults: draft.adults,
            children: draft.children,
            language: lang,
            ...(draft.startDate ? { startDate: draft.startDate } : {}),
            ...(draft.guideId ? { guideId: draft.guideId } : {}),
          }),
        );
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [draft, lang, hydrated]);

  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const selected = draft.ids.map((id) => byId.get(id)).filter((p): p is BuilderPlace => !!p);
  const name = (p: BuilderPlace) => pick(lang, { en: p.name, ru: p.nameRu, kk: p.nameKk });
  const toggle = (id: string) =>
    setDraft((d) => ({
      ...d,
      guideId: "",
      ids: d.ids.includes(id) ? d.ids.filter((x) => x !== id) : d.ids.length >= maxPlaces ? d.ids : [...d.ids, id],
    }));
  const move = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const i = d.ids.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.ids.length) return d;
      const ids = [...d.ids];
      [ids[i], ids[j]] = [ids[j], ids[i]];
      return { ...d, ids };
    });
  const visible = places.filter((p) => !filter || `${p.name} ${p.nameRu} ${p.nameKk} ${p.category}`.toLowerCase().includes(filter.toLowerCase()));
  const q = result?.ok ? result.quote : null;
  const guides = result?.ok ? result.guides : null;
  const step = !selected.length ? 1 : !draft.startDate ? 2 : !draft.guideId ? 3 : 4;

  return (
    <>
      <p className="eyebrow">{t(lang, "TOUR BUILDER", "КОНСТРУКТОР ТУРА", "ТУР ҚҰРАСТЫРУШЫ")}</p>
      <h1>{t(lang, "Your Almaty, your way.", "Ваш Алматы — по-вашему.", "Сіздің Алматыңыз — өз қалауыңызша.")}</h1>
      <ol className="tour-steps">
        {[
          t(lang, "1 · Places", "1 · Места", "1 · Орындар"),
          t(lang, "2 · Price & map", "2 · Цена и карта", "2 · Баға және карта"),
          t(lang, "3 · Guide", "3 · Гид", "3 · Гид"),
          t(lang, "4 · Confirm & pay", "4 · Подтверждение и оплата", "4 · Растау және төлем"),
        ].map((label, i) => (
          <li key={label} aria-current={step === i + 1 ? "step" : undefined}>
            {label}
          </li>
        ))}
      </ol>
      <div className="tour-grid">
        <div>
          <section className="tour-card">
            <h2>
              {t(lang, "Choose 3–4 places", "Выберите 3–4 места", "3–4 орын таңдаңыз")}{" "}
              <small className="platform-muted">
                ({selected.length}/{maxPlaces})
              </small>
            </h2>
            <input
              className="tour-form"
              style={{ width: "100%", marginBottom: 12, padding: 10, borderRadius: 10, border: "1px solid var(--control-border)" }}
              placeholder={t(lang, "Filter places…", "Найти место…", "Орынды іздеу…")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter places"
            />
            <div className="tour-places">
              {visible.map((p) => {
                const order = draft.ids.indexOf(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="tour-place"
                    aria-pressed={order >= 0}
                    onClick={() => toggle(p.id)}
                    disabled={order < 0 && draft.ids.length >= maxPlaces}
                  >
                    {order >= 0 && <span className="tour-order">{order + 1}</span>}
                    {p.image ? <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <img alt="" />}
                    <span>
                      <strong>{name(p)}</strong>
                    </span>
                    <small>
                      {p.priceLabel === "free"
                        ? t(lang, "Free entry", "Вход свободный", "Кіру тегін")
                        : p.priceLabel || t(lang, "Price on site", "Цена на месте", "Баға орнында")}{" "}
                      · ≈{p.duration >= 120 ? `${Math.round(p.duration / 60)} h` : `${p.duration} min`}
                    </small>
                  </button>
                );
              })}
            </div>
          </section>
          {selected.length > 0 && (
            <section className="tour-card">
              <h2>{t(lang, "Your route", "Ваш маршрут", "Сіздің бағытыңыз")}</h2>
              <RouteMap points={selected.map((p) => ({ id: p.id, name: name(p), lat: p.lat, lng: p.lng }))} start={start} />
              <ol>
                {selected.map((p, i) => (
                  <li key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                    <Link href={`/places/${p.slug}`}>{name(p)}</Link>
                    <span>
                      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(p.id, -1)}>↑</button>
                      <button type="button" aria-label="Move down" disabled={i === selected.length - 1} onClick={() => move(p.id, 1)}>↓</button>
                      <button type="button" aria-label="Remove" onClick={() => toggle(p.id)}>✕</button>
                    </span>
                  </li>
                ))}
              </ol>
              {q && (
                <p className="platform-muted">
                  {t(lang, "Total distance", "Общее расстояние", "Жалпы қашықтық")}: ≈ {Math.round(q.estimate.distanceKm)} km ·{" "}
                  {t(lang, "driving", "в пути", "жолда")} ≈ {Math.floor(q.estimate.driveMinutes / 60)} h {q.estimate.driveMinutes % 60} min ·{" "}
                  {q.estimate.days} {t(lang, q.estimate.days > 1 ? "days" : "day", "дн.", "күн")}
                </p>
              )}
            </section>
          )}
        </div>
        <aside>
          <section className="tour-card" aria-live="polite" aria-busy={pending}>
            <h2>{t(lang, "Approximate price", "Примерная цена", "Шамамен баға")}</h2>
            <div className="tour-form">
              <div className="row">
                <label>
                  {t(lang, "Adults", "Взрослые", "Ересектер")}
                  <input type="number" min={1} max={40} value={draft.adults} onChange={(e) => setDraft((d) => ({ ...d, adults: Math.max(1, Math.min(40, Number(e.target.value) || 1)) }))} />
                </label>
                <label>
                  {t(lang, "Children", "Дети", "Балалар")}
                  <input type="number" min={0} max={40} value={draft.children} onChange={(e) => setDraft((d) => ({ ...d, children: Math.max(0, Math.min(40, Number(e.target.value) || 0)) }))} />
                </label>
              </div>
            </div>
            {!selected.length && <p className="platform-muted">{t(lang, "Pick places to see the price.", "Выберите места, чтобы увидеть цену.", "Бағаны көру үшін орындарды таңдаңыз.")}</p>}
            {result && !result.ok && <p role="alert">{result.error}</p>}
            {q && selected.length > 0 && (
              <>
                <p className="tour-total">
                  ≈ {t(lang, "from", "от", "")} {money(q.estimate.total.min, q.estimate.currency)} {t(lang, "to", "до", "–")} {money(q.estimate.total.max, q.estimate.currency)}
                </p>
                <table className="tour-breakdown">
                  <tbody>
                    {q.estimate.lines.map((l) => (
                      <tr key={l.key}>
                        <td>
                          {
                            {
                              tickets: t(lang, "Entrance tickets", "Входные билеты", "Кіру билеттері"),
                              transport: t(lang, "Transport", "Транспорт", "Көлік"),
                              guide: t(lang, "Guide", "Гид", "Гид"),
                              commission: t(lang, "Service fee", "Комиссия сервиса", "Қызмет ақысы"),
                            }[l.key]
                          }
                          <small>{l.detail}</small>
                        </td>
                        <td>{l.min === l.max ? money(l.min, q.estimate.currency) : `${money(l.min, q.estimate.currency)} – ${money(l.max, q.estimate.currency)}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {q.estimate.unpricedPlaces.length > 0 && (
                  <p className="platform-warning">
                    {t(lang, "Entrance price not published for", "Цена входа не опубликована для", "Кіру бағасы жарияланбаған")}: {q.estimate.unpricedPlaces.join(", ")}.{" "}
                    {t(lang, "Not included above.", "В сумму не включено.", "Сомаға кірмейді.")}
                  </p>
                )}
                <p className="tour-disclaimer">
                  {t(
                    lang,
                    "Approximate price — the final amount may differ (entrance fees, traffic and choices on the day).",
                    "Ориентировочная цена, итог может отличаться (входные билеты, пробки, решения в день поездки).",
                    "Шамамен баға, қорытынды сома өзгеруі мүмкін.",
                  )}
                </p>
              </>
            )}
          </section>
          {selected.length > 0 && (
            <section className="tour-card">
              <h2>{t(lang, "Dates & guide", "Даты и гид", "Күндер және гид")}</h2>
              <div className="tour-form">
                <label>
                  {t(lang, "Start date", "Дата начала", "Басталу күні")}
                  <input
                    type="date"
                    min={tomorrow()}
                    value={draft.startDate}
                    onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value, guideId: "" }))}
                  />
                </label>
              </div>
              {draft.startDate && q?.endDate && (
                <p className="platform-muted">
                  {draft.startDate} → {q.endDate}
                </p>
              )}
              {draft.startDate && guides && (
                <div className="tour-guides">
                  {!guides.length && (
                    <p>
                      {t(
                        lang,
                        "No guide is free on these dates for this route yet. Try other dates — or send the plan to our travel desk.",
                        "На эти даты нет свободного гида для этого маршрута. Попробуйте другие даты или отправьте план нашему менеджеру.",
                        "Бұл күндерге бос гид жоқ. Басқа күндерді таңдаңыз.",
                      )}{" "}
                      <Link href="/plan">{t(lang, "Travel desk", "Менеджер", "Менеджер")} →</Link>
                    </p>
                  )}
                  {guides.map((g) => (
                    <article key={g.id} className="tour-guide" aria-pressed={draft.guideId === g.id}>
                      {g.photo ? <img src={g.photo} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{g.name.slice(0, 1)}</span>}
                      <div>
                        <strong>{g.name}</strong>
                        <p className="platform-muted">
                          {g.languages.join(" · ").toUpperCase()} · {g.experienceYears} {t(lang, "yrs experience", "лет опыта", "жыл тәжірибе")}
                          {g.rating !== null && ` · ★ ${g.rating.toFixed(1)}`}
                          {g.reviewCount > 0 && ` (${g.reviewCount})`}
                        </p>
                        <p>{g.bio.slice(0, 220)}</p>
                        <Link href={`/guides/${g.id}`} target="_blank">
                          {t(lang, "Profile & reviews", "Профиль и отзывы", "Профиль және пікірлер")} ↗
                        </Link>
                      </div>
                      <div>
                        <strong>{money(g.dayRateMinor, g.currency)}</strong>
                        <small className="platform-muted"> / {t(lang, "day", "день", "күн")}</small>
                        <br />
                        <button
                          type="button"
                          className="button button-accent"
                          onClick={() => setDraft((d) => ({ ...d, guideId: d.guideId === g.id ? "" : g.id }))}
                        >
                          {draft.guideId === g.id ? t(lang, "Selected ✓", "Выбран ✓", "Таңдалды ✓") : t(lang, "Choose", "Выбрать", "Таңдау")}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
          {draft.guideId && q?.guide && result?.ok && (
            <section className="tour-card">
              <h2>{t(lang, "Confirm & pay", "Подтверждение и оплата", "Растау және төлем")}</h2>
              {!result.signedIn ? (
                <p>
                  {t(lang, "Sign in with your email to book. Your selection is saved.", "Войдите по email, чтобы забронировать. Ваш выбор сохранён.", "Брондау үшін email арқылы кіріңіз.")}{" "}
                  <Link className="button button-accent" href="/auth/sign-in?next=/build">
                    {t(lang, "Sign in", "Войти", "Кіру")}
                  </Link>
                </p>
              ) : (
                <form
                  className="tour-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setBookingError("");
                    startTransition(async () => {
                      const r = await bookTour({
                        placeIds: draft.ids,
                        adults: draft.adults,
                        children: draft.children,
                        startDate: draft.startDate,
                        guideId: draft.guideId,
                        language: lang,
                        name: contact.name,
                        phone: contact.phone,
                        notes: contact.notes,
                        acceptTerms: contact.accept,
                      });
                      if (!r.ok) return setBookingError(r.error);
                      localStorage.removeItem(DRAFT_KEY);
                      router.push(`/bookings/${r.id}`);
                    });
                  }}
                >
                  <div className="row">
                    <label>
                      {t(lang, "Full name", "Имя и фамилия", "Аты-жөні")}
                      <input required minLength={2} maxLength={120} value={contact.name} onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))} />
                    </label>
                    <label>
                      {t(lang, "Phone / WhatsApp", "Телефон / WhatsApp", "Телефон / WhatsApp")}
                      <input required minLength={5} maxLength={40} inputMode="tel" value={contact.phone} onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} />
                    </label>
                  </div>
                  <label>
                    {t(lang, "Notes for the guide (optional)", "Пожелания гиду (необязательно)", "Гидке тілектер")}
                    <textarea rows={2} maxLength={1000} value={contact.notes} onChange={(e) => setContact((c) => ({ ...c, notes: e.target.value }))} />
                  </label>
                  <p className="platform-muted">
                    {t(lang, "Online prepayment", "Онлайн-предоплата", "Онлайн алдын ала төлем")}: <strong>{money(q.estimate.depositMinor, q.estimate.currency)}</strong> ({depositPercent}%{" "}
                    {t(lang, "of the upper estimate", "от верхней границы оценки", "жоғарғы бағадан")}).{" "}
                    {t(lang, "The rest is settled after the tour based on actual costs.", "Остаток рассчитывается после тура по факту.", "Қалғаны турдан кейін нақты шығын бойынша есептеледі.")}
                  </p>
                  <label className="platform-check" style={{ display: "flex", gap: 8, fontWeight: 400 }}>
                    <input type="checkbox" required checked={contact.accept} onChange={(e) => setContact((c) => ({ ...c, accept: e.target.checked }))} />
                    <span>
                      {t(lang, "I accept the", "Я принимаю", "Мен келісемін:")} <Link href="/terms">{t(lang, "terms", "условия", "шарттар")}</Link>
                    </span>
                  </label>
                  {bookingError && <p role="alert">{bookingError}</p>}
                  <button className="button button-accent" disabled={pending}>
                    {pending ? "…" : t(lang, "Confirm and continue to payment", "Подтвердить и перейти к оплате", "Растау және төлемге өту")}
                  </button>
                </form>
              )}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
