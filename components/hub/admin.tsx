"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import {
  itemSchema,
  type CatalogItem,
  type Plan,
  stages,
  type HubSettings,
  type MenuItem,
} from "@/lib/hub/types";
import { money, dayDate, conflicts } from "@/lib/hub/core";
import { api } from "./shared";
import type { AdminAction, HubAdminData, RequestRow } from "./admin-types";
const categories = [
  "mountains",
  "viewpoint",
  "park",
  "museum",
  "market",
  "restaurant",
  "cafe",
  "shop",
  "activity",
  "transfer",
  "rental",
  "beach",
];
const read = (o: object, key: string) => (o as Record<string, unknown>)[key];
const parse = (f: FormData, key: string) => String(f.get(key) || "");
export function HubAdmin() {
  const [data, setData] = useState<HubAdminData | null>(null),
    [tab, setTab] = useState("requests"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [edit, setEdit] = useState<CatalogItem | null>(null),
    [eventId] = useState(() => `event-${Date.now()}`);
  function load() {
    return api("admin").then(
      (value: HubAdminData) => setData(value),
      (e: Error) => setMessage(e.message),
    );
  }
  useEffect(() => {
    void load();
  }, []);
  async function action(body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const result = await api("admin", body);
      await load();
      setMessage("Saved.");
      return result;
    } catch (e) {
      setMessage((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="hub-panel">
        <h1>Travel desk</h1>
        <p role="status">{message || "Loading your workspace…"}</p>
        <a href="/auth/sign-in">Sign in</a>
      </div>
    );
  const owner = data.staff.role === "owner",
    partner = data.staff.role === "partner",
    tabs = partner
      ? ["menus"]
      : owner
        ? [
            "requests",
            "catalog",
            "menus",
            "inventory",
            "events",
            "insights",
            "settings",
          ]
        : ["requests", "catalog", "menus", "inventory"];
  const currentTab = partner ? "menus" : tab;
  return (
    <>
      <div className="hub-admin-heading">
        <div>
          <p className="eyebrow">
            ALMATY · {data.staff.role.toUpperCase()} WORKSPACE
          </p>
          <h1>A little care. A better trip.</h1>
          <p>{data.staff.email}</p>
        </div>
        <div className="hub-inline-actions">
          <a href="/admin/updates">Update log</a>
          <a href="/admin/cameras">Cameras</a>
          <button onClick={() => void load()}>
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>
      <nav className="platform-subnav" aria-label="Extended travel desk">
        <a href="/admin/research">Internet research</a>
        <a href="/admin/guides">Guides & assignments</a>
        <a href="/admin/payments">Payments & operations</a>
      </nav>
      <nav className="hub-admin-tabs" aria-label="Workspace sections">
        {tabs.map((name) => (
          <button
            key={name}
            aria-pressed={currentTab === name}
            onClick={() => {
              setTab(name);
              setSelected(null);
              setEdit(null);
            }}
          >
            {name[0].toUpperCase() + name.slice(1)}
            {name === "requests" &&
              ` (${data.requests?.filter((r) => r.status === "new").length || 0})`}
            {name === "catalog" &&
              ` (${data.items.filter((i) => i.status === "pending").length})`}
          </button>
        ))}
      </nav>
      <p role="status" className="hub-status">
        {busy ? "Saving…" : message}
      </p>
      {currentTab === "requests" && (
        <Requests
          data={data}
          action={action}
          selected={selected}
          setSelected={setSelected}
          busy={busy}
        />
      )}
      {currentTab === "catalog" && (
        <>
          <div className="hub-section-title">
            <h2>Places & services</h2>
            {owner && (
              <div className="hub-inline-actions">
                <button
                  onClick={() =>
                    setEdit(
                      itemSchema.parse({
                        id: `place-${Date.now()}`,
                        name: "New place",
                        category: "activity",
                        lat: 43.2389,
                        lng: 76.8897,
                      }),
                    )
                  }
                >
                  Add manually
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void action({ action: "discovery" }).catch(() => {})
                  }
                >
                  Discover nearby places
                </button>
              </div>
            )}
          </div>
          {edit ? (
            <CatalogEditor
              item={edit}
              save={async (item) => {
                await action({ action: "catalog", item });
                setEdit(null);
              }}
              cancel={() => setEdit(null)}
            />
          ) : (
            <div className="hub-admin-catalog">
              {data.items.map((item: CatalogItem) => (
                <article key={item.id} className="hub-panel">
                  <span className="hub-badge">{item.status}</span>
                  <h3>{item.name}</h3>
                  <p>
                    {item.category} · {item.source}
                  </p>
                  <p>{item.description}</p>
                  <p className="hub-caption">
                    {item.price
                      ? `${money(item.price.min, item.price.currency)} – ${money(item.price.max, item.price.currency)} · ${item.price.source}`
                      : "Price needs confirmation"}
                  </p>
                  {owner && (
                    <div className="hub-inline-actions">
                      <button onClick={() => setEdit(item)}>Edit</button>
                      <button
                        onClick={() =>
                          void action({
                            action: "catalog",
                            item: { ...item, status: "approved" },
                          }).catch(() => {})
                        }
                      >
                        Approve
                      </button>
                      <button
                        onClick={() =>
                          void action({
                            action: "catalog",
                            item: { ...item, status: "hidden" },
                          }).catch(() => {})
                        }
                      >
                        Hide
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          {owner && data.candidates && data.candidates.length > 0 && (
            <details className="hub-panel">
              <summary>
                External feed candidates ({data.candidates.length})
              </summary>
              {data.candidates.map((c) => (
                <article key={c.id} className="hub-candidate">
                  <h3>{c.data.title || c.data.name || c.external_id}</h3>
                  <p>
                    {c.kind} · {c.source_key}
                  </p>
                  {c.source_key === "google.place-ids" && (
                    <>
                      <p>
                        Google Place ID saved. Fetch live details, then add
                        independently sourced owner content before approval.
                      </p>
                      <button
                        onClick={async () => {
                          try {
                            const result = await api(
                              `google/${encodeURIComponent(c.external_id)}`,
                            );
                            setMessage(JSON.stringify(result.details));
                          } catch (e) {
                            setMessage((e as Error).message);
                          }
                        }}
                      >
                        View live Google details
                      </button>
                    </>
                  )}
                  <details>
                    <summary>Source record</summary>
                    <pre>{JSON.stringify(c.data, null, 2)}</pre>
                  </details>
                  <button
                    onClick={() =>
                      void action({
                        action: "candidate",
                        id: Number(c.id),
                        status: "hidden",
                      }).catch(() => {})
                    }
                  >
                    Hide
                  </button>
                  {["events", "menus", "prices"].includes(c.kind) && (
                    <button
                      onClick={() =>
                        void action({
                          action: "candidate",
                          id: Number(c.id),
                          status: "approved",
                        }).catch(() => {})
                      }
                    >
                      Approve structured record
                    </button>
                  )}
                </article>
              ))}
            </details>
          )}
        </>
      )}
      {currentTab === "menus" && (
        <>
          <h2>Restaurants & menus</h2>
          <MenuEditor
            items={data.items.filter((i: CatalogItem) =>
              ["restaurant", "cafe"].includes(i.category),
            )}
            submit={action}
          />
          {data.menuDrafts?.map((d) => (
            <article className="hub-panel" key={d.id}>
              <p className="eyebrow">{d.status} MENU</p>
              <h3>
                {data.items.find((i: CatalogItem) => i.id === d.item_id)
                  ?.name || d.item_id}
              </h3>
              <ul className="hub-menu-list">
                {d.data.items.map((m) => (
                  <li key={m.id}>
                    <strong>{m.name}</strong>
                    <span>{money(m.price, d.data.currency)}</span>
                    <p>{m.description}</p>
                    <small>{m.tags.join(" · ")}</small>
                  </li>
                ))}
              </ul>
              {owner && d.status === "pending" && (
                <button
                  onClick={() =>
                    void action({ action: "approve-menu", id: d.id }).catch(
                      () => {},
                    )
                  }
                >
                  Approve and publish menu
                </button>
              )}
            </article>
          ))}
        </>
      )}
      {currentTab === "inventory" && (
        <>
          <h2>Availability, capacity & blackout dates</h2>
          <p>
            Slots are reserved atomically. Requests without a chosen slot
            require manager confirmation.
          </p>
          {owner && (
            <form
              className="hub-panel hub-form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action({
                  action: "slot",
                  slot: {
                    id: parse(f, "id"),
                    itemId: parse(f, "itemId"),
                    start: new Date(parse(f, "start") + "+05:00").toISOString(),
                    end: new Date(parse(f, "end") + "+05:00").toISOString(),
                    capacity: Number(f.get("capacity")),
                    blackout: f.get("blackout") === "on",
                  },
                }).catch(() => {});
              }}
            >
              <label>
                Existing slot ID (blank for new)
                <input name="id" />
              </label>
              <label>
                Bookable service
                <select name="itemId" required>
                  {data.items
                    .filter((i: CatalogItem) => i.bookable)
                    .map((i: CatalogItem) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Start · Almaty time
                <input name="start" type="datetime-local" required />
              </label>
              <label>
                End · Almaty time
                <input name="end" type="datetime-local" required />
              </label>
              <label>
                Capacity
                <input
                  name="capacity"
                  type="number"
                  min="1"
                  max="1000"
                  defaultValue="8"
                  required
                />
              </label>
              <label className="hub-checkbox">
                <input name="blackout" type="checkbox" />
                Blackout / close this slot
              </label>
              <button className="button button-accent">Save slot</button>
            </form>
          )}
          <div className="hub-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Time</th>
                  <th>Remaining</th>
                  <th>Status / ID</th>
                </tr>
              </thead>
              <tbody>
                {data.slots.map((s) => (
                  <tr key={s.id}>
                    <td>{data.items.find((i) => i.id === s.item_id)?.name}</td>
                    <td>
                      {new Date(s.starts_at).toLocaleString("en-GB", {
                        timeZone: "Asia/Almaty",
                      })}
                    </td>
                    <td>
                      {s.remaining}/{s.capacity}
                    </td>
                    <td>
                      {s.blackout ? "Blackout" : "Open"}
                      <small>{s.id}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {currentTab === "events" && (
        <>
          <h2>Approved local events</h2>
          <p>
            Paste a permitted event record. Required fields and source
            attribution are validated before publication. Instagram pages are
            links, not scraped feeds.
          </p>
          <JsonForm
            title="Publish an event"
            initial={{
              id: eventId,
              title: "",
              startDate: new Date().toISOString().slice(0, 10),
              place: "",
              category: "Local event",
              description: "",
              image: "",
              imageAlt: "",
              sourceName: "",
              sourceUrl: "",
            }}
            onSave={(event) => action({ action: "event", event })}
          />
          {data.candidates
            ?.filter((c) => c.kind === "events")
            .map((c) => (
              <article className="hub-panel" key={c.id}>
                <h3>{c.data.title}</h3>
                <p>
                  {c.data.startDate} · {c.data.place}
                </p>
                <p>{c.data.description}</p>
                <a
                  href={c.data.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Original source ↗
                </a>
                <button
                  onClick={() =>
                    void action({
                      action: "candidate",
                      id: Number(c.id),
                      status: "approved",
                    }).catch(() => {})
                  }
                >
                  Approve
                </button>
              </article>
            ))}
        </>
      )}
      {currentTab === "insights" && <Insights data={data} action={action} />}
      {currentTab === "settings" && (
        <>
          <h2>Owner settings</h2>
          <div className="hub-admin-catalog">
            <section className="hub-panel">
              <h3>Integration readiness</h3>
              {Object.entries(data.configured || {}).map(([name, on]) => (
                <p key={name}>
                  {name}:{" "}
                  <strong>{on ? "Configured" : "Needs credentials"}</strong>
                </p>
              ))}
              <p>
                Keys belong in Vercel environment variables. Never paste keys
                into these content forms.
              </p>
            </section>
            <section className="hub-panel">
              <h3>Assign a manager or partner</h3>
              <p>The person first signs in and verifies their email.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action({
                    action: "staff",
                    email: f.get("email"),
                    role: f.get("role"),
                    languages: parse(f, "languages")
                      .split(",")
                      .map((s) => s.trim()),
                    restaurantIds: parse(f, "restaurants")
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }).catch(() => {});
                }}
              >
                <label>
                  Verified email
                  <input name="email" type="email" required />
                </label>
                <label>
                  Role
                  <select name="role">
                    <option value="admin">Admin</option>
                    <option value="partner">Restaurant partner</option>
                  </select>
                </label>
                <label>
                  Languages (en,ru)
                  <input name="languages" defaultValue="en" />
                </label>
                <label>
                  Assigned restaurant IDs, comma-separated
                  <input name="restaurants" />
                </label>
                <button>Save role</button>
              </form>
              {data.staffRows.map((s) => (
                <p key={s.user_id}>
                  {s.email} · {s.role}
                </p>
              ))}
            </section>
          </div>
          <SettingsEditor
            initial={data.settings}
            save={(settings) => action({ action: "settings", settings })}
          />
          <details className="hub-panel">
            <summary>Audit history</summary>
            {data.audit?.map((a, k) => (
              <p key={k}>
                {new Date(a.created_at).toLocaleString()} · {a.action} ·{" "}
                {a.resource}
              </p>
            ))}
          </details>
        </>
      )}
    </>
  );
}
function Requests({
  data,
  action,
  selected,
  setSelected,
  busy,
}: {
  data: HubAdminData;
  action: AdminAction;
  selected: string | null;
  setSelected: (v: string | null) => void;
  busy: boolean;
}) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [manager, setManager] = useState("all"),
    [guests, setGuests] = useState(0),
    [minValue, setMinValue] = useState(0);
  const rows = data.requests.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (!from || r.plan.startDate >= from) &&
      (!to || r.plan.startDate <= to) &&
      (manager === "all" || r.assigned_to === manager) &&
      r.plan.adults + r.plan.children >= guests &&
      Number(r.quote_amount || 0) >= minValue * 100 &&
      `${r.id} ${r.guest.name} ${r.guest.email}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const current = data.requests.find((r) => r.id === selected);
  if (current)
    return (
      <RequestDetail
        key={`${current.id}-${current.plan_version}`}
        request={current}
        data={data}
        action={action}
        close={() => setSelected(null)}
        busy={busy}
      />
    );
  return (
    <>
      <div className="hub-section-title">
        <h2>Every trip starts here.</h2>
        <button
          onClick={() => {
            const esc = (v: unknown) => {
              let s = String(v ?? "");
              if (/^[=+\-@]/.test(s)) s = "'" + s;
              return '"' + s.replaceAll('"', '""') + '"';
            };
            const csv = [
              [
                "ID",
                "Name",
                "Email",
                "Date",
                "Guests",
                "Status",
                "Quote minor",
                "Currency",
              ],
              ...rows.map((r) => [
                r.id,
                r.guest.name,
                r.guest.email,
                r.plan.startDate,
                r.plan.adults + r.plan.children,
                r.status,
                r.quote_amount || "",
                r.quote_currency || "",
              ]),
            ]
              .map((r) => r.map(esc).join(","))
              .join("\r\n");
            const a = document.createElement("a");
            a.href = URL.createObjectURL(
              new Blob([csv], { type: "text/csv;charset=utf-8" }),
            );
            a.download = "almaty-requests.csv";
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          Export filtered CSV
        </button>
      </div>
      <div className="hub-request-filters">
        <label>
          Search
          <input
            placeholder="Name, email or request ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            {stages.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          Manager
          <select value={manager} onChange={(e) => setManager(e.target.value)}>
            <option value="all">All</option>
            {data.staffRows
              .filter((s) => s.role !== "partner")
              .map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.email}
                </option>
              ))}
          </select>
        </label>
        <label>
          Minimum guests
          <input
            type="number"
            min="0"
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
          />
        </label>
        <label>
          Minimum quote
          <input
            type="number"
            min="0"
            value={minValue}
            onChange={(e) => setMinValue(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="hub-pipeline">
        {stages.map((stage) => (
          <section key={stage}>
            <h3>
              {stage.replace("-", " ")}{" "}
              <span>{rows.filter((r) => r.status === stage).length}</span>
            </h3>
            {rows
              .filter((r) => r.status === stage)
              .map((r) => (
                <button
                  key={r.id}
                  className="hub-request-card"
                  onClick={() => setSelected(r.id)}
                >
                  <strong>{r.guest.name}</strong>
                  <span>
                    {r.plan.startDate} · {r.plan.adults + r.plan.children}{" "}
                    guests
                  </span>
                  <span>
                    {r.guest.language.toUpperCase()} · {r.payment_status}
                  </span>
                  <b>
                    {r.quote_amount
                      ? money(
                          Number(r.quote_amount),
                          r.quote_currency || undefined,
                        )
                      : "Quote needed"}
                  </b>
                  {r.status === "new" &&
                    Date.now() - new Date(r.created_at).valueOf() > 1800000 && (
                      <small className="hub-overdue">Reply due</small>
                    )}
                </button>
              ))}
          </section>
        ))}
      </div>
    </>
  );
}
function RequestDetail({
  request: r,
  data,
  action,
  close,
  busy,
}: {
  request: RequestRow;
  data: HubAdminData;
  action: AdminAction;
  close: () => void;
  busy: boolean;
}) {
  const [plan, setPlan] = useState<Plan>(r.plan),
    [reply, setReply] = useState(""),
    [visibility, setVisibility] = useState("client"),
    [day, setDay] = useState(0);
  const messages = data.messages.filter((m) => m.request_id === r.id).reverse();
  const checks = conflicts(plan, data.items, data.weather);
  if (!r.guest.phone)
    checks.push({
      stopId: "client",
      kind: "info",
      message: "No contact phone provided.",
      fix: "Ask the client if a phone is needed for this service.",
    });
  for (const stop of plan.days.flatMap((d) => d.stops))
    if (
      data.items.find((i: CatalogItem) => i.id === stop.itemId)?.bookable &&
      !stop.slotId
    )
      checks.push({
        stopId: stop.id,
        kind: "availability",
        message: "A bookable service has no selected slot.",
        fix: "Agree a slot before the client confirms or pays.",
      });
  const templates = [
    "Thank you for your request. I am checking availability and will send a final quote shortly.",
    "I have adjusted the itinerary to allow more travel time. Please review the updated quote.",
    "The forecast may affect your outdoor activity. We can offer a free reschedule or an indoor alternative.",
  ];
  return (
    <>
      <button onClick={close}>← All requests</button>
      <div className="hub-manager-layout">
        <section className="hub-panel">
          <p className="eyebrow">REQUEST {r.id.slice(0, 8)}</p>
          <h2>{r.guest.name}</h2>
          <p>
            <a href={`mailto:${r.guest.email}`}>{r.guest.email}</a> ·{" "}
            <a href={`tel:${r.guest.phone}`}>{r.guest.phone}</a>
            {r.guest.phone && (
              <a
                href={`https://wa.me/${r.guest.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {" "}
                WhatsApp ↗
              </a>
            )}
          </p>
          <p>
            {r.plan.adults + r.plan.children} guests ·{" "}
            {r.guest.language.toUpperCase()} · {r.plan.startDate}
          </p>
          <dl className="hub-preferences">
            <dt>Allergies</dt>
            <dd>{r.guest.allergies || "None provided"}</dd>
            <dt>Accessibility</dt>
            <dd>{r.guest.accessibility || "None provided"}</dd>
            <dt>Payment</dt>
            <dd>
              {r.payment_status} · paid{" "}
              {money(Number(r.paid_minor), r.currency)}
            </dd>
          </dl>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action({
                action: "request",
                id: r.id,
                status: f.get("status"),
                assignedTo: f.get("manager"),
                note: f.get("note"),
              }).catch(() => {});
            }}
          >
            <div className="hub-form-grid">
              <label>
                Status
                <select name="status" defaultValue={r.status}>
                  {stages.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Assigned manager
                <select name="manager" defaultValue={r.assigned_to || ""}>
                  <option value="">Unassigned</option>
                  {data.staffRows
                    .filter((s) => s.role !== "partner")
                    .map((s) => (
                      <option key={s.user_id} value={s.user_id}>
                        {s.email}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label>
              Internal note
              <textarea name="note" rows={2} maxLength={2000} />
            </label>
            <button disabled={busy}>Update request</button>
          </form>
          <h3>Conversation & internal notes</h3>
          <div className="hub-messages">
            {messages.map((m) => (
              <article
                key={m.id}
                className={m.visibility === "internal" ? "hub-note" : ""}
              >
                <small>
                  {m.visibility} · {m.actor === "client" ? "Client" : "Team"} ·{" "}
                  {new Date(m.created_at).toLocaleString()}
                </small>
                <p>{m.body}</p>
              </article>
            ))}
          </div>
          <label>
            Quick reply
            <select onChange={(e) => setReply(e.target.value)} defaultValue="">
              <option value="">Choose a template</option>
              {templates.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action({
                action: "message",
                id: r.id,
                message: reply,
                visibility,
              })
                .then(() => setReply(""))
                .catch(() => {});
            }}
          >
            <label>
              Message
              <textarea
                required
                maxLength={2000}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
            </label>
            <select
              aria-label="Message visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
            >
              <option value="client">Send to client thread + email</option>
              <option value="internal">Internal note only</option>
            </select>
            <button className="button button-accent" disabled={busy}>
              Save message
            </button>
          </form>
        </section>
        <section className="hub-panel">
          <h2>Itinerary & final quote</h2>
          <details className="hub-conflicts" open>
            <summary>Automatic planning checks ({checks.length})</summary>
            {checks.map((c, k) => (
              <p key={k}>
                <strong>{c.message}</strong> {c.fix}
              </p>
            ))}
          </details>
          <p>
            Changes are published to the same shared link when you send the
            quote. The client approves its version before paying.
          </p>
          <label>
            Day
            <select
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
            >
              {plan.days.map((_, i) => (
                <option value={i} key={i}>
                  Day {i + 1} · {dayDate(plan.startDate, i)}
                </option>
              ))}
            </select>
          </label>
          {plan.days[day].stops.map((s, k) => (
            <div className="hub-manager-stop" key={s.id}>
              <select
                aria-label="Place"
                value={s.itemId}
                onChange={(e) =>
                  setPlan({
                    ...plan,
                    days: plan.days.map((d, i) =>
                      i === day
                        ? {
                            stops: d.stops.map((stop, j) =>
                              j === k
                                ? {
                                    ...stop,
                                    itemId: e.target.value,
                                    slotId: undefined,
                                  }
                                : stop,
                            ),
                          }
                        : d,
                    ),
                  })
                }
              >
                {data.items
                  .filter((i: CatalogItem) => i.status === "approved")
                  .map((i: CatalogItem) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
              </select>
              <input
                type="time"
                aria-label="Start time"
                value={s.start}
                onChange={(e) =>
                  setPlan({
                    ...plan,
                    days: plan.days.map((d, i) =>
                      i === day
                        ? {
                            stops: d.stops.map((stop, j) =>
                              j === k
                                ? { ...stop, start: e.target.value }
                                : stop,
                            ),
                          }
                        : d,
                    ),
                  })
                }
              />
              <input
                type="number"
                aria-label="Visit minutes"
                min="15"
                value={s.duration}
                onChange={(e) =>
                  setPlan({
                    ...plan,
                    days: plan.days.map((d, i) =>
                      i === day
                        ? {
                            stops: d.stops.map((stop, j) =>
                              j === k
                                ? { ...stop, duration: Number(e.target.value) }
                                : stop,
                            ),
                          }
                        : d,
                    ),
                  })
                }
              />
              <button
                onClick={() =>
                  setPlan({
                    ...plan,
                    days: plan.days.map((d, i) =>
                      i === day
                        ? { stops: d.stops.filter((_, j) => j !== k) }
                        : d,
                    ),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const item = data.items.find(
                (i: CatalogItem) => i.status === "approved",
              );
              if (item)
                setPlan({
                  ...plan,
                  days: plan.days.map((d, i) =>
                    i === day
                      ? {
                          stops: [
                            ...d.stops,
                            {
                              id: crypto.randomUUID(),
                              itemId: item.id,
                              start: "15:00",
                              duration: item.duration,
                              note: "",
                            },
                          ],
                        }
                      : d,
                  ),
                });
            }}
          >
            Add stop
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action({
                action: "quote",
                id: r.id,
                plan,
                version: r.plan_version,
                amount: Math.round(Number(f.get("amount")) * 100),
                currency: f.get("currency"),
                depositPercent: Number(f.get("deposit")),
                terms: f.get("terms"),
                adjustmentNote: f.get("adjustment"),
              }).catch(() => {});
            }}
          >
            <div className="hub-form-grid">
              <label>
                Final total, major currency units
                <input
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={Number(r.quote_amount || 0) / 100}
                  required
                />
              </label>
              <label>
                Settlement currency
                <select
                  name="currency"
                  defaultValue={r.quote_currency || "KZT"}
                >
                  {["KZT", "USD", "EUR", "RUB", "GBP"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Deposit %
                <input
                  name="deposit"
                  type="number"
                  min="1"
                  max="100"
                  defaultValue={data.settings.depositPercent}
                />
              </label>
            </div>
            <label>
              Price adjustment / discount / custom inclusions
              <textarea name="adjustment" maxLength={1000} rows={2} />
            </label>
            <label>
              Inclusions, cancellation & refund terms
              <textarea
                required
                name="terms"
                rows={5}
                maxLength={5000}
                defaultValue={r.quote_terms || data.settings.policy}
              />
            </label>
            <button disabled={busy} className="button button-accent">
              Send final quote & payment options
              <ArrowUpRight size={15} />
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
function CatalogEditor({
  item,
  save,
  cancel,
}: {
  item: CatalogItem;
  save: (i: CatalogItem) => Promise<void>;
  cancel: () => void;
}) {
  const [error, setError] = useState("");
  return (
    <form
      className="hub-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        try {
          const schedule: Record<string, [string, string][]> = {};
          for (let day = 0; day < 7; day++) {
            if (f.get(`closed${day}`) === "on") schedule[day] = [];
            else if (f.get(`open${day}`) && f.get(`end${day}`))
              schedule[day] = [[parse(f, `open${day}`), parse(f, `end${day}`)]];
          }
          const ptype = parse(f, "priceType");
          const price =
            ptype === "unknown"
              ? null
              : {
                  type: ptype,
                  min: Math.round(Number(f.get("min")) * 100),
                  max: Math.round(Number(f.get("max")) * 100),
                  ...(parse(f, "child")
                    ? { child: Math.round(Number(f.get("child")) * 100) }
                    : {}),
                  currency: parse(f, "currency"),
                  source: parse(f, "priceSource"),
                  updatedAt: new Date().toISOString(),
                  note: parse(f, "priceNote"),
                };
          const next = itemSchema.parse({
            ...item,
            name: parse(f, "name"),
            nameRu: parse(f, "nameRu"),
            description: parse(f, "description"),
            descriptionRu: parse(f, "descriptionRu"),
            category: parse(f, "category"),
            lat: Number(f.get("lat")),
            lng: Number(f.get("lng")),
            image: parse(f, "image"),
            alt: parse(f, "alt"),
            hours: parse(f, "hours"),
            duration: Number(f.get("duration")),
            rating: parse(f, "rating") ? Number(f.get("rating")) : null,
            reviews: Number(f.get("reviews")),
            phone: parse(f, "phone"),
            website: parse(f, "website"),
            sourceUrl: parse(f, "sourceUrl"),
            source: parse(f, "source"),
            googlePlaceId: parse(f, "googlePlaceId"),
            status: parse(f, "status"),
            sort: Number(f.get("sort")),
            outdoor: f.get("outdoor") === "on",
            bookable: f.get("bookable") === "on",
            serviceDepositPercent: f.get("serviceDepositPercent")
              ? Number(f.get("serviceDepositPercent"))
              : undefined,
            closed: f.get("closed") === "on",
            verifiedAt: new Date().toISOString(),
            schedule,
            price,
          });
          await save(next);
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <h2>{item.id}</h2>
      <div className="hub-form-grid">
        {[
          ["name", "Name"],
          ["nameRu", "Russian name"],
          ["image", "Photo URL"],
          ["alt", "Photo alt text"],
          ["phone", "Phone"],
          ["website", "Website"],
          ["source", "Source / permission"],
          ["sourceUrl", "Source URL"],
          ["googlePlaceId", "Google Place ID"],
          ["hours", "Opening-hours text"],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              name={key}
              defaultValue={String(read(item, key) || "")}
              required={key === "name"}
              maxLength={800}
            />
          </label>
        ))}
        <label>
          Category
          <select name="category" defaultValue={item.category}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={item.status}>
            {["pending", "approved", "hidden"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {[
          ["lat", "Latitude"],
          ["lng", "Longitude"],
          ["duration", "Visit duration, minutes"],
          ["sort", "Sort priority"],
          ["rating", "Independent source rating"],
          ["reviews", "Review count"],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              name={key}
              type="number"
              step={key === "lat" || key === "lng" ? "any" : "1"}
              defaultValue={Number(read(item, key) ?? 0)}
            />
          </label>
        ))}
      </div>
      <label>
        Description
        <textarea
          name="description"
          rows={3}
          defaultValue={item.description}
          maxLength={1800}
        />
      </label>
      <label>
        Russian description
        <textarea
          name="descriptionRu"
          rows={3}
          defaultValue={item.descriptionRu}
          maxLength={1800}
        />
      </label>
      <div className="hub-inline-actions">
        {[
          ["outdoor", "Outdoor"],
          ["bookable", "Bookable service"],
          ["closed", "Permanently closed"],
        ].map(([key, label]) => (
          <label className="hub-checkbox" key={key}>
            <input
              type="checkbox"
              name={key}
              defaultChecked={Boolean(read(item, key))}
            />
            {label}
          </label>
        ))}
      </div>
      <label>
        Minimum card deposit for this service (%)
        <input
          type="number"
          name="serviceDepositPercent"
          min="1"
          max="100"
          defaultValue={item.serviceDepositPercent}
          placeholder="Use the package default"
        />
      </label>
      <h3>Verified weekly hours · Almaty time</h3>
      <p className="hub-caption">
        Leave both times empty when unknown. “Closed” is an explicit closure for
        that weekday.
      </p>
      <div className="hub-hours-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
          <div key={day}>
            <strong>{day}</strong>
            <input
              aria-label={`${day} opens`}
              type="time"
              name={`open${i}`}
              defaultValue={item.schedule[i]?.[0]?.[0] || ""}
            />
            <input
              aria-label={`${day} closes`}
              type="time"
              name={`end${i}`}
              defaultValue={item.schedule[i]?.[0]?.[1] || ""}
            />
            <label className="hub-checkbox">
              <input
                name={`closed${i}`}
                type="checkbox"
                defaultChecked={
                  Array.isArray(item.schedule[i]) &&
                  item.schedule[i].length === 0
                }
              />
              Closed
            </label>
          </div>
        ))}
      </div>
      <h3>Pricing · enter major currency units</h3>
      <div className="hub-form-grid">
        <label>
          Price type
          <select name="priceType" defaultValue={item.price?.type || "unknown"}>
            {[
              "unknown",
              "free",
              "fixed",
              "per-person",
              "per-group",
              "range",
            ].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Minimum adult / group
          <input
            name="min"
            type="number"
            step="0.01"
            min="0"
            defaultValue={(item.price?.min || 0) / 100}
          />
        </label>
        <label>
          Maximum adult / group
          <input
            name="max"
            type="number"
            step="0.01"
            min="0"
            defaultValue={(item.price?.max || 0) / 100}
          />
        </label>
        <label>
          Child price (blank = adult)
          <input
            name="child"
            type="number"
            step="0.01"
            min="0"
            defaultValue={
              item.price?.child !== undefined ? item.price.child / 100 : ""
            }
          />
        </label>
        <label>
          Currency
          <select name="currency" defaultValue={item.price?.currency || "KZT"}>
            {["KZT", "USD", "EUR", "RUB", "GBP"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Price source
          <select
            name="priceSource"
            defaultValue={item.price?.source || "estimated"}
          >
            {["estimated", "auto-detected", "owner-confirmed"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Price note
          <input
            name="priceNote"
            defaultValue={item.price?.note || ""}
            maxLength={300}
          />
        </label>
      </div>
      <p role="alert">{error}</p>
      <div className="hub-inline-actions">
        <button className="button button-accent">Save place</button>
        <button type="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
function MenuEditor({
  items,
  submit,
}: {
  items: CatalogItem[];
  submit: AdminAction;
}) {
  const [itemId, setItemId] = useState(items[0]?.id || ""),
    [menu, setMenu] = useState<MenuItem[]>(items[0]?.menu || []),
    [currency, setCurrency] = useState("KZT"),
    [text, setText] = useState(""),
    [message, setMessage] = useState("");
  if (!items.length)
    return (
      <div className="hub-panel">
        <p>
          No assigned approved restaurant yet. The owner can add one in Catalog,
          then assign a partner.
        </p>
      </div>
    );
  return (
    <section className="hub-panel">
      <label>
        Restaurant
        <select
          value={itemId}
          onChange={(e) => {
            setItemId(e.target.value);
            setMenu(items.find((i) => i.id === e.target.value)?.menu || []);
          }}
        >
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </label>
      <details>
        <summary>Import permitted menu text or photo/PDF</summary>
        <p>
          Text format: Name; price; description; dietary tags separated by
          commas. Prices use major currency units. Review every imported item.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
        />
        <button
          onClick={async () => {
            try {
              const d = await api("menu-import", { text });
              setMenu(d.items);
              setMessage(`${d.items.length} items ready for review.`);
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          Parse pasted text
        </button>
        <label>
          JPG, PNG or PDF under 4 MB
          <input
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const form = new FormData();
                form.set("file", file);
                const r = await fetch("/api/hub/menu-import", {
                  method: "POST",
                  body: form,
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                setMenu(d.items);
                setMessage(
                  "Extraction ready. Check prices and dietary claims before submitting.",
                );
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          />
        </label>
      </details>
      <label>
        Menu currency
        <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {["KZT", "USD", "EUR", "RUB", "GBP"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      {menu.map((m, k) => (
        <div className="hub-menu-edit" key={m.id}>
          <label>
            Item
            <input
              value={m.name}
              onChange={(e) =>
                setMenu(
                  menu.map((v, j) =>
                    j === k ? { ...v, name: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
          <label>
            Price
            <input
              type="number"
              min="0"
              step="0.01"
              value={m.price / 100}
              onChange={(e) =>
                setMenu(
                  menu.map((v, j) =>
                    j === k
                      ? {
                          ...v,
                          price: Math.round(Number(e.target.value) * 100),
                        }
                      : v,
                  ),
                )
              }
            />
          </label>
          <label>
            Description
            <input
              value={m.description}
              onChange={(e) =>
                setMenu(
                  menu.map((v, j) =>
                    j === k ? { ...v, description: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
          <label>
            Photo URL
            <input
              value={m.photo || ""}
              onChange={(e) =>
                setMenu(
                  menu.map((v, j) =>
                    j === k ? { ...v, photo: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
          <div className="hub-inline-actions">
            {(["vegetarian", "vegan", "halal", "gluten-free"] as const).map(
              (tag) => (
                <label className="hub-checkbox" key={tag}>
                  <input
                    type="checkbox"
                    checked={m.tags.includes(tag)}
                    onChange={() =>
                      setMenu(
                        menu.map((v, j) =>
                          j === k
                            ? {
                                ...v,
                                tags: v.tags.includes(tag)
                                  ? v.tags.filter((t) => t !== tag)
                                  : [...v.tags, tag],
                              }
                            : v,
                        ),
                      )
                    }
                  />
                  {tag}
                </label>
              ),
            )}
            <button onClick={() => setMenu(menu.filter((_, j) => j !== k))}>
              Remove
            </button>
          </div>
        </div>
      ))}
      <div className="hub-inline-actions">
        <button
          onClick={() =>
            setMenu([
              ...menu,
              {
                id: crypto.randomUUID(),
                name: "",
                description: "",
                price: 0,
                tags: [],
                photo: "",
              },
            ])
          }
        >
          Add menu item
        </button>
        <button
          className="button button-accent"
          onClick={() =>
            void submit({ action: "menu", itemId, items: menu, currency })
              .then(() => setMessage("Submitted for owner review."))
              .catch(() => {})
          }
        >
          Submit menu for review
        </button>
      </div>
      <p role="status">{message}</p>
    </section>
  );
}
function SettingsEditor({
  initial,
  save,
}: {
  initial: HubSettings;
  save: (s: HubSettings) => Promise<unknown>;
}) {
  const [error, setError] = useState("");
  return (
    <form
      className="hub-panel"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        try {
          const next = { ...initial };
          for (const key of [
            "markup",
            "groupThreshold",
            "groupDiscount",
            "transportBase",
            "transportPerKm",
            "vehicleCapacity",
            "depositPercent",
            "dailyHour",
          ] as const)
            next[key] = Number(f.get(key));
          for (const key of [
            "payOnArrival",
            "autoPublish",
            "discoveryEnabled",
            "hideClosed",
          ] as const)
            next[key] = f.get(key) === "on";
          for (const key of [
            "operatorName",
            "operatorAddress",
            "policy",
            "returnDiscount",
            "welcomeEn",
            "welcomeRu",
          ] as const)
            next[key] = parse(f, key);
          next.assignment = parse(f, "assignment") as HubSettings["assignment"];
          next.seasonal = JSON.parse(parse(f, "seasonal"));
          void save(next).catch(() => {});
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <h3>Pricing, scheduling & operator</h3>
      <p>
        Transport rates are stored in minor KZT units. Daily time is
        Asia/Almaty; schedule routing uses the same hourly cloud worker.
      </p>
      <div className="hub-form-grid">
        {[
          ["markup", "Global markup / discount %"],
          ["groupThreshold", "Group discount starts at guests"],
          ["groupDiscount", "Group discount %"],
          ["transportBase", "Transport base, minor KZT"],
          ["transportPerKm", "Per km, minor KZT"],
          ["vehicleCapacity", "Guests per vehicle"],
          ["depositPercent", "Default deposit %"],
          ["dailyHour", "Daily update hour, 0–23"],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              name={key}
              type="number"
              defaultValue={Number(read(initial, key) ?? 0)}
            />
          </label>
        ))}
        {[
          ["welcomeEn", "Homepage introduction, English"],
          ["welcomeRu", "Homepage introduction, Russian"],
          ["operatorName", "Legal operator name"],
          ["operatorAddress", "Operator address"],
          ["returnDiscount", "Return-trip offer text/code"],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <input name={key} defaultValue={String(read(initial, key) ?? "")} />
          </label>
        ))}
        <label>
          Assignment
          <select name="assignment" defaultValue={initial.assignment}>
            <option value="round-robin">
              Lowest active workload / round-robin
            </option>
            <option value="language">Language, then workload</option>
          </select>
        </label>
      </div>
      <div className="hub-inline-actions">
        {[
          ["payOnArrival", "Allow pay on arrival"],
          [
            "autoPublish",
            "Auto-publish independently documented places rated 4.3+ / 50 reviews",
          ],
          ["discoveryEnabled", "Enable daily OSM discovery"],
          ["hideClosed", "Hide confirmed closed OSM places"],
        ].map(([key, label]) => (
          <label className="hub-checkbox" key={key}>
            <input
              type="checkbox"
              name={key}
              defaultChecked={Boolean(read(initial, key))}
            />
            {label}
          </label>
        ))}
      </div>
      <label>
        Default quote, cancellation & refund terms
        <textarea name="policy" rows={4} defaultValue={initial.policy} />
      </label>
      <label>
        Seasonal adjustments JSON: from, to, percent
        <textarea
          name="seasonal"
          rows={4}
          defaultValue={JSON.stringify(initial.seasonal, null, 2)}
        />
      </label>
      <p role="alert">{error}</p>
      <button className="button button-accent">Save settings</button>
    </form>
  );
}
function JsonForm({
  title,
  initial,
  onSave,
}: {
  title: string;
  initial: Record<string, unknown>;
  onSave: (v: Record<string, unknown>) => Promise<unknown>;
}) {
  const [value, setValue] = useState(JSON.stringify(initial, null, 2)),
    [error, setError] = useState("");
  return (
    <form
      className="hub-panel"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          void onSave(JSON.parse(value)).catch((err) => setError(err.message));
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <h3>{title}</h3>
      <textarea
        rows={14}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
      />
      <p role="alert">{error}</p>
      <button className="button button-accent">Validate & publish</button>
    </form>
  );
}
function Insights({
  data,
  action,
}: {
  data: HubAdminData;
  action: AdminAction;
}) {
  const a = data.analytics;
  if (!a) return null;
  const events = a.events;
  return (
    <>
      <h2>Owner insights</h2>
      <div className="hub-stats-grid">
        <article className="hub-panel">
          <span>Requests</span>
          <strong>{a.orders.requests}</strong>
        </article>
        <article className="hub-panel">
          <span>Confirmed / completed</span>
          <strong>{a.orders.confirmed}</strong>
        </article>
        {events.map((e) => (
          <article className="hub-panel" key={e.event}>
            <span>{e.event} · consented analytics</span>
            <strong>{e.count}</strong>
          </article>
        ))}
        {a.currencies.map((c) => (
          <article className="hub-panel" key={c.currency}>
            <span>Revenue · {c.currency}</span>
            <strong>{money(Number(c.revenue), c.currency)}</strong>
            <small>
              Average paid order:{" "}
              {c.paid_orders
                ? money(Number(c.revenue) / c.paid_orders, c.currency)
                : "—"}
            </small>
          </article>
        ))}
      </div>
      <p className="hub-caption">
        Analytics count only consented events and may undercount visitors.
        Revenue is grouped by settlement currency; refunds require
        reconciliation.
      </p>
      <div className="hub-admin-catalog">
        {["removed", "added", "booked"].map((event) => (
          <article className="hub-panel" key={event}>
            <h3>Most {event} places</h3>
            {a.places
              .filter((p) => p.event === event)
              .slice(0, 10)
              .map((p) => (
                <p key={p.item_id}>
                  {data.items.find((i) => i.id === p.item_id)?.name ||
                    p.item_id}{" "}
                  <strong>{p.count}</strong>
                </p>
              ))}
          </article>
        ))}
        <article className="hub-panel">
          <h3>Camera uptime · last 7 days</h3>
          {a.camera.map((c) => (
            <p key={c.id}>
              {c.id} ·{" "}
              {c.checks
                ? Math.round((c.successful / c.checks) * 100) + "%"
                : "No checks"}{" "}
              · {c.status}
            </p>
          ))}
        </article>
        <article className="hub-panel">
          <h3>API usage · last 30 days</h3>
          {a.updates.map((u) => (
            <p key={u.source_key}>
              {u.source_key} · {u.requests} requests · {u.failures} failures
            </p>
          ))}
          <p>
            Cost depends on provider billing units. See setup guide for budgets.
          </p>
        </article>
        <article className="hub-panel">
          <h3>Notification delivery</h3>
          {data.notifications?.map((n) => (
            <p key={n.id}>
              {n.subject} · <strong>{n.status}</strong>
              {n.last_error && <small>{n.last_error}</small>}
            </p>
          ))}
        </article>
      </div>
      <h3>Post-trip review moderation</h3>
      {data.reviews?.map((r) => (
        <article key={r.id} className="hub-panel">
          <strong>
            {r.rating}/5 · {r.status}
          </strong>
          <p>{r.body}</p>
          <button
            onClick={() =>
              void action({
                action: "review",
                id: r.id,
                status: "approved",
              }).catch(() => {})
            }
          >
            Publish
          </button>
          <button
            onClick={() =>
              void action({
                action: "review",
                id: r.id,
                status: "hidden",
              }).catch(() => {})
            }
          >
            Hide
          </button>
        </article>
      ))}
    </>
  );
}
