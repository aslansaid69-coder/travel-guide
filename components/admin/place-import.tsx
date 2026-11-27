"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importPlace, searchPlaces } from "@/app/admin/places/actions";
import type { PlaceSearchResult, ProviderId } from "@/lib/places/types";

type ProviderInfo = { id: ProviderId; label: string; policy: string };

export function PlaceImport({ providers, initial }: { providers: ProviderInfo[]; initial: ProviderId }) {
  const router = useRouter();
  const [provider, setProvider] = useState<ProviderId>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[] | null>(null);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState("");
  const [pending, start] = useTransition();
  const current = providers.find((p) => p.id === provider);

  return (
    <>
      <form
        className="admin-card admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          start(async () => {
            const r = await searchPlaces({ query, provider });
            if (r.ok) setResults(r.data);
            else setError(r.error);
          });
        }}
      >
        <div className="admin-row">
          <label>
            Search
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Kok Tobe, Central State Museum, Kolsai lakes"
              required
              minLength={2}
              maxLength={120}
              autoFocus
            />
          </label>
          <label>
            Source
            <select value={provider} onChange={(e) => setProvider(e.target.value as ProviderId)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {current && <p className="admin-muted">{current.policy}</p>}
        <div className="admin-actions">
          <button className="admin-button" data-variant="primary" disabled={pending}>
            {pending && !importing ? "Searching…" : "Search"}
          </button>
        </div>
      </form>
      {error && (
        <p className="admin-notice" data-tone="bad" role="alert">
          {error}
        </p>
      )}
      {results && (
        <section className="admin-card" aria-live="polite">
          <h2>{results.length ? `${results.length} results` : "No results"}</h2>
          <div className="admin-results">
            {results.map((r) => (
              <article className="admin-result" key={`${r.provider}:${r.externalId}`}>
                {r.photoUrl ? <img src={r.photoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <img alt="" />}
                <div>
                  <strong>{r.name}</strong>
                  <p className="admin-muted">
                    {r.address || "—"}
                    {r.rating !== null && ` · ★ ${r.rating.toFixed(1)}${r.ratingCount ? ` (${r.ratingCount})` : ""}`}
                    {" · "}
                    {r.category}
                  </p>
                  <p className="admin-muted">
                    {r.provider === "google" ? "Google Maps" : r.provider === "opentripmap" ? "OpenTripMap / © OpenStreetMap" : "Wikipedia"}
                    {r.photoAttribution && (
                      <>
                        {" · Photo: "}
                        {r.photoAttributionUrl ? (
                          <a href={r.photoAttributionUrl} target="_blank" rel="noreferrer">
                            {r.photoAttribution}
                          </a>
                        ) : (
                          r.photoAttribution
                        )}
                      </>
                    )}
                    {r.mapsUrl && (
                      <>
                        {" · "}
                        <a href={r.mapsUrl} target="_blank" rel="noreferrer">
                          Open source ↗
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <div className="admin-actions">
                  {r.existingId ? (
                    <a className="admin-button" href={`/admin/places/${encodeURIComponent(r.existingId)}`}>
                      Already imported →
                    </a>
                  ) : (
                    <button
                      className="admin-button"
                      data-variant="primary"
                      disabled={pending}
                      onClick={() => {
                        setImporting(r.externalId);
                        setError("");
                        start(async () => {
                          const res = await importPlace({ provider: r.provider, externalId: r.externalId });
                          if (res.ok) router.push(`/admin/places/${encodeURIComponent(res.data.id)}?notice=Imported%20as%20a%20draft.`);
                          else {
                            setError(res.error);
                            setImporting("");
                          }
                        });
                      }}
                    >
                      {importing === r.externalId ? "Importing…" : "Import"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {provider === "google" && (
            <p className="admin-muted">
              Results and photos © Google. Only the place ID and coordinates (refreshed every 30 days) are stored; address, hours and
              photos are shown live with attribution.
            </p>
          )}
        </section>
      )}
    </>
  );
}
