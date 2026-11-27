"use client";
import { useState } from "react";
import {
  Shell,
  useResource,
  Button,
  Field,
  Status,
  Empty,
  platform,
} from "./shared";
import type {
  GoogleLiveResult,
  ResearchDraftRow,
  ResearchResult,
  ResearchView,
} from "./view-types";
import type { ResearchDraft } from "@/lib/platform/types";
export function ResearchDesk() {
  const s = useResource<ResearchView>("admin/research"),
    [query, setQuery] = useState(""),
    [bulk, setBulk] = useState(false),
    [category, setCategory] = useState("activity"),
    [selected, setSelected] = useState<ResearchDraftRow | null>(null),
    [edit, setEdit] = useState(""),
    [result, setResult] = useState<ResearchResult | null>(null),
    [priceURL, setPriceURL] = useState(""),
    [confirmPrice, setConfirmPrice] = useState(false),
    [google, setGoogle] = useState<GoogleLiveResult | null>(null);
  const select = (row: ResearchDraftRow) => {
    setSelected(row);
    setEdit(
      JSON.stringify(
        {
          ...row.data.item,
          price: row.data.price || row.data.item.price || null,
        },
        null,
        2,
      ),
    );
    setConfirmPrice(false);
  };
  return (
    <Shell
      title="A curious local’s research desk."
      kicker="OWNER · RESEARCH & PRICES"
      intro="Search independent, attributed sources. Review every field and keep unknown details blank until verified. Published prices change only after your approval."
      admin
    >
      <Status message={s.message} busy={s.busy} />
      <div className="platform-two">
        <section className="platform-card">
          <h2>Find something worth sharing.</h2>
          <form
            className="platform-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setResult(
                (await s.run({
                  action: "search",
                  query,
                  bulk,
                  category,
                })) as ResearchResult | null,
              );
            }}
          >
            <Field label="Place name, category + area, or named Google Maps URL">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Viewpoints near Almaty"
                required
                maxLength={500}
              />
            </Field>
            <Field label="Draft category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {[
                  "activity",
                  "viewpoint",
                  "museum",
                  "restaurant",
                  "cafe",
                  "park",
                  "shop",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <label className="platform-check">
              <input
                type="checkbox"
                checked={bulk}
                onChange={(e) => setBulk(e.target.checked)}
              />
              Bulk discovery · up to 30 results within 20 km of central Almaty
              (fallback coverage is reported)
            </label>
            <div className="platform-actions">
              <Button primary busy={s.busy}>
                Search & create drafts
              </Button>
              <Button
                type="button"
                busy={s.busy}
                onClick={async () => {
                  try {
                    setGoogle(
                      await platform<GoogleLiveResult>("admin/research", {
                        action: "google",
                        query,
                      }),
                    );
                  } catch (e) {
                    s.setMessage((e as Error).message);
                  }
                }}
              >
                Live Google reference
              </Button>
            </div>
          </form>
          {result && (
            <>
              <p>{result.drafts?.length || 0} draft(s) created.</p>
              {result.warnings?.map((w: string) => (
                <p className="platform-warning" key={w}>
                  {w}
                </p>
              ))}
              {result.links?.map((l) => (
                <p key={l.url}>
                  <a href={l.url} target="_blank" rel="noreferrer">
                    {l.title} ↗
                  </a>
                </p>
              ))}
            </>
          )}
          {google && (
            <div className="platform-detail">
              <img
                src="https://maps.gstatic.com/mapfiles/api-3/images/google_white5_hdpi.png"
                width="100"
                alt="Google Maps"
                style={{ background: "#1F3A4D", padding: 8 }}
              />
              <p className="platform-muted">
                Live reference only. Google content is not copied to the
                permanent catalog or used to generate descriptions.
              </p>
              {google.places.map((p) => (
                <div className="platform-evidence" key={p.id}>
                  <strong>{p.displayName?.text}</strong>
                  <p>
                    {p.formattedAddress} · {p.rating || "Unrated"} ·{" "}
                    {p.businessStatus}
                  </p>
                  <p>
                    {p.regularOpeningHours?.weekdayDescriptions?.join("; ")}
                  </p>
                  <a href={p.googleMapsUri} target="_blank" rel="noreferrer">
                    View on Google Maps ↗
                  </a>
                  {p.attributions?.map((a, i) => (
                    <p key={i}>
                      <a href={a.providerUri}>{a.provider}</a>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="platform-card">
          <h2>Source permissions</h2>
          <p className="platform-muted">
            The official price finder checks only approved hosts, respects
            robots rules and extracts structured offers. Record your permission
            or source licence before enabling a host.
          </p>
          <form
            className="platform-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void s.run({
                action: "source",
                host: f.get("host"),
                note: f.get("note"),
              });
            }}
          >
            <Field label="Permitted source host">
              <input
                name="host"
                placeholder="official-venue.kz"
                required
                pattern="[a-z0-9.-]+"
              />
            </Field>
            <Field label="Permission / licence note">
              <textarea name="note" required maxLength={1000} />
            </Field>
            <Button busy={s.busy}>Add source</Button>
          </form>
          {s.data?.sources.map((x) => (
            <p key={x.host}>
              <strong>{x.host}</strong> · {x.note}
            </p>
          ))}
        </section>
      </div>
      <section className="platform-card platform-detail">
        <h2>Drafts awaiting your eye</h2>
        <div className="platform-actions">
          {s.data?.drafts
            .filter((r) => r.status === "pending")
            .map((r) => (
              <Button
                key={r.id}
                aria-pressed={selected?.id === r.id}
                onClick={() => select(r)}
              >
                {r.data.item.name || r.data.query}
              </Button>
            ))}
        </div>
        {s.data && !s.data.drafts.some((d) => d.status === "pending") && (
          <Empty>
            Search above to create a draft. Unavailable sources never create
            invented listings.
          </Empty>
        )}
      </section>
      {selected && (
        <div className="platform-two platform-detail">
          <section className="platform-card">
            <h2>Original evidence</h2>
            {selected.data.warnings.map((w: string) => (
              <p className="platform-warning" key={w}>
                {w}
              </p>
            ))}
            {Object.entries(selected.data.fields).map(([key, field]) => (
              <div className="platform-evidence" key={key}>
                <strong>
                  {key} · {Math.round(field.evidence.confidence * 100)}%
                  confidence
                </strong>
                <p>
                  {typeof field.value === "object"
                    ? JSON.stringify(field.value)
                    : String(field.value)}
                </p>
                <a href={field.evidence.url} target="_blank" rel="noreferrer">
                  {field.evidence.source} ↗
                </a>
                <p className="platform-muted">
                  {field.evidence.licence || "Owner review required"} ·{" "}
                  {field.evidence.checkedAt}
                </p>
              </div>
            ))}
          </section>
          <section className="platform-card">
            <h2>Review & publish</h2>
            <p className="platform-muted">
              Edit the structured draft. Coordinates and a valid name are
              required. Preserve source and image credit fields. Photos must be
              independently licensed.
            </p>
            <Field label="Editable catalog record (JSON)">
              <textarea
                className="platform-code"
                rows={26}
                value={edit}
                onChange={(e) => setEdit(e.target.value)}
              />
            </Field>
            <div className="platform-actions platform-detail">
              <Button
                busy={s.busy}
                onClick={async () => {
                  const r = (await s.run({
                    action: "translate",
                    id: selected.id,
                  })) as ResearchDraft | null;
                  if (r?.item) {
                    setSelected({ ...selected, data: r });
                    setEdit(
                      JSON.stringify({ ...r.item, price: r.price }, null, 2),
                    );
                  }
                }}
              >
                Draft Russian translation
              </Button>
            </div>
            <form
              className="platform-form platform-detail"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await s.run({
                  action: "prices",
                  url: priceURL,
                  draftId: selected.id,
                });
                const offers = (r as { offers?: { price: unknown }[] } | null)
                  ?.offers;
                if (offers?.[0]) {
                  try {
                    const item = JSON.parse(edit);
                    item.price = offers[0].price;
                    setEdit(JSON.stringify(item, null, 2));
                  } catch {
                    s.setMessage(
                      "The edited JSON is invalid; price not applied.",
                    );
                  }
                }
              }}
            >
              <Field label="Official permitted price page">
                <input
                  type="url"
                  value={priceURL}
                  onChange={(e) => setPriceURL(e.target.value)}
                  required
                />
              </Field>
              <Button busy={s.busy}>Find structured prices</Button>
            </form>
            <label className="platform-check platform-detail">
              <input
                type="checkbox"
                checked={confirmPrice}
                onChange={(e) => setConfirmPrice(e.target.checked)}
              />
              I independently verified this price and mark it owner-confirmed.
            </label>
            <div className="platform-actions platform-detail">
              <Button
                primary
                busy={s.busy}
                onClick={async () => {
                  try {
                    const r = await s.run({
                      action: "publish",
                      id: selected.id,
                      item: JSON.parse(edit),
                      confirmPrice,
                    });
                    if (r) setSelected(null);
                  } catch {
                    s.setMessage("Draft JSON is invalid.");
                  }
                }}
              >
                Publish reviewed place
              </Button>
              <Button
                busy={s.busy}
                onClick={async () => {
                  await s.run({ action: "hide", id: selected.id });
                  setSelected(null);
                }}
              >
                Hide draft
              </Button>
            </div>
          </section>
        </div>
      )}
      <section className="platform-card platform-detail">
        <h2>Official price candidates</h2>
        {s.data?.watches.map((w) => (
          <div className="platform-evidence" key={w.item_id}>
            <strong>
              {w.name} · {w.status}
            </strong>
            <p>
              {w.snapshot?.price
                ? `${w.snapshot.price.min / 100}–${w.snapshot.price.max / 100} ${w.snapshot.price.currency} · ${w.snapshot.price.type}`
                : "No structured price candidate"}
            </p>
            <p className="platform-muted">
              Checked {w.last_checked || "never"} · {w.last_error || ""}
            </p>
            <a href={w.url} target="_blank" rel="noreferrer">
              Official source ↗
            </a>
            {w.status === "review" && w.snapshot?.price && (
              <div className="platform-actions">
                <Button
                  busy={s.busy}
                  onClick={() =>
                    void s.run({
                      action: "review-price",
                      itemId: w.item_id,
                      confirmed: false,
                    })
                  }
                >
                  Apply as estimate
                </Button>
                <Button
                  busy={s.busy}
                  onClick={() => {
                    if (
                      confirm(
                        "I checked the official source, age basis, currency, taxes and inclusions and confirm this price.",
                      )
                    )
                      void s.run({
                        action: "review-price",
                        itemId: w.item_id,
                        confirmed: true,
                      });
                  }}
                >
                  Confirm verified price
                </Button>
              </div>
            )}
          </div>
        ))}
        <h2 className="platform-detail">Prices needing review</h2>
        <p>
          Unknown, estimated or more than 30 days old. Change published pricing
          in the catalog editor after verifying the source.
        </p>
        <div className="platform-table-wrap">
          <table className="platform-table">
            <thead>
              <tr>
                <th>Place</th>
                <th>Price status</th>
                <th>Last checked</th>
                <th>Watch an official price page</th>
              </tr>
            </thead>
            <tbody>
              {s.data?.prices.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.price?.source || "Unknown"}</td>
                  <td>{p.price?.updatedAt || "Never"}</td>
                  <td>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void s.run({
                          action: "prices",
                          url: f.get("url"),
                          itemId: p.id,
                        });
                      }}
                      className="platform-actions"
                    >
                      <input
                        name="url"
                        aria-label={`Official price page for ${p.name}`}
                        placeholder="https://approved-source/..."
                        type="url"
                        required
                      />
                      <Button busy={s.busy}>Check & watch</Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Shell>
  );
}
