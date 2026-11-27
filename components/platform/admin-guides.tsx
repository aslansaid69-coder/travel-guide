"use client";
import { useState } from "react";
import { Shell, useResource, Button, Field, Status, Money } from "./shared";
import type { Guide } from "@/lib/platform/types";
import type { GuideCandidate, GuidesAdminView } from "./view-types";
type GuideDraft = Omit<
  Guide,
  "languages" | "specialties" | "rateType" | "currency" | "status"
> & {
  languages: string[];
  specialties: string[];
  rateType: string;
  currency: string;
  status: string;
};
const empty: GuideDraft = {
  id: "",
  name: "",
  email: "",
  phone: "",
  photo: "",
  bio: "",
  bioRu: "",
  languages: ["en"],
  specialties: ["history"],
  areas: ["Almaty"],
  certifications: [],
  rateType: "tour",
  rateMinor: 0,
  currency: "KZT",
  commissionPercent: 20,
  country: "KZ",
  status: "draft",
};
export function GuidesAdmin() {
  const s = useResource<GuidesAdminView>("admin/guides"),
    [edit, setEdit] = useState<GuideDraft | null>(null),
    [requestId, setRequestId] = useState(""),
    [matches, setMatches] = useState<GuideCandidate[]>([]);
  const owner = s.data?.staff?.role === "owner";
  return (
    <Shell
      title="The people behind the journey."
      kicker="TRAVEL DESK · GUIDES"
      intro="Invite local talent, keep calendars clear and match each traveller with the right person."
      admin
    >
      <Status message={s.message} busy={s.busy} />
      <div className="platform-two">
        <section className="platform-card">
          <h2>Find a good match.</h2>
          <Field label="Booking request">
            <select
              value={requestId}
              onChange={(e) => {
                setRequestId(e.target.value);
                setMatches([]);
              }}
            >
              <option value="">Choose a request</option>
              {s.data?.requests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.date} · {r.name} · {r.currency} · {r.status}
                </option>
              ))}
            </select>
          </Field>
          <div className="platform-actions platform-detail">
            <Button
              busy={s.busy}
              disabled={!requestId}
              onClick={async () => {
                const r = await s.run({ action: "candidates", requestId });
                setMatches((r?.guides as GuideCandidate[] | undefined) || []);
              }}
            >
              Suggest available guides
            </Button>
            <Button
              primary
              busy={s.busy}
              disabled={!requestId}
              onClick={() => void s.run({ action: "offer", requestId })}
            >
              Offer to best match
            </Button>
          </div>
          <p className="platform-muted">
            Matching considers language, interests, calendar, rating and rate.
            An invited guide must accept the terms. Currency must match the
            booking. Fee allocations must fit the final package price.
          </p>
          {matches.map((g) => (
            <div className="platform-evidence" key={g.id}>
              <strong>
                {g.name} · score {g.score.toFixed(0)}
              </strong>
              <p>
                {g.languages.join(" · ")} · fee{" "}
                <Money amount={g.feeMinor} currency={g.currency} />
              </p>
              <Button
                busy={s.busy}
                onClick={() =>
                  void s.run({ action: "offer", requestId, guideId: g.id })
                }
              >
                Offer this trip
              </Button>
            </div>
          ))}
        </section>
        <section className="platform-card">
          <h2>Your local team</h2>
          {owner && (
            <Button
              primary
              onClick={() =>
                setEdit({ ...empty, id: "guide-" + Date.now().toString(36) })
              }
            >
              Add a guide
            </Button>
          )}
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Guide leaderboard</th>
                  <th>Trips / rating</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {s.data?.guides.map((g) => (
                  <tr key={g.id}>
                    <td>
                      {g.data.name}
                      <p>{g.data.languages.join(" · ")}</p>
                    </td>
                    <td>
                      {g.tours} completed · {Number(g.rating).toFixed(1)}/5
                    </td>
                    <td>
                      {g.status}
                      {!g.user_id && " · invitation needed"}
                    </td>
                    <td>
                      {owner && (
                        <div className="platform-actions">
                          <Button
                            onClick={() =>
                              setEdit({ ...g.data, status: g.status })
                            }
                          >
                            Edit
                          </Button>
                          <Button
                            busy={s.busy}
                            onClick={() =>
                              void s.run({ action: "invite", id: g.id })
                            }
                          >
                            Invite by email
                          </Button>
                          <Button
                            busy={s.busy}
                            onClick={() =>
                              void s.run({
                                action: "save",
                                guide: {
                                  ...g.data,
                                  status:
                                    g.status === "active" ? "paused" : "active",
                                },
                              })
                            }
                          >
                            {g.status === "active" ? "Pause" : "Activate"}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.data && !s.data.guides.length && (
            <p>
              Add the first real guide. No fictional profiles are published.
            </p>
          )}
        </section>
      </div>
      {edit && (
        <section className="platform-card platform-detail">
          <div className="platform-panel-title">
            <h2>{edit.name || "New guide profile"}</h2>
            <Button onClick={() => setEdit(null)}>Close editor</Button>
          </div>
          <form
            className="platform-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await s.run({ action: "save", guide: edit });
              if (r) setEdit(null);
            }}
          >
            <div className="platform-form-row">
              {(
                [
                  ["id", "Profile ID"],
                  ["name", "Full name"],
                  ["email", "Invitation email"],
                  ["phone", "Private phone"],
                  ["photo", "Licensed photo URL"],
                  ["country", "Actual country (ISO, e.g. KZ)"],
                ] as const
              ).map(([key, label]) => (
                <Field label={label} key={key}>
                  <input
                    required={key !== "phone" && key !== "photo"}
                    type={key === "email" ? "email" : "text"}
                    value={edit[key]}
                    onChange={(e) =>
                      setEdit({ ...edit, [key]: e.target.value })
                    }
                  />
                </Field>
              ))}
            </div>
            <div className="platform-form-row">
              <Field label="English biography">
                <textarea
                  value={edit.bio}
                  onChange={(e) => setEdit({ ...edit, bio: e.target.value })}
                />
              </Field>
              <Field label="Russian biography">
                <textarea
                  value={edit.bioRu}
                  onChange={(e) => setEdit({ ...edit, bioRu: e.target.value })}
                />
              </Field>
            </div>
            <fieldset>
              <legend>Languages</legend>
              <div className="platform-actions">
                {["en", "ru", "kk", "zh", "de", "fr", "tr", "es"].map((v) => (
                  <Button
                    type="button"
                    key={v}
                    aria-pressed={edit.languages.includes(v)}
                    onClick={() =>
                      setEdit({
                        ...edit,
                        languages: edit.languages.includes(v)
                          ? edit.languages.filter((x) => x !== v)
                          : [...edit.languages, v],
                      })
                    }
                  >
                    {v.toUpperCase()}
                  </Button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Specialties</legend>
              <div className="platform-actions">
                {[
                  "hiking",
                  "history",
                  "food",
                  "photography",
                  "family",
                  "vip",
                ].map((v) => (
                  <Button
                    type="button"
                    key={v}
                    aria-pressed={edit.specialties.includes(v)}
                    onClick={() =>
                      setEdit({
                        ...edit,
                        specialties: edit.specialties.includes(v)
                          ? edit.specialties.filter((x) => x !== v)
                          : [...edit.specialties, v],
                      })
                    }
                  >
                    {v}
                  </Button>
                ))}
              </div>
            </fieldset>
            <div className="platform-form-row">
              <Field label="Service areas (comma separated)">
                <input
                  value={edit.areas.join(", ")}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      areas: e.target.value.split(",").map((s) => s.trim()),
                    })
                  }
                />
              </Field>
              <Field label="Certifications / licences (comma separated)">
                <input
                  value={edit.certifications.join(", ")}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      certifications: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
              <Field label="Rate in major currency units">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={edit.rateMinor / 100}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      rateMinor: Math.round(Number(e.target.value) * 100),
                    })
                  }
                />
              </Field>
              <Field label="Rate basis">
                <select
                  value={edit.rateType}
                  onChange={(e) =>
                    setEdit({ ...edit, rateType: e.target.value })
                  }
                >
                  <option value="tour">Per tour</option>
                  <option value="hour">Per hour of planned stops</option>
                </select>
              </Field>
              <Field label="Currency">
                <select
                  value={edit.currency}
                  onChange={(e) =>
                    setEdit({ ...edit, currency: e.target.value })
                  }
                >
                  {["KZT", "USD", "EUR", "RUB", "GBP"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Platform commission (%)">
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="0.1"
                  value={edit.commissionPercent}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      commissionPercent: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Profile status">
                <select
                  value={edit.status}
                  onChange={(e) => setEdit({ ...edit, status: e.target.value })}
                >
                  {["draft", "active", "paused", "removed"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Button primary busy={s.busy}>
              Save guide
            </Button>
          </form>
        </section>
      )}
      <section className="platform-card platform-detail">
        <h2>Guide calendars</h2>
        <form
          className="platform-form-row"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void s.run({
              action: "calendar",
              id: f.get("guide"),
              start: new Date(String(f.get("start"))).toISOString(),
              end: new Date(String(f.get("end"))).toISOString(),
              blocked: f.get("blocked") === "on",
            });
          }}
        >
          <Field label="Guide">
            <select name="guide" required>
              <option value="">Choose</option>
              {s.data?.guides.map((g) => (
                <option value={g.id} key={g.id}>
                  {g.data.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start (device local time)">
            <input type="datetime-local" name="start" required />
          </Field>
          <Field label="End">
            <input type="datetime-local" name="end" required />
          </Field>
          <label className="platform-check">
            <input type="checkbox" name="blocked" />
            Block this window
          </label>
          <Button busy={s.busy}>Add calendar window</Button>
        </form>
        <details className="platform-detail">
          <summary>All availability windows</summary>
          {s.data?.calendar.map((c) => (
            <p key={c.id}>
              {s.data?.guides.find((g) => g.id === c.guide_id)?.data.name} ·{" "}
              {c.blocked ? "Blocked" : "Available"} ·{" "}
              {new Date(c.starts_at).toLocaleString()} —{" "}
              {new Date(c.ends_at).toLocaleString()}
            </p>
          ))}
        </details>
      </section>
      <section className="platform-card platform-detail">
        <h2>Workload & completion approvals</h2>
        <div className="platform-table-wrap">
          <table className="platform-table">
            <thead>
              <tr>
                <th>Trip</th>
                <th>Guide</th>
                <th>Window</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {s.data?.assignments.map((a) => (
                <tr key={a.id}>
                  <td>
                    <a href={`/tour/${a.request_id}`}>{a.client}</a>
                  </td>
                  <td>
                    {s.data?.guides.find((g) => g.id === a.guide_id)?.data.name}
                  </td>
                  <td>
                    {new Date(a.starts_at).toLocaleString()} —{" "}
                    {new Date(a.ends_at).toLocaleString()}
                  </td>
                  <td>{a.status}</td>
                  <td>
                    {["offered", "accepted"].includes(a.status) && (
                      <Button
                        busy={s.busy}
                        onClick={() => {
                          if (
                            confirm(
                              "Remove this assignment and offer the trip to the next available guide?",
                            )
                          )
                            void s.run({ action: "reassign", id: a.id });
                        }}
                      >
                        Reassign guide
                      </Button>
                    )}
                    {a.status === "completion_requested" && (
                      <Button
                        busy={s.busy}
                        onClick={() => {
                          if (
                            confirm(
                              "Approve actual completion? Eligible earnings can be transferred after the payout delay.",
                            )
                          )
                            void s.run({ action: "complete", id: a.id });
                        }}
                      >
                        Approve completion
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="platform-card platform-detail">
        <h2>Reviews & follow-up proposals</h2>
        {s.data?.reviews.map((r) => (
          <div key={r.id} className="platform-evidence">
            <p>
              {r.guide} · {r.rating}/5 · {r.status}
            </p>
            <p>{r.body}</p>
            <div className="platform-actions">
              <Button
                onClick={() =>
                  void s.run({ action: "review", id: r.id, status: "approved" })
                }
              >
                Publish review
              </Button>
              <Button
                onClick={() =>
                  void s.run({ action: "review", id: r.id, status: "hidden" })
                }
              >
                Hide
              </Button>
            </div>
          </div>
        ))}
        {s.data?.followups.map((f) => (
          <article key={f.id} className="platform-evidence">
            <h3>
              {f.data.plan.title} · {f.status}
            </h3>
            <p className="platform-muted">
              Review dates, service slot IDs, guide allocation and inclusions.
              The traveller accepts this exact quote and cancellation policy
              before checkout.
            </p>
            <form
              className="platform-form"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  const form = new FormData(e.currentTarget),
                    plan = JSON.parse(String(form.get("plan")));
                  plan.startDate = String(form.get("date"));
                  void s.run({
                    action: "followup",
                    id: f.id,
                    approved: true,
                    offer: {
                      plan,
                      amountMinor: Math.round(Number(form.get("amount")) * 100),
                      currency: form.get("currency"),
                      depositPercent: Number(form.get("deposit")),
                      terms: form.get("terms"),
                    },
                  });
                } catch {
                  s.setMessage("Use valid itinerary JSON.");
                }
              }}
            >
              <div className="platform-form-row">
                <Field label="New start date">
                  <input
                    name="date"
                    type="date"
                    required
                    defaultValue={f.data.plan.startDate}
                  />
                </Field>
                <Field label="Final package total (major units)">
                  <input
                    name="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    defaultValue={
                      f.data.quote ? f.data.quote.amountMinor / 100 : ""
                    }
                  />
                </Field>
                <Field label="Settlement currency">
                  <select
                    name="currency"
                    defaultValue={
                      f.data.quote?.currency ||
                      s.data?.guides.find((g) => g.id === f.guide_id)?.data
                        .currency ||
                      "KZT"
                    }
                  >
                    {["KZT", "USD", "EUR", "RUB", "GBP"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Deposit (%)">
                  <input
                    name="deposit"
                    type="number"
                    min="1"
                    max="100"
                    defaultValue={f.data.quote?.depositPercent || 30}
                    required
                  />
                </Field>
              </div>
              <Field label="Itinerary JSON · choose valid new service slots where needed">
                <textarea
                  name="plan"
                  className="platform-code"
                  rows={10}
                  defaultValue={JSON.stringify(f.data.plan, null, 2)}
                  required
                />
              </Field>
              <Field label="Confirmed inclusions and quote terms">
                <textarea
                  name="terms"
                  minLength={10}
                  maxLength={5000}
                  required
                  defaultValue={f.data.quote?.terms || ""}
                />
              </Field>
              <div className="platform-actions">
                <Button primary busy={s.busy}>
                  Publish final follow-up offer
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    void s.run({
                      action: "followup",
                      id: f.id,
                      approved: false,
                    })
                  }
                >
                  Hide proposal
                </Button>
              </div>
            </form>
          </article>
        ))}
      </section>
    </Shell>
  );
}
