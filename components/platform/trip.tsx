"use client";
import { useState } from "react";
import {
  MessageCircle,
  MapPin,
  ShieldCheck,
  Download,
  PhoneCall,
} from "lucide-react";
import { TravelMap } from "@/components/hub/map";
import {
  Shell,
  usePrivate,
  useResource,
  Button,
  Field,
  Status,
  Empty,
  PrivatePhoto,
  downloadPrivate,
  platform,
} from "./shared";
export function TripRoom({ id }: { id: string }) {
  const access = usePrivate(),
    s = useResource(`trip/${id}`, access.key, access.ready),
    [body, setBody] = useState(""),
    [location, setLocation] = useState(false),
    [latitude, setLatitude] = useState(""),
    [longitude, setLongitude] = useState(""),
    [translations, setTranslations] = useState<Record<string, string>>({}),
    [translationConsent, setTranslationConsent] = useState(false),
    [day, setDay] = useState(0);
  const d = s.data;
  return (
    <Shell
      title="Your own little travel desk."
      kicker="PRIVATE TRIP SPACE"
      intro="Your itinerary, your guide and your travel team, together in one place. Keep this private link secure."
    >
      <Status message={s.message} busy={s.busy} />
      {!d ? (
        <Empty>
          Open your private booking link or sign in to your linked account.{" "}
          <a href="/auth/sign-in">Sign in</a>
        </Empty>
      ) : (
        <>
          <div className="platform-actions">
            <span className="platform-badge">{d.request.status}</span>
            <a
              className="button button-outline"
              href={`/checkout/${id}?plan=${d.request.planId}`}
            >
              Quote & checkout
            </a>
            <Button
              onClick={() =>
                void downloadPrivate(
                  `trip/${id}/pdf`,
                  access.key,
                  "almaty-offline-trip.pdf",
                ).catch((e) => s.setMessage(e.message))
              }
            >
              <Download size={16} />
              Save offline PDF
            </Button>
            <Button onClick={() => void s.load()}>Refresh</Button>
          </div>
          <div className="platform-two platform-detail">
            <div>
              <section className="platform-card">
                <h2>{d.request.plan.title}</h2>
                <p>
                  {d.request.plan.startDate} ·{" "}
                  {d.request.plan.adults + d.request.plan.children} guests ·{" "}
                  {d.request.plan.days.length} days
                </p>
                <p>
                  Language: {d.request.guest.language}.{" "}
                  {d.request.guest.allergies &&
                    `Allergies: ${d.request.guest.allergies}.`}{" "}
                  {d.request.guest.accessibility &&
                    `Accessibility: ${d.request.guest.accessibility}.`}
                </p>
                <div
                  className="platform-actions"
                  role="group"
                  aria-label="Trip day"
                >
                  {d.request.plan.days.map((_: any, i: number) => (
                    <Button
                      aria-pressed={day === i}
                      key={i}
                      onClick={() => setDay(i)}
                    >
                      Day {i + 1}
                    </Button>
                  ))}
                </div>
                <ul className="platform-list platform-detail">
                  {d.request.plan.days[day]?.stops.map((stop: any) => (
                    <li key={stop.id}>
                      <strong>
                        {stop.start} ·{" "}
                        {d.items.find((i: any) => i.id === stop.itemId)?.name ||
                          "Stop to review"}
                      </strong>
                      <p>
                        {d.items.find((i: any) => i.id === stop.itemId)
                          ?.address ||
                          "Address not supplied; use the map coordinates."}
                      </p>
                      {stop.note && <p>{stop.note}</p>}
                    </li>
                  ))}
                </ul>
                <TravelMap
                  items={d.items}
                  route={d.request.plan.days[day]?.stops
                    .map((stop: any) =>
                      d.items.find((i: any) => i.id === stop.itemId),
                    )
                    .filter(Boolean)}
                />
              </section>
              <section className="platform-card">
                <h2>
                  <MessageCircle size={23} /> Your booking thread
                </h2>
                {!d.contactUnlocked && (
                  <p className="platform-warning">
                    Guide contact details and photo sharing unlock after
                    payment. Booking questions can be discussed with the team
                    here.
                  </p>
                )}
                <div className="platform-thread" aria-label="Booking messages">
                  {d.messages.map((m: any) => (
                    <article className="platform-message" key={m.id}>
                      <small>
                        {m.actor === "client" ? "Traveller" : "Travel team"} ·{" "}
                        {new Date(m.created_at).toLocaleString()}{" "}
                        {m.visibility === "internal" ? "· Internal note" : ""}
                      </small>
                      {m.body}
                      {translations[m.id] && (
                        <p lang="ru">{translations[m.id]}</p>
                      )}
                      {m.extra?.kind === "location" && (
                        <p>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${m.extra.lat},${m.extra.lng}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Shared location ↗
                          </a>
                        </p>
                      )}
                      {m.extra?.kind === "photo" && (
                        <PrivatePhoto
                          id={m.extra.assetId}
                          requestId={id}
                          accessKey={access.key}
                        />
                      )}
                      <div className="platform-actions">
                        <Button
                          disabled={!translationConsent}
                          title={
                            !translationConsent
                              ? "Allow external translation below first"
                              : undefined
                          }
                          onClick={async () => {
                            try {
                              const r = await platform(
                                `trip/${id}`,
                                {
                                  action: "translate",
                                  messageId: Number(m.id),
                                  language: "ru",
                                  consent: true,
                                },
                                access.key,
                              );
                              setTranslations({
                                ...translations,
                                [m.id]: r.text,
                              });
                            } catch (e) {
                              s.setMessage((e as Error).message);
                            }
                          }}
                        >
                          Translate to Russian
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
                <label className="platform-check platform-detail">
                  <input
                    type="checkbox"
                    checked={translationConsent}
                    onChange={(e) => setTranslationConsent(e.target.checked)}
                  />
                  Allow selected messages to be sent to the configured AI
                  translation provider.
                </label>
                <form
                  className="platform-form platform-detail"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await s.run({
                      action: "message",
                      body,
                      kind: location ? "location" : "text",
                      ...(location
                        ? { lat: Number(latitude), lng: Number(longitude) }
                        : {}),
                    });
                    if (r) {
                      setBody("");
                      setLocation(false);
                    }
                  }}
                >
                  <Field label="Message your guide or travel desk">
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      maxLength={4000}
                      required={!location}
                    />
                  </Field>
                  <label className="platform-check">
                    <input
                      type="checkbox"
                      checked={location}
                      onChange={(e) => setLocation(e.target.checked)}
                    />
                    <MapPin size={17} />
                    Include a location you enter
                  </label>
                  {location && (
                    <div className="platform-form-row">
                      <Field label="Latitude">
                        <input
                          type="number"
                          step="any"
                          min="-90"
                          max="90"
                          value={latitude}
                          onChange={(e) => setLatitude(e.target.value)}
                          required
                        />
                      </Field>
                      <Field label="Longitude">
                        <input
                          type="number"
                          step="any"
                          min="-180"
                          max="180"
                          value={longitude}
                          onChange={(e) => setLongitude(e.target.value)}
                          required
                        />
                      </Field>
                    </div>
                  )}
                  <Button primary busy={s.busy} type="submit">
                    Send message
                  </Button>
                  {d.role !== "client" && (
                    <Button
                      busy={s.busy}
                      type="button"
                      onClick={() => void s.run({ action: "note", body })}
                    >
                      Save as internal note
                    </Button>
                  )}
                </form>
              </section>
              <section className="platform-card">
                <h2>Memories, just for you.</h2>
                <p className="platform-muted">
                  Private tour gallery. Photos are available to this booking’s
                  travellers, assigned guide and authorised staff. EXIF location
                  metadata is removed. Images are deleted 90 days after a
                  completed or cancelled trip.
                </p>
                <div className="platform-gallery">
                  {d.assets.map((asset: any) => (
                    <PrivatePhoto
                      id={asset.id}
                      requestId={id}
                      accessKey={access.key}
                      caption={asset.caption}
                      key={asset.id}
                    />
                  ))}
                </div>
                {!d.assets.length && (
                  <p>Your gallery is waiting for its first photo.</p>
                )}
                {d.contactUnlocked &&
                  ["confirmed", "completed"].includes(d.request.status) && (
                    <form
                      className="platform-form platform-detail"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        try {
                          const r = await fetch(
                            `/api/platform/trip/${id}/upload`,
                            {
                              method: "POST",
                              headers: access.key
                                ? { "X-Plan-Key": access.key }
                                : {},
                              body: new FormData(form),
                            },
                          );
                          const result = await r.json();
                          if (!r.ok) throw new Error(result.error);
                          form.reset();
                          await s.load();
                          s.setMessage("Photo uploaded securely.");
                        } catch (e) {
                          s.setMessage((e as Error).message);
                        }
                      }}
                    >
                      <Field label="Photo (JPG, PNG or WebP; maximum 3 MB)">
                        <input
                          type="file"
                          name="photo"
                          accept="image/jpeg,image/png,image/webp"
                          required
                        />
                      </Field>
                      <Field label="Caption">
                        <input name="caption" maxLength={500} />
                      </Field>
                      <Button type="submit">Upload photo</Button>
                    </form>
                  )}
              </section>
              {d.request.status === "completed" &&
                d.role === "client" &&
                d.guide && (
                  <section className="platform-card">
                    <h2>How was your guide?</h2>
                    <form
                      className="platform-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void s.run({
                          action: "review",
                          rating: Number(f.get("rating")),
                          body: f.get("body"),
                        });
                      }}
                    >
                      <Field label="Rating">
                        <select
                          name="rating"
                          defaultValue={d.review?.rating || 5}
                        >
                          {[5, 4, 3, 2, 1].map((v) => (
                            <option value={v} key={v}>
                              {v} / 5
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Your review">
                        <textarea
                          name="body"
                          required
                          maxLength={2000}
                          defaultValue={d.review?.body || ""}
                        />
                      </Field>
                      <Button primary busy={s.busy}>
                        Submit for publication review
                      </Button>
                    </form>
                  </section>
                )}
              {d.role === "guide" && d.request.status === "completed" && (
                <section className="platform-card">
                  <h2>Propose another day together</h2>
                  <p>
                    Send a copy of this itinerary for manager review. The team
                    will edit dates, availability and price before offering it
                    to the traveller.
                  </p>
                  <Button
                    busy={s.busy}
                    onClick={() =>
                      void s.run({ action: "followup", plan: d.request.plan })
                    }
                  >
                    Propose follow-up itinerary
                  </Button>
                </section>
              )}
              {d.followups.length > 0 && (
                <section className="platform-card">
                  <h2>One more Almaty adventure?</h2>
                  {d.followups.map((f: any) => (
                    <div key={f.id}>
                      <h3>{f.data.plan.title}</h3>
                      <p>
                        This creates a new request. Your manager will confirm
                        the final itinerary, availability and quote before
                        payment.
                      </p>
                      <Button
                        onClick={() =>
                          void s.run({
                            action: "accept-followup",
                            followupId: f.id,
                          })
                        }
                      >
                        Request this follow-up
                      </Button>
                    </div>
                  ))}
                </section>
              )}
            </div>
            <aside>
              <section className="platform-card">
                <h2>Your guide</h2>
                {d.guide ? (
                  <>
                    <p>
                      <strong>{d.guide.name}</strong> · {d.guide.status}
                    </p>
                    <p>{d.guide.languages.join(" · ")}</p>
                    {d.guide.phone && (
                      <a href={`tel:${d.guide.phone}`}>{d.guide.phone}</a>
                    )}
                    {d.guide.email && (
                      <p>
                        <a href={`mailto:${d.guide.email}`}>{d.guide.email}</a>
                      </p>
                    )}
                  </>
                ) : (
                  <p>Your travel team will arrange a guide where included.</p>
                )}
              </section>
              <section className="platform-card">
                <h2>
                  <ShieldCheck size={23} /> A safer day out
                </h2>
                {d.weather?.advice?.cautions?.length > 0 && (
                  <p className="platform-warning">
                    {d.weather.advice.cautions.join(" ")}
                  </p>
                )}
                <p>
                  {d.weather?.advice?.clothing.join(" ") ||
                    "Check the latest forecast before outdoor travel."}
                </p>
                <p className="platform-muted">
                  Forecast saved: {d.weather?.lastUpdated || "unavailable"}.
                  Mountain conditions may differ.
                </p>
                <div className="platform-form">
                  <Button
                    busy={s.busy}
                    onClick={() => void s.run({ action: "check-in" })}
                  >
                    I’m safe · check in
                  </Button>
                  <Button
                    busy={s.busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Alert your guide and manager that you need urgent help? For immediate danger, call 112 directly.",
                        )
                      )
                        void s.run({
                          action: "emergency",
                          message: "Traveller used the emergency alert button.",
                        });
                    }}
                  >
                    Alert guide & manager
                  </Button>
                  <a className="button button-accent" href="tel:112">
                    <PhoneCall size={18} />
                    Call 112
                  </a>
                </div>
                <p className="platform-muted">
                  An in-site alert queues a notification; it does not call
                  emergency services. Delivery depends on the configured
                  communication services.
                </p>
                {d.safety.slice(0, 3).map((e: any) => (
                  <p className="platform-muted" key={e.id}>
                    {e.kind} · {new Date(e.created_at).toLocaleString()}
                  </p>
                ))}
              </section>
              <section className="platform-card">
                <h2>Take us with you.</h2>
                <p>
                  Link booking messages and the daily weather tip to your own
                  messaging account.
                </p>
                <div className="platform-form">
                  {["telegram", "whatsapp"].map((channel) => (
                    <Button
                      key={channel}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Allow booking and daily messages through ${channel}? You can disconnect using /stop.`,
                          )
                        )
                          void s.run({
                            action: "pair",
                            channel,
                            consent: true,
                          });
                      }}
                    >
                      Connect {channel === "telegram" ? "Telegram" : "WhatsApp"}
                    </Button>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </>
      )}
    </Shell>
  );
}
