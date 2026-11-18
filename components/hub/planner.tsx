"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowUpRight,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Plus,
  Trash2,
  RefreshCw,
  Check,
  Save,
} from "lucide-react";
import type {
  CatalogItem,
  Plan,
  HubSettings,
  Rates,
  Guest,
} from "@/lib/hub/types";
import { defaultSettings, planSchema } from "@/lib/hub/types";
import {
  generatePlan,
  estimate,
  conflicts,
  dayDate,
  time,
  money,
  km,
} from "@/lib/hub/core";
import { localDay } from "@/lib/weather/advice";
import { Catalog } from "./catalog";
import { TravelMap } from "./map";
import { api, track } from "./shared";
import { useT, useLanguage } from "./language";
const blank = (): Plan => ({
  title: "My Almaty escape",
  startDate: localDay(Date.now() / 1000),
  adults: 2,
  children: 0,
  interests: ["park", "mountains"],
  budget: "balanced",
  currency: "KZT",
  days: [{ stops: [] }, { stops: [] }, { stops: [] }],
});
type Saved = { id: string; version: number; key: string };
export function Planner({ initial, id }: { initial?: Plan; id?: string }) {
  const t = useT(),
    { lang } = useLanguage();
  const [plan, setPlan] = useState<Plan>(initial || blank),
    [items, setItems] = useState<CatalogItem[]>([]),
    [config, setConfig] = useState<HubSettings>(defaultSettings),
    [rates, setRates] = useState<Rates | null>(null),
    [weather, setWeather] = useState<any>(null),
    [slots, setSlots] = useState<any[]>([]),
    [saved, setSaved] = useState<Saved | null>(
      id ? { id, version: 1, key: "" } : null,
    ),
    [canEdit, setCanEdit] = useState(!id),
    [wizard, setWizard] = useState(!id),
    [day, setDay] = useState(0),
    [message, setMessage] = useState(""),
    [ready, setReady] = useState(false),
    [pending, setPending] = useState(false),
    [intent, setIntent] = useState(""),
    [requestId, setRequestId] = useState(""),
    [requestData, setRequestData] = useState<any>(null),
    [drag, setDrag] = useState<{ day: number; index: number } | null>(null),
    [emailBox, setEmailBox] = useState(false),
    [currency, setCurrency] = useState("KZT");
  const formRef = useRef<HTMLDivElement>(null),
    latest = useRef(plan),
    requestKey = useRef("");
  latest.current = plan;
  useEffect(() => {
    let live = true;
    void api("catalog")
      .then((d) => {
        if (live) {
          setItems(d.items);
          setConfig({ ...defaultSettings, ...d.settings });
          setRates(d.rates);
          setSlots(d.slots);
        }
      })
      .catch((e) => setMessage(e.message));
    const availabilityTimer = setInterval(() => {
      if (!document.hidden)
        void api("availability")
          .then((data) => {
            if (live) setSlots(data.slots);
          })
          .catch(() => {});
    }, 60000);
    void fetch("/api/weather")
      .then((r) => r.json())
      .then((d) => {
        if (live && !d.stale) setWeather(d.weather);
      })
      .catch(() => {});
    if (id) {
      const fragment = new URLSearchParams(window.location.hash.slice(1)),
        key =
          fragment.get("edit") ||
          localStorage.getItem(`almaty-key-${id}`) ||
          "";
      if (key) {
        localStorage.setItem(`almaty-key-${id}`, key);
        setCanEdit(true);
        history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }
      void api(`plans/${id}`)
        .then((d) => {
          if (live) {
            setPlan(d.data);
            setSaved({ id, version: d.version, key });
            setReady(true);
          }
        })
        .catch((e) => setMessage(e.message));
      void api(`plans/${id}/requests`, undefined, key)
        .then((d) => {
          if (live) {
            setCanEdit(true);
            if (d.requests[0]) setRequestId(d.requests[0].id);
          }
        })
        .catch(() => {});
    } else {
      try {
        const value = localStorage.getItem("almaty-draft");
        if (value) {
          const draft = JSON.parse(value);
          if (planSchema.safeParse(draft.plan).success) {
            setPlan(draft.plan);
            setWizard(false);
            if (draft.saved) {
              setSaved(draft.saved);
              setCanEdit(true);
            }
          }
        }
      } catch {}
      setReady(true);
    }
    return () => {
      live = false;
      clearInterval(availabilityTimer);
    };
  }, [id]);
  useEffect(() => {
    if (!ready || id || !items.length) return;
    const params = new URLSearchParams(location.search),
      guide = params.get("guide"),
      add = params.get("add");
    const item = items.find((i) => i.id === add);
    if (guide) setPlan((p) => ({ ...p, preferredGuideId: guide }));
    if (item) {
      setPlan((p) => ({
        ...p,
        days: p.days.map((d, i) =>
          i
            ? d
            : {
                stops: [
                  ...d.stops,
                  {
                    id: crypto.randomUUID(),
                    itemId: item.id,
                    start: "10:00",
                    duration: item.duration,
                    note: "",
                  },
                ],
              },
        ),
      }));
      setWizard(false);
    }
    if (guide || add) history.replaceState(null, "", location.pathname);
  }, [ready, id, items]);
  useEffect(() => {
    if (ready && canEdit)
      localStorage.setItem("almaty-draft", JSON.stringify({ plan, saved }));
  }, [plan, saved, ready, canEdit]);
  useEffect(() => {
    if (intent)
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [intent]);
  const loadRequest = useCallback(async () => {
    if (requestId && saved)
      try {
        const detail = await api(`requests/${requestId}`, undefined, saved.key);
        setRequestData(detail);
        if (detail.quote && detail.quote.plan_version > saved.version) {
          const current = await api(`plans/${saved.id}`);
          setPlan(current.data);
          setSaved({ ...saved, version: current.version });
          setMessage(
            "Your manager updated the itinerary. Review it before approving the quote.",
          );
        }
      } catch (e) {
        setMessage((e as Error).message);
      }
  }, [requestId, saved]);
  useEffect(() => {
    void loadRequest();
  }, [loadRequest]);
  const quote = useMemo(
      () =>
        estimate(
          { ...plan, currency: currency as Plan["currency"] },
          items,
          config,
          rates,
        ),
      [plan, currency, items, config, rates],
    ),
    warnings = useMemo(
      () => conflicts(plan, items, weather),
      [plan, items, weather],
    );
  const routeKey =
    plan.days[day]?.stops.map((stop) => stop.itemId).join("|") || "";
  const route = useMemo(
    () =>
      routeKey
        .split("|")
        .map((id) => items.find((i) => i.id === id))
        .filter((i): i is CatalogItem => !!i) || [],
    [routeKey, items],
  );
  const update = (next: Plan) => {
    if (!canEdit) return;
    setPlan(next);
    setMessage("");
  };
  const add = useCallback(
    (item: CatalogItem) => {
      if (!canEdit) return;
      setPlan((p) => ({
        ...p,
        days: p.days.map((d, i) =>
          i === day
            ? {
                stops: [
                  ...d.stops,
                  {
                    id: crypto.randomUUID(),
                    itemId: item.id,
                    start: d.stops.length
                      ? time(
                          Math.min(
                            22 * 60,
                            Number(d.stops.at(-1)!.start.slice(0, 2)) * 60 +
                              Number(d.stops.at(-1)!.start.slice(3)) +
                              d.stops.at(-1)!.duration +
                              30,
                          ),
                        )
                      : "09:00",
                    duration: item.duration,
                    note: "",
                  },
                ],
              }
            : d,
        ),
      }));
      track("added", item.id);
    },
    [day, canEdit],
  );
  useEffect(() => {
    if (!ready || !items.length || id) return;
    const addId = new URLSearchParams(window.location.search).get("add");
    if (addId) {
      const item = items.find((i) => i.id === addId);
      if (item) {
        add(item);
        setWizard(false);
      }
      history.replaceState(null, "", "/plan");
    }
  }, [ready, items, id, add]);
  async function save(current = latest.current) {
    setPending(true);
    try {
      if (saved) {
        const d = await api(
          `plans/${saved.id}`,
          { action: "save", plan: current, version: saved.version },
          saved.key,
        );
        const next = { ...saved, version: d.version };
        setSaved(next);
        setMessage("Saved. Your share link stays the same.");
        return next;
      }
      const d = await api("plans", { plan: current });
      const next = { id: d.id, key: d.editToken, version: d.version };
      localStorage.setItem(`almaty-key-${next.id}`, next.key);
      setSaved(next);
      track("itinerary-created");
      setMessage("Saved. Your share link is ready.");
      return next;
    } catch (e) {
      setMessage((e as Error).message);
      throw e;
    } finally {
      setPending(false);
    }
  }
  function move(
    fromDay: number,
    index: number,
    toDay: number,
    toIndex?: number,
  ) {
    const days = plan.days.map((d) => ({ stops: [...d.stops] })),
      [stop] = days[fromDay].stops.splice(index, 1);
    days[toDay].stops.splice(toIndex ?? days[toDay].stops.length, 0, stop);
    update({ ...plan, days });
  }
  function patch(index: number, changes: Record<string, unknown>) {
    update({
      ...plan,
      days: plan.days.map((d, i) =>
        i === day
          ? {
              stops: d.stops.map((s, k) =>
                k === index ? { ...s, ...changes } : s,
              ),
            }
          : d,
      ),
    });
  }
  function replacement(index: number) {
    const current = plan.days[day].stops[index],
      old = items.find((i) => i.id === current.itemId);
    const used = new Set(
      plan.days.flatMap((d) => d.stops.map((s) => s.itemId)),
    );
    const next = items
      .filter((i) => !used.has(i.id) && i.status === "approved" && !i.closed)
      .sort(
        (a, b) =>
          Number(b.category === old?.category) -
          Number(a.category === old?.category) +
          (old ? km(old, a) - km(old, b) : 0),
      )[0];
    if (next) {
      track("removed", current.itemId);
      track("added", next.id);
      patch(index, {
        itemId: next.id,
        duration: next.duration,
        slotId: undefined,
      });
    } else
      setMessage(
        "No unused alternative is available. Add another approved place or ask the manager.",
      );
  }
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    try {
      const s = await save();
      requestKey.current ||= crypto.randomUUID();
      const guest: Guest = {
        name: String(f.get("name")),
        email: String(f.get("email")),
        phone: String(f.get("phone") || ""),
        language: f.get("language") === "ru" ? "ru" : "en",
        allergies: String(f.get("allergies") || ""),
        accessibility: String(f.get("accessibility") || ""),
        message: String(f.get("message") || ""),
        reminderConsent: f.get("reminder") === "on",
        marketingConsent: f.get("marketing") === "on",
        messageConsent: f.get("sms") === "on",
      };
      const d = await api(
        `plans/${s.id}`,
        {
          action: "request",
          guest,
          intent,
          idempotencyKey: requestKey.current,
        },
        s.key,
      );
      setRequestId(d.id);
      localStorage.setItem(`almaty-request-${s.id}`, d.id);
      setIntent("");
      setMessage(
        "Request sent. Your manager will review the plan and confirm the final price.",
      );
      track("booked");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function requestAction(data: unknown) {
    if (!saved || !requestId) return;
    setPending(true);
    try {
      const result = await api(`requests/${requestId}`, data, saved.key);
      if (result.url) window.location.assign(result.url);
      else {
        await loadRequest();
        const p = await api(`plans/${saved.id}`);
        setPlan(p.data);
        setSaved({ ...saved, version: p.version });
        setMessage("Updated.");
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  if (!ready)
    return (
      <p role="status" className="hub-loading">
        {t("Loading…")}
      </p>
    );
  if (id && !canEdit)
    return (
      <>
        <div className="hub-page-heading">
          <p className="eyebrow">A SHARED ALMATY STORY</p>
          <h1>{plan.title}</h1>
          <p>
            {t(
              "This link shows the plan only. Contact details and messages stay private.",
            )}
          </p>
          <button
            className="button button-accent"
            onClick={() => {
              setCanEdit(true);
              setSaved(null);
              setWizard(false);
              setRequestId("");
            }}
          >
            {t("Make a copy")}
          </button>
          <a
            className="button button-outline"
            href={`/api/hub/plans/${id}/pdf`}
          >
            {t("PDF export")}
          </a>
        </div>
        <div className="hub-shared-days">
          {plan.days.map((d, i) => (
            <article key={i} className="hub-panel">
              <h2>
                {t("Day")} {i + 1} · {dayDate(plan.startDate, i)}
              </h2>
              {d.stops.map((s) => (
                <p key={s.id}>
                  <strong>{s.start}</strong> ·{" "}
                  {items.find((i) => i.id === s.itemId)?.name || "Place"} ·{" "}
                  {s.duration} min
                </p>
              ))}
            </article>
          ))}
        </div>
      </>
    );
  return (
    <>
      <div className="hub-page-heading">
        <p className="eyebrow">YOUR DAYS, BEAUTIFULLY CONNECTED</p>
        <h1>{t("Create your itinerary")}</h1>
        <p>{t("Start with four quick choices, or make a blank canvas.")}</p>
        <p className="hub-caption">
          {t("No account needed to save and share.")}
        </p>
      </div>
      {wizard && (
        <section className="hub-wizard hub-panel">
          <div className="hub-form-grid">
            <label>
              1. {t("Days")}
              <input
                type="number"
                min="1"
                max="14"
                value={plan.days.length}
                onChange={(e) =>
                  update({
                    ...plan,
                    days: Array.from(
                      {
                        length: Math.max(
                          1,
                          Math.min(14, Number(e.target.value) || 1),
                        ),
                      },
                      (_, i) => plan.days[i] || { stops: [] },
                    ),
                  })
                }
              />
            </label>
            <label>
              2. {t("Guests")}
              <input
                type="number"
                min="1"
                max="50"
                value={plan.adults}
                onChange={(e) =>
                  update({
                    ...plan,
                    adults: Math.max(
                      1,
                      Math.min(50, Number(e.target.value) || 1),
                    ),
                  })
                }
              />
            </label>
            <fieldset>
              <legend>3. {t("Interests")}</legend>
              <div className="hub-interest-chips">
                {[
                  "mountains",
                  "park",
                  "museum",
                  "market",
                  "restaurant",
                  "activity",
                ].map((c) => (
                  <button
                    key={c}
                    aria-pressed={plan.interests.includes(c)}
                    onClick={() =>
                      update({
                        ...plan,
                        interests: plan.interests.includes(c)
                          ? plan.interests.filter((i) => i !== c)
                          : [...plan.interests, c],
                      })
                    }
                  >
                    {t(c)}
                  </button>
                ))}
              </div>
            </fieldset>
            <label>
              4. {t("Budget")}
              <select
                value={plan.budget}
                onChange={(e) =>
                  update({ ...plan, budget: e.target.value as Plan["budget"] })
                }
              >
                {["easy", "balanced", "premium"].map((b) => (
                  <option value={b} key={b}>
                    {t(b[0].toUpperCase() + b.slice(1))}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="hub-inline-actions">
            <button
              className="button button-accent"
              disabled={!items.length}
              onClick={() => {
                update(generatePlan(plan, items, weather));
                setWizard(false);
                setDay(0);
                track("itinerary-created");
              }}
            >
              {t("Generate my plan")}
              <ArrowUpRight size={16} />
            </button>
            <button
              className="button button-outline"
              onClick={() => {
                update({ ...plan, days: plan.days.map(() => ({ stops: [] })) });
                setWizard(false);
                setDay(0);
              }}
            >
              {t("Start empty")}
            </button>
          </div>
        </section>
      )}
      <div className="hub-planner-layout">
        <div className="hub-plan-main">
          <section className="hub-panel">
            <div className="hub-plan-settings">
              <label>
                {t("Your trip title")}
                <input
                  value={plan.title}
                  maxLength={120}
                  onChange={(e) => update({ ...plan, title: e.target.value })}
                />
              </label>
              <label>
                {t("Start date")}
                <input
                  type="date"
                  value={plan.startDate}
                  onChange={(e) =>
                    update({ ...plan, startDate: e.target.value })
                  }
                />
              </label>
              <label>
                {t("Adults")}
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={plan.adults}
                  onChange={(e) =>
                    update({
                      ...plan,
                      adults: Math.max(
                        1,
                        Math.min(50, Number(e.target.value) || 1),
                      ),
                    })
                  }
                />
              </label>
              <label>
                {t("Children")}
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={plan.children}
                  onChange={(e) =>
                    update({
                      ...plan,
                      children: Math.max(
                        0,
                        Math.min(30, Number(e.target.value) || 0),
                      ),
                    })
                  }
                />
              </label>
            </div>
            <div
              className="hub-day-tabs"
              role="tablist"
              aria-label="Itinerary day"
            >
              {plan.days.map((d, i) => (
                <button
                  key={i}
                  role="tab"
                  aria-selected={day === i}
                  onClick={() => setDay(i)}
                >
                  {t("Day")} {i + 1}
                  <small>
                    {dayDate(plan.startDate, i).slice(5)} · {d.stops.length}{" "}
                    stops
                  </small>
                </button>
              ))}
              {plan.days.length < 14 && (
                <button
                  aria-label="Add a day"
                  onClick={() =>
                    update({ ...plan, days: [...plan.days, { stops: [] }] })
                  }
                >
                  <Plus size={18} />
                </button>
              )}
            </div>
            <ol className="hub-stops">
              {plan.days[day]?.stops.map((s, index) => {
                const item = items.find((i) => i.id === s.itemId),
                  issues = warnings.filter((w) => w.stopId === s.id),
                  available = slots.filter(
                    (slot) =>
                      slot.item_id === s.itemId &&
                      localDay(new Date(slot.starts_at).valueOf() / 1000) ===
                        dayDate(plan.startDate, day) &&
                      ((!slot.blackout &&
                        slot.remaining >= plan.adults + plan.children) ||
                        slot.id === s.slotId),
                  );
                return (
                  <li
                    key={s.id}
                    className="hub-stop"
                    draggable
                    onDragStart={() => setDrag({ day, index })}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (drag) move(drag.day, drag.index, day, index);
                      setDrag(null);
                    }}
                  >
                    <div className="hub-stop-top">
                      <span className="hub-stop-number">{index + 1}</span>
                      <div>
                        <p className="eyebrow">
                          {item ? t(item.category) : "UNAVAILABLE"}
                        </p>
                        <h3>
                          {lang === "ru" && item?.nameRu
                            ? item.nameRu
                            : item?.name || "Unavailable place"}
                        </h3>
                      </div>
                      <GripVertical size={18} aria-label="Drag to reorder" />
                    </div>
                    <div className="hub-stop-fields">
                      <label>
                        {t("Start time")}
                        <input
                          aria-label={`${item?.name} start time`}
                          type="time"
                          value={s.start}
                          onChange={(e) =>
                            patch(index, { start: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        {t("Minutes")}
                        <input
                          type="number"
                          min="15"
                          max="1440"
                          value={s.duration}
                          onChange={(e) =>
                            patch(index, {
                              duration: Math.max(
                                15,
                                Math.min(1440, Number(e.target.value) || 15),
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        {t("Move to day")}
                        <select
                          value={day}
                          onChange={(e) =>
                            move(day, index, Number(e.target.value))
                          }
                        >
                          {plan.days.map((_, i) => (
                            <option key={i} value={i}>
                              {t("Day")} {i + 1}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {item?.bookable && (
                      <label>
                        {t("Select a time slot")}
                        <select
                          value={s.slotId || ""}
                          onChange={(e) => {
                            const slot = available.find(
                              (a) => a.id === e.target.value,
                            );
                            if (slot) {
                              const start = new Date(slot.starts_at);
                              const localTime = new Intl.DateTimeFormat(
                                "en-GB",
                                {
                                  timeZone: "Asia/Almaty",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              ).format(start);
                              patch(index, {
                                slotId: slot.id,
                                start: localTime,
                                duration: Math.round(
                                  (new Date(slot.ends_at).valueOf() -
                                    new Date(slot.starts_at).valueOf()) /
                                    60000,
                                ),
                              });
                            } else patch(index, { slotId: undefined });
                          }}
                        >
                          <option value="">
                            {t("Availability needs confirmation")}
                          </option>
                          {available.map((slot) => (
                            <option key={slot.id} value={slot.id}>
                              {new Intl.DateTimeFormat("en-GB", {
                                timeZone: "Asia/Almaty",
                                dateStyle: "short",
                                timeStyle: "short",
                              }).format(new Date(slot.starts_at))}{" "}
                              · {slot.remaining} left
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <input
                      className="hub-stop-note"
                      aria-label="Stop note"
                      placeholder="A little note for this stop…"
                      value={s.note}
                      maxLength={500}
                      onChange={(e) => patch(index, { note: e.target.value })}
                    />
                    {issues.length > 0 && (
                      <div className="hub-conflicts">
                        {issues.map((w, k) => (
                          <p key={k}>
                            <strong>{w.message}</strong> {w.fix}
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="hub-stop-actions">
                      <button
                        title={t("Move up")}
                        aria-label={t("Move up")}
                        disabled={index === 0}
                        onClick={() => move(day, index, day, index - 1)}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        title={t("Move down")}
                        aria-label={t("Move down")}
                        disabled={index === plan.days[day].stops.length - 1}
                        onClick={() => move(day, index, day, index + 1)}
                      >
                        <ChevronDown size={16} />
                      </button>
                      <button onClick={() => replacement(index)}>
                        <RefreshCw size={13} />
                        {t("Suggest replacement")}
                      </button>
                      <button
                        onClick={() => {
                          track("removed", s.itemId);
                          update({
                            ...plan,
                            days: plan.days.map((d, i) =>
                              i === day
                                ? {
                                    stops: d.stops.filter(
                                      (stop) => stop.id !== s.id,
                                    ),
                                  }
                                : d,
                            ),
                          });
                        }}
                      >
                        <Trash2 size={13} />
                        {t("Remove")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
            {!plan.days[day]?.stops.length && (
              <div className="hub-empty">
                <MapMark />
                <p>{t("No stops yet. Add a place from the catalog.")}</p>
              </div>
            )}
          </section>
          <TravelMap items={route} route={route} onSelect={add} />
          <section className="hub-panel hub-planner-catalog">
            <div className="hub-section-title">
              <h2>{t("Catalog")}</h2>
              <span>
                {t("Add to plan")} → {t("Day")} {day + 1}
              </span>
            </div>
            <Catalog initialItems={items} onAdd={add} compact />
          </section>
        </div>
        <aside className="hub-price-panel">
          <div className="hub-panel">
            <p className="eyebrow">A CLEARER PICTURE</p>
            <h2>{t("Live price estimate")}</h2>
            <label className="hub-currency">
              Display currency
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {["KZT", "USD", "EUR", "RUB", "GBP"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <p className="hub-caption">{t("Total priced portion")}</p>
            <div className="hub-total">
              {quote.lines.length > 0 &&
              quote.lines.every((line) => line.unknown)
                ? t("Price to confirm")
                : quote.displayRate
                  ? `${money(quote.min * quote.displayRate, currency)} – ${money(quote.max * quote.displayRate, currency)}`
                  : "Exchange rate unavailable"}
            </div>
            <p>
              {t("Per person")}:{" "}
              {quote.lines.length > 0 &&
              quote.lines.every((line) => line.unknown)
                ? "—"
                : quote.displayRate
                  ? `${money(quote.perPerson.min * quote.displayRate, currency)} – ${money(quote.perPerson.max * quote.displayRate, currency)}`
                  : "—"}
            </p>
            {quote.unknown > 0 && (
              <p className="hub-unpriced">
                {quote.unknown} {t("Unpriced items")}. These are excluded from
                the total.
              </p>
            )}
            <details>
              <summary>Price breakdown</summary>
              {quote.days.map((d, i) => (
                <p key={i}>
                  {t("Day")} {i + 1}: {money(d.min)} – {money(d.max)}
                </p>
              ))}
              {quote.lines.map((line) => (
                <div className="hub-price-line" key={line.id}>
                  <strong>{line.name}</strong>
                  <span>
                    {line.unknown
                      ? t("Price to confirm")
                      : `${money(line.min)} – ${money(line.max)}`}
                  </span>
                  <small>
                    {t(line.confirmed ? "Confirmed price" : "Estimate")} ·{" "}
                    {line.note}
                  </small>
                </div>
              ))}
            </details>
            <p className="hub-caption">
              {t("Estimate only; the final price is confirmed by our team.")}
              {currency !== "KZT" &&
                " Converted amounts are indicative; the quote sets payment currency."}
              {quote.ratesDate && ` Rates: ${quote.ratesDate}`}
            </p>
            <button
              className="button button-accent"
              disabled={pending || !plan.days.some((day) => day.stops.length)}
              onClick={() => setIntent("booking")}
            >
              {t("Book this itinerary")}
              <ArrowUpRight size={16} />
            </button>
            <button
              className="button button-outline"
              disabled={pending || !plan.days.some((day) => day.stops.length)}
              onClick={() => setIntent("adjustment")}
            >
              {t("Ask a manager to adjust it")}
            </button>
          </div>
          <div className="hub-panel hub-save-panel">
            <h3>{t("Save & share")}</h3>
            <button
              disabled={pending}
              onClick={() => void save().catch(() => {})}
            >
              <Save size={15} />
              {t(saved ? "Save changes" : "Save & share")}
            </button>
            {saved && (
              <>
                <button
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(`${location.origin}/trip/${saved.id}`)
                      .then(() => setMessage("Share link copied."))
                      .catch(() =>
                        setMessage(`${location.origin}/trip/${saved.id}`),
                      );
                  }}
                >
                  {t("Copy share link")}
                </button>
                {saved.key && (
                  <button
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(
                          `${location.origin}/trip/${saved.id}#edit=${saved.key}`,
                        )
                        .then(() =>
                          setMessage("Private edit link copied. Keep it safe."),
                        );
                    }}
                  >
                    {t("Copy private edit link")}
                  </button>
                )}
                {requestId && (
                  <a
                    className="button button-outline"
                    href={`/tour/${requestId}?plan=${saved.id}`}
                  >
                    Open private trip & guide chat
                  </a>
                )}
                <a href={`/api/hub/plans/${saved.id}/pdf`}>{t("PDF export")}</a>
              </>
            )}
            <button onClick={() => setEmailBox(!emailBox)}>
              {t("Email me my plan")}
            </button>
            <button
              onClick={async () => {
                try {
                  const s = await save();
                  await api(`plans/${s.id}`, { action: "account" }, s.key);
                  setMessage("Saved to your account.");
                } catch (e) {
                  setMessage(
                    (e as Error).message +
                      " Sign in at /auth/sign-in, then return here.",
                  );
                }
              }}
            >
              {t("Save in my account")}
            </button>
            <a href="/auth/sign-in">{t("Sign in")}</a>
            <p className="hub-caption">
              {t("Only share your edit link with someone you trust.")}
            </p>
            {emailBox && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  try {
                    const s = await save();
                    await api(
                      `plans/${s.id}`,
                      {
                        action: "email",
                        email: f.get("email"),
                        reminderConsent: f.get("reminder") === "on",
                      },
                      s.key,
                    );
                    setMessage(
                      "Email queued. Delivery requires a configured sender.",
                    );
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              >
                <label>
                  {t("Email")}
                  <input type="email" name="email" required />
                </label>
                <label className="hub-checkbox">
                  <input type="checkbox" name="reminder" />
                  Send one reminder if I leave this plan for 24 hours.
                </label>
                <button>{t("Send message")}</button>
              </form>
            )}
          </div>
        </aside>
      </div>
      <p className="hub-status" role="status">
        {pending ? t("Loading…") : message}
      </p>
      {intent && (
        <section ref={formRef} className="hub-panel hub-booking-form">
          <p className="eyebrow">LET’S MAKE IT HAPPEN</p>
          <h2>
            {t(
              intent === "booking"
                ? "Book this itinerary"
                : "Ask a manager to adjust it",
            )}
          </h2>
          <p>
            This sends one package request. The team confirms availability and
            sends a final quote before payment.
          </p>
          <form onSubmit={send}>
            <div className="hub-form-grid">
              {[
                ["name", "Name", "text"],
                ["email", "Email", "email"],
                ["phone", "Phone", "tel"],
                ["allergies", "Allergies", "text"],
                ["accessibility", "Accessibility needs", "text"],
              ].map(([name, label, type]) => (
                <label key={name}>
                  {t(label)}
                  <input
                    name={name}
                    type={type}
                    required={name === "name" || name === "email"}
                    maxLength={
                      name === "allergies" || name === "accessibility"
                        ? 500
                        : 120
                    }
                  />
                </label>
              ))}
              <label>
                {t("Language")}
                <select name="language" defaultValue={lang}>
                  <option value="en">English</option>
                  <option value="ru">Русский</option>
                </select>
              </label>
            </div>
            <label>
              {t("Message")}
              <textarea name="message" rows={3} maxLength={2000} />
            </label>
            <label className="hub-checkbox">
              <input type="checkbox" name="reminder" />
              Send a single abandoned-plan reminder after 24 hours.
            </label>
            <label className="hub-checkbox">
              <input type="checkbox" name="sms" />
              Send transactional SMS reminders to my phone.
            </label>
            <label className="hub-checkbox">
              <input type="checkbox" name="marketing" />
              Send return-trip offers after my visit.
            </label>
            <label className="hub-checkbox">
              <input required type="checkbox" />I have read the{" "}
              <a href="/privacy">privacy notice</a> and agree to be contacted
              about this request.
            </label>
            <div className="hub-inline-actions">
              <button className="button button-accent" disabled={pending}>
                {t("Send request")}
              </button>
              <button type="button" onClick={() => setIntent("")}>
                Close
              </button>
            </div>
          </form>
        </section>
      )}
      {requestId && requestData && (
        <section className="hub-panel hub-request-thread">
          <p className="eyebrow">YOUR ALMATY TRAVEL DESK</p>
          <h2>{t("Messages & final quote")}</h2>
          <p>
            {t("Your request")} · {requestData.request.status} ·{" "}
            {requestData.request.paymentStatus}
          </p>
          {requestData.quote && (
            <div className="hub-quote">
              <h3>
                {money(
                  Number(requestData.quote.amount_minor),
                  requestData.quote.currency,
                )}
              </h3>
              <p>
                {requestData.quote.deposit_percent}% deposit ·{" "}
                {requestData.quote.status}
              </p>
              <p className="hub-prewrap">{requestData.quote.terms}</p>
              {requestData.quote.breakdown?.adjustmentNote && (
                <p className="hub-prewrap">
                  {requestData.quote.breakdown.adjustmentNote}
                </p>
              )}
              <p className="hub-caption">
                Expires:{" "}
                {new Date(requestData.quote.expires_at).toLocaleString()}
              </p>
              <div className="hub-inline-actions">
                {requestData.quote.status === "pending" && (
                  <button
                    className="button button-accent"
                    disabled={pending}
                    onClick={() =>
                      void requestAction({
                        action: "approve",
                        quoteId: requestData.quote.id,
                        viewedVersion: saved?.version,
                      })
                    }
                  >
                    {t("Approve quote")}
                  </button>
                )}
                {requestData.quote.status === "approved" && (
                  <>
                    <button
                      disabled={pending}
                      onClick={() =>
                        void requestAction({
                          action: "checkout",
                          mode: "deposit",
                        })
                      }
                    >
                      {t("Pay deposit")}
                    </button>
                    <button
                      disabled={pending}
                      onClick={() =>
                        void requestAction({ action: "checkout", mode: "full" })
                      }
                    >
                      {t("Pay in full")}
                    </button>
                    {config.payOnArrival && (
                      <button
                        disabled={pending}
                        onClick={() =>
                          void requestAction({ action: "arrival" })
                        }
                      >
                        {t("Pay on arrival")}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          <div className="hub-messages">
            {requestData.messages.map((m: any) => (
              <article key={m.id}>
                <small>
                  {m.actor === "client" ? "You" : "Almaty team"} ·{" "}
                  {new Date(m.created_at).toLocaleString()}
                </small>
                <p>{m.body}</p>
              </article>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              void requestAction({
                action: "message",
                message: new FormData(form).get("message"),
              }).then(() => form.reset());
            }}
          >
            <label>
              {t("Message")}
              <textarea name="message" maxLength={2000} required rows={3} />
            </label>
            <button disabled={pending} className="button button-outline">
              {t("Send message")}
            </button>
          </form>
          <div className="hub-inline-actions">
            <button
              onClick={() =>
                void requestAction({
                  action: "reschedule",
                  message:
                    "Please suggest a new date or an indoor alternative.",
                })
              }
            >
              {t("Ask for a free weather reschedule")}
            </button>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "Cancel this request? Refunds follow the accepted quote terms.",
                  )
                )
                  void requestAction({ action: "cancel" });
              }}
            >
              {t("Cancel request")}
            </button>
            <button onClick={() => void loadRequest()}>Refresh messages</button>
          </div>
          {requestData.request.status === "completed" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void requestAction({
                  action: "review",
                  rating: Number(f.get("rating")),
                  text: f.get("text"),
                });
              }}
            >
              <h3>How was your trip?</h3>
              <label>
                Rating
                <select name="rating">
                  {[5, 4, 3, 2, 1].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Review
                <textarea name="text" required maxLength={1500} />
              </label>
              <button>Submit review for publication</button>
            </form>
          )}
        </section>
      )}
    </>
  );
}
function MapMark() {
  return <span className="hub-empty-icon">✦</span>;
}
