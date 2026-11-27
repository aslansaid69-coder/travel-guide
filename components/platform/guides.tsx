"use client";
import { useEffect, useState } from "react";
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
import type { GuidesPublicView, GuideWorkspaceView } from "./view-types";
export function GuideMarketplace({
  id,
  initial,
}: {
  id?: string;
  initial?: GuidesPublicView;
}) {
  const s = useResource<GuidesPublicView>(
    "guides" + (id ? "/" + id : ""),
    undefined,
    true,
    initial,
  );
  return (
    <Shell
      title={
        id ? "Meet your local connection." : "Good company. Local knowledge."
      }
      kicker="ALMATY GUIDES"
      intro="Discover independent local guides, their languages and their interests. Request your preferred guide with your itinerary; availability and the final package are confirmed by the travel desk."
    >
      <Status message={s.message} />
      <div className="platform-grid">
        {s.data?.guides.map((g) => (
          <article className="platform-card" key={g.id}>
            {g.photo ? (
              <img
                src={g.photo}
                alt={g.name}
                className="platform-image"
                loading="lazy"
              />
            ) : (
              <p className="eyebrow">YOUR LOCAL CONNECTION</p>
            )}
            <h2>{g.name}</h2>
            <p>{g.bio}</p>
            <p>
              {g.languages.map((v: string) => v.toUpperCase()).join(" · ")}
              <br />
              {g.specialties.join(" · ")}
            </p>
            <p className="platform-muted">{g.areas.join(", ")}</p>
            {g.certifications.length > 0 && (
              <p className="platform-muted">
                Guide-provided credentials: {g.certifications.join("; ")}
              </p>
            )}
            <p>
              <Money amount={g.rateMinor} currency={g.currency} /> /{" "}
              {g.rateType === "hour" ? "hour" : "tour"}
            </p>
            <p>
              {g.rating
                ? `${g.rating.toFixed(1)} / 5 · ${g.reviewCount} verified trip review(s)`
                : "No published trip reviews yet."}
            </p>
            <div className="platform-actions">
              <a className="button button-accent" href={`/plan?guide=${g.id}`}>
                Request this guide
              </a>
              {!id && <a href={`/guides/${g.id}`}>Profile ↗</a>}
            </div>
          </article>
        ))}
      </div>
      {s.data && !s.data.guides.length && (
        <Empty>
          Our guide collection is being prepared. Send your itinerary to the
          travel desk and tell us your preferred language and interests.{" "}
          <a href="/plan">Plan your trip ↗</a>
        </Empty>
      )}
      {id && s.data && s.data.reviews.length > 0 && (
        <section className="platform-card platform-detail">
          <h2>Travellers’ stories</h2>
          {s.data.reviews.map((r, i) => (
            <blockquote key={i}>
              <p>
                {r.rating}/5 · {r.body}
              </p>
              <small>{new Date(r.created_at).toLocaleDateString()}</small>
            </blockquote>
          ))}
        </section>
      )}
    </Shell>
  );
}
export function GuideDashboard() {
  const s = useResource<GuideWorkspaceView>("guide"),
    [invite, setInvite] = useState(""),
    [terms, setTerms] = useState(false);
  useEffect(() => {
    const f = new URLSearchParams(location.hash.slice(1));
    const key =
      f.get("invite") || sessionStorage.getItem("almaty-guide-invite") || "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs browser-only state (URL, storage, clock) or an async fetch result after hydration
    setInvite(key);
    if (key) sessionStorage.setItem("almaty-guide-invite", key);
    if (f.has("invite")) history.replaceState(null, "", location.pathname);
  }, []);
  return (
    <Shell
      title="Your next Almaty story."
      kicker="GUIDE WORKSPACE"
      intro="Your offers, calendar, trips and earnings. Only accepted assignments provide access to a confirmed traveller’s private trip area."
    >
      <Status message={s.message} busy={s.busy} />
      {invite && (
        <section className="platform-card">
          <h2>Your guide invitation</h2>
          <p>Sign in with the invited email and verify it before accepting.</p>
          <a href="/auth/sign-in">Sign in ↗</a>
          <label className="platform-check">
            <input
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
            />
            I accept the <a href="/guide-terms">guide terms</a>.
          </label>
          <Button
            primary
            disabled={!terms}
            onClick={async () => {
              try {
                await platform("guide", {
                  action: "claim",
                  key: invite,
                  acceptTerms: true,
                });
                setInvite("");
                sessionStorage.removeItem("almaty-guide-invite");
                await s.load();
                s.setMessage("Invitation accepted.");
              } catch (e) {
                s.setMessage((e as Error).message);
              }
            }}
          >
            Accept invitation
          </Button>
        </section>
      )}
      {!s.data ? (
        <Empty>
          Sign in with your invited, verified guide account.{" "}
          <a href="/auth/sign-in">Sign in</a>
        </Empty>
      ) : (
        <>
          <div className="platform-two">
            <section className="platform-card">
              <h2>Hello, {s.data.guide.name}.</h2>
              <p>
                {s.data.guide.languages.join(" · ")} · {s.data.guide.status}
              </p>
              <p>
                <Money
                  amount={s.data.guide.rateMinor}
                  currency={s.data.guide.currency}
                />{" "}
                per {s.data.guide.rateType} · {s.data.guide.commissionPercent}%
                platform commission.
              </p>
              <div className="platform-actions">
                <Button
                  busy={s.busy}
                  onClick={() => void s.run({ action: "connect" })}
                >
                  Set up Stripe earnings
                </Button>
                <Button
                  busy={s.busy}
                  onClick={() => void s.run({ action: "connect-status" })}
                >
                  Check payout readiness
                </Button>
              </div>
              <p className="platform-muted">
                Transfers require an eligible Connect account, fully paid card
                funds, manager-approved completion and the owner’s payout delay.
                Status:{" "}
                {s.data.connect.ready
                  ? "ready"
                  : "onboarding / operator configuration required"}
                .
              </p>
            </section>
            <section className="platform-card">
              <h2>Make room for a good day.</h2>
              <form
                className="platform-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void s.run({
                    action: "calendar",
                    start: new Date(String(f.get("start"))).toISOString(),
                    end: new Date(String(f.get("end"))).toISOString(),
                    blocked: f.get("blocked") === "on",
                  });
                }}
              >
                <Field label="From (your device’s local time)">
                  <input name="start" type="datetime-local" required />
                </Field>
                <Field label="Until">
                  <input name="end" type="datetime-local" required />
                </Field>
                <label className="platform-check">
                  <input name="blocked" type="checkbox" />
                  Unavailable during this period
                </label>
                <Button busy={s.busy} type="submit">
                  Save calendar window
                </Button>
              </form>
              <details className="platform-detail">
                <summary>Your calendar windows</summary>
                {s.data.availability.map((w) => (
                  <p key={w.id}>
                    {w.blocked ? "Blocked" : "Available"} ·{" "}
                    {new Date(w.starts_at).toLocaleString()} —{" "}
                    {new Date(w.ends_at).toLocaleString()}
                  </p>
                ))}
              </details>
            </section>
          </div>
          <h2 className="platform-detail">Your tours</h2>
          <div className="platform-grid">
            {s.data.assignments.map((a) => (
              <article className="platform-card" key={a.id}>
                <span className="platform-badge">{a.status}</span>
                <h3 className="platform-detail">
                  {a.plan.title || "Tour offer"}
                </h3>
                <p>
                  {new Date(a.starts_at).toLocaleString()} —{" "}
                  {new Date(a.ends_at).toLocaleString()}
                </p>
                <p>
                  {a.plan.adults + a.plan.children} guests ·{" "}
                  {a.guest?.name || "Client details unlock after confirmation"}
                </p>
                <p>
                  Guide fee allocation:{" "}
                  <Money amount={a.fee_minor} currency={a.currency} />
                  <br />
                  Your share:{" "}
                  <Money
                    amount={Math.floor(
                      (a.fee_minor * (100 - Number(a.commission_percent))) /
                        100,
                    )}
                    currency={a.currency}
                  />
                </p>
                {a.status === "offered" && (
                  <>
                    <p className="platform-muted">
                      Respond before {new Date(a.expires_at).toLocaleString()}.
                    </p>
                    <div className="platform-actions">
                      <Button
                        primary
                        busy={s.busy}
                        onClick={() =>
                          void s.run({
                            action: "tour",
                            id: a.id,
                            state: "accept",
                          })
                        }
                      >
                        Accept
                      </Button>
                      <Button
                        busy={s.busy}
                        onClick={() =>
                          void s.run({
                            action: "tour",
                            id: a.id,
                            state: "decline",
                          })
                        }
                      >
                        Decline
                      </Button>
                    </div>
                  </>
                )}
                {[
                  "accepted",
                  "started",
                  "completion_requested",
                  "completed",
                ].includes(a.status) &&
                  ["confirmed", "completed"].includes(a.booking_status) && (
                    <p>
                      <a
                        className="button button-outline"
                        href={`/tour/${a.request_id}`}
                      >
                        Open itinerary, weather & chat ↗
                      </a>
                    </p>
                  )}
                {a.status === "accepted" && (
                  <Button
                    busy={s.busy}
                    onClick={() =>
                      void s.run({ action: "tour", id: a.id, state: "start" })
                    }
                  >
                    Start tour
                  </Button>
                )}
                {a.status === "started" && (
                  <Button
                    busy={s.busy}
                    onClick={() =>
                      void s.run({
                        action: "tour",
                        id: a.id,
                        state: "complete",
                      })
                    }
                  >
                    Request completion approval
                  </Button>
                )}
              </article>
            ))}
          </div>
          {!s.data.assignments.length && (
            <Empty>
              Your first offer will appear here when the travel desk finds a
              matching trip.
            </Empty>
          )}
          <section className="platform-card platform-detail">
            <h2>Earnings ledger</h2>
            {s.data.transfers.length ? (
              s.data.transfers.map((t) => (
                <p key={t.id}>
                  <Money amount={t.amount_minor} currency={t.currency} /> ·{" "}
                  {t.status}
                  {Number(t.reversed_minor) > 0 && (
                    <>
                      {" "}
                      · reversed{" "}
                      <Money amount={t.reversed_minor} currency={t.currency} />
                    </>
                  )}
                </p>
              ))
            ) : (
              <p>No transfers have been recorded.</p>
            )}
          </section>
        </>
      )}
    </Shell>
  );
}
