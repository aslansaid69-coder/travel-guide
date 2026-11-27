"use client";
import { useState, useTransition } from "react";
import { generateDescription, savePlace } from "@/app/admin/places/actions";
import { itemSchema, type CatalogItem } from "@/lib/hub/types";
import { SubmitButton } from "./confirm";

const CATEGORIES = itemSchema.shape.category.options;
const toTenge = (minor?: number) => (minor === undefined ? "" : String(minor / 100));

export function PlaceEditor({
  item,
  photosText,
  canWrite,
  aiConfigured,
}: {
  item: CatalogItem;
  photosText: string;
  canWrite: boolean;
  aiConfigured: boolean;
}) {
  const [text, setText] = useState({
    description: item.description,
    descriptionRu: item.descriptionRu,
    descriptionKk: item.descriptionKk,
    nameRu: item.nameRu,
    nameKk: item.nameKk,
  });
  const [notes, setNotes] = useState("");
  const [aiError, setAiError] = useState("");
  const [priceStatus, setPriceStatus] = useState(item.priceStatus);
  const [generating, start] = useTransition();
  const set = (k: keyof typeof text) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setText((t) => ({ ...t, [k]: e.target.value }));

  return (
    <form action={savePlace} className="admin-card admin-form">
      <input type="hidden" name="id" value={item.id} />
      <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 12 }}>
        <h2>Basics</h2>
        <div className="admin-row">
          <label>
            Name (EN)
            <input name="name" defaultValue={item.name} required maxLength={180} />
          </label>
          <label>
            Name (RU)
            <input name="nameRu" value={text.nameRu} onChange={set("nameRu")} maxLength={180} />
          </label>
          <label>
            Name (KZ)
            <input name="nameKk" value={text.nameKk} onChange={set("nameKk")} maxLength={180} />
          </label>
        </div>
        <div className="admin-row">
          <label>
            URL slug <small>lowercase-with-hyphens</small>
            <input name="slug" defaultValue={item.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={120} />
          </label>
          <label>
            Category
            <select name="category" defaultValue={item.category}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={item.status}>
              <option value="pending">Draft</option>
              <option value="approved">Published</option>
              <option value="hidden">Hidden</option>
            </select>
          </label>
        </div>
        <div className="admin-row">
          <label>
            Region
            <input name="region" defaultValue={item.region} maxLength={120} placeholder="Almaty / Almaty Region" />
          </label>
          <label>
            City
            <input name="city" defaultValue={item.city} maxLength={120} />
          </label>
          <label>
            Visit length (minutes)
            <input name="duration" type="number" min={15} max={1440} step={5} defaultValue={item.duration} required />
          </label>
        </div>
        <label>
          Address <small>{item.googlePlaceId ? "Optional own wording; Google’s address is shown live." : ""}</small>
          <input name="address" defaultValue={item.address} maxLength={500} />
        </label>
        <div className="admin-row">
          <label>
            Latitude
            <input name="lat" type="number" step="any" min={-90} max={90} defaultValue={item.lat} required />
          </label>
          <label>
            Longitude
            <input name="lng" type="number" step="any" min={-180} max={180} defaultValue={item.lng} required />
          </label>
        </div>

        <h2>Description</h2>
        <label>
          Notes for the AI <small>Facts only: what it is, why visit, tips. Never Google text.</small>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1500} />
        </label>
        <div className="admin-actions">
          <button
            type="button"
            className="admin-button"
            disabled={!aiConfigured || generating}
            title={aiConfigured ? "" : "Set ANTHROPIC_API_KEY to enable"}
            onClick={() => {
              setAiError("");
              start(async () => {
                const r = await generateDescription(item.id, notes);
                if (!r.ok) return setAiError(r.error);
                setText((t) => ({
                  description: r.data.en,
                  descriptionRu: r.data.ru,
                  descriptionKk: r.data.kk,
                  nameRu: t.nameRu || r.data.nameRu,
                  nameKk: t.nameKk || r.data.nameKk,
                }));
              });
            }}
          >
            {generating ? "Writing…" : "✨ Generate description (EN/RU/KZ)"}
          </button>
          {!aiConfigured && <span className="admin-muted">AI is off: ANTHROPIC_API_KEY is not set.</span>}
        </div>
        {aiError && (
          <p className="admin-notice" data-tone="bad" role="alert">
            {aiError}
          </p>
        )}
        <label>
          English
          <textarea name="description" rows={5} value={text.description} onChange={set("description")} maxLength={1800} />
        </label>
        <label>
          Русский
          <textarea name="descriptionRu" rows={5} value={text.descriptionRu} onChange={set("descriptionRu")} maxLength={1800} />
        </label>
        <label>
          Қазақша
          <textarea name="descriptionKk" rows={5} value={text.descriptionKk} onChange={set("descriptionKk")} maxLength={1800} />
        </label>

        <h2>Visiting</h2>
        <label>
          Opening hours <small>{item.googlePlaceId ? "Optional; Google hours are shown live." : "e.g. Daily 10:00–22:00"}</small>
          <input name="hours" defaultValue={item.hours} maxLength={400} />
        </label>
        <div className="admin-row">
          <label>
            Season
            <input name="season" defaultValue={item.season} maxLength={250} />
          </label>
          <label>
            Website
            <input name="website" type="url" defaultValue={item.website} maxLength={800} />
          </label>
          <label>
            Phone
            <input name="phone" defaultValue={item.phone} maxLength={100} />
          </label>
        </div>
        <label>
          Getting there
          <textarea name="transport" rows={2} defaultValue={item.transport} maxLength={1000} />
        </label>
        <div className="admin-actions">
          <label className="admin-check">
            <input type="checkbox" name="outdoor" defaultChecked={item.outdoor} /> Mostly outdoors
          </label>
          <label className="admin-check">
            <input type="checkbox" name="bookable" defaultChecked={item.bookable} /> Bookable service
          </label>
        </div>

        <h2>Entry price</h2>
        <label>
          Price status
          <select name="priceStatus" value={priceStatus} onChange={(e) => setPriceStatus(e.target.value as typeof priceStatus)}>
            <option value="found">Price found (with source)</option>
            <option value="not_found">Price not found — I will fill it in</option>
            <option value="unknown">Not researched yet</option>
          </select>
        </label>
        <div className="admin-row" hidden={priceStatus !== "found"}>
          <label>
            Type
            <select name="priceType" defaultValue={item.price?.type || "per-person"}>
              <option value="free">Free</option>
              <option value="per-person">Per person</option>
              <option value="range">Range per person</option>
              <option value="fixed">Fixed</option>
              <option value="per-group">Per group</option>
            </select>
          </label>
          <label>
            Min (adult)
            <input name="priceMin" type="number" min={0} step="any" defaultValue={toTenge(item.price?.min)} />
          </label>
          <label>
            Max (adult)
            <input name="priceMax" type="number" min={0} step="any" defaultValue={toTenge(item.price?.max)} />
          </label>
          <label>
            Child
            <input name="priceChild" type="number" min={0} step="any" defaultValue={toTenge(item.price?.child)} />
          </label>
          <label>
            Currency
            <select name="priceCurrency" defaultValue={item.price?.currency || "KZT"}>
              {["KZT", "USD", "EUR", "RUB", "GBP"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Confidence
            <select name="priceSource" defaultValue={item.price?.source || "owner-confirmed"}>
              <option value="owner-confirmed">Confirmed (official)</option>
              <option value="auto-detected">Found online</option>
              <option value="estimated">Estimate / unofficial</option>
            </select>
          </label>
        </div>
        <div className="admin-row" hidden={priceStatus !== "found"}>
          <label>
            Source URL
            <input name="priceSourceUrl" type="url" defaultValue={item.price?.sourceUrl} maxLength={800} />
          </label>
          <label>
            Checked on
            <input name="priceCheckedAt" type="date" defaultValue={item.price?.checkedAt} />
          </label>
        </div>
        <label hidden={priceStatus !== "found"}>
          Price note
          <input name="priceNote" defaultValue={item.price?.note} maxLength={300} />
        </label>

        <h2>Photos</h2>
        <label>
          One per line: <code>URL | alt text | author | licence | source page</code>
          <textarea name="photos" rows={5} defaultValue={photosText} spellCheck={false} />
          <small>Use only photos you own or that are openly licensed (e.g. Wikimedia Commons). The first photo is the cover.</small>
        </label>
        {canWrite && (
          <div className="admin-actions">
            <SubmitButton>Save place</SubmitButton>
          </div>
        )}
      </fieldset>
    </form>
  );
}
