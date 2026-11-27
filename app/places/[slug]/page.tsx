import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { publishedPlace } from "@/lib/places/store";
import { googleDetails, googlePhotoUrl } from "@/lib/places/providers/google";
import { approvedReviews, eligibleTrip, googleReviews } from "@/lib/reviews/store";
import { currentUser } from "@/lib/auth/session";
import { money } from "@/lib/hub/core";
import { HubFooter, HubHeader } from "@/components/hub/shared";
import { Localized } from "@/components/tours/localized";
import { RouteMap } from "@/components/tours/route-map";
import { ReviewForm } from "@/components/tours/review-form";
import { siteUrl } from "@/lib/site";
import { T } from "@/components/hub/language";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await publishedPlace((await params).slug).catch(() => null);
  if (!item) return { title: "Place not found", robots: { index: false } };
  const image = item.photos[0]?.url || item.image;
  return {
    title: item.name,
    description: item.description.slice(0, 160),
    alternates: { canonical: `/places/${item.slug || item.id}` },
    openGraph: { title: item.name, description: item.description.slice(0, 200), images: image ? [image] : [] },
  };
}

const stars = (n: number) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));

export default async function PlacePage({ params }: Props) {
  const item = await publishedPlace((await params).slug);
  if (!item) notFound();
  const [live, ours, google, user] = await Promise.all([
    item.googlePlaceId ? googleDetails(item.googlePlaceId).catch(() => null) : Promise.resolve(null),
    approvedReviews(item.id),
    googleReviews(item.googlePlaceId),
    currentUser(),
  ]);
  const canReview = user ? !!(await eligibleTrip(user.id, item.id).catch(() => null)) : false;
  const gallery = item.photos.length
    ? item.photos.map((p) => ({ src: p.url, alt: p.alt || item.name, credit: p.author, href: p.sourceUrl, licence: p.licence, google: false }))
    : item.image
      ? [{ src: item.image, alt: item.alt || item.name, credit: item.imageCredit?.author || "", href: item.imageCredit?.sourceUrl || "", licence: item.imageCredit?.licence || "", google: false }]
      : (live?.photos || []).slice(0, 5).map((p) => ({
          src: googlePhotoUrl(p.name, 1200),
          alt: item.name,
          credit: p.authorAttributions?.[0]?.displayName || "Google",
          href: p.authorAttributions?.[0]?.uri || "",
          licence: "Google Maps",
          google: true,
        }));
  const address = item.address || live?.formattedAddress || "";
  const hours = item.hours ? [item.hours] : live?.regularOpeningHours?.weekdayDescriptions || [];
  const price = item.price;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    name: item.name,
    description: item.description,
    url: `${siteUrl}/places/${item.slug || item.id}`,
    geo: { "@type": "GeoCoordinates", latitude: item.lat, longitude: item.lng },
    ...(gallery[0] && !gallery[0].google ? { image: gallery[0].src } : {}),
    ...(ours.count ? { aggregateRating: { "@type": "AggregateRating", ratingValue: ours.average?.toFixed(1), reviewCount: ours.count } } : {}),
  };
  return (
    <>
      <HubHeader />
      <main id="main" className="tour-page">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replaceAll("<", "\\u003c") }}
        />
        <p className="eyebrow">
          {[item.city, item.region].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · ") || "Almaty"} · {item.category}
        </p>
        <Localized as="h1" en={item.name} ru={item.nameRu} kk={item.nameKk} />
        {gallery.length > 0 && (
          <div className="place-hero">
            {gallery.slice(0, 5).map((g, i) => (
              <figure key={g.src + i}>
                <img src={g.src} alt={g.alt} loading={i ? "lazy" : "eager"} referrerPolicy="no-referrer" />
                {(g.credit || g.licence) && (
                  <figcaption>
                    {g.google ? "Photo: " : "© "}
                    {g.href ? (
                      <a href={g.href} target="_blank" rel="noreferrer">
                        {g.credit || "author"}
                      </a>
                    ) : (
                      g.credit
                    )}
                    {g.licence ? ` · ${g.licence}` : ""}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        )}
        <div className="tour-grid">
          <div>
            <section className="tour-card">
              <Localized as="p" en={item.description} ru={item.descriptionRu} kk={item.descriptionKk} />
              {item.researchEvidence?.descriptionSource ? (
                <p className="hub-caption">
                  Facts: <a href={item.sourceUrl} target="_blank" rel="noreferrer">Wikipedia</a> (CC BY-SA 4.0)
                </p>
              ) : null}
              <div className="platform-actions">
                <Link className="button button-accent" href={`/build?add=${encodeURIComponent(item.id)}`}>
                  <T ru="Добавить в тур" kk="Турға қосу">Add to my tour</T>
                </Link>
              </div>
            </section>
            <section className="tour-card" aria-labelledby="reviews">
              <h2 id="reviews">
                <T>Reviews</T>
                {ours.count > 0 && ours.average !== null && (
                  <span className="stars" aria-label={`${ours.average.toFixed(1)} of 5`}> {stars(ours.average)} {ours.average.toFixed(1)} · {ours.count}</span>
                )}
              </h2>
              {ours.reviews.map((r) => (
                <article className="review" key={r.id}>
                  <header>
                    <strong>{r.author}</strong>
                    <span className="stars" aria-label={`${r.rating} of 5`}>{stars(r.rating)}</span>
                    {r.verified && (
                      <span className="review-verified">
                        ✓ <T ru="Подтверждённая поездка" kk="Расталған сапар">Verified trip</T>
                      </span>
                    )}
                    <small>{new Date(r.createdAt).toLocaleDateString("en-GB")}</small>
                  </header>
                  {r.title && <strong>{r.title}</strong>}
                  <p>{r.body}</p>
                </article>
              ))}
              {!ours.reviews.length && (
                <p className="platform-muted">
                  <T ru="Пока нет отзывов от наших путешественников." kk="Әзірге біздің саяхатшылардан пікір жоқ.">
                    No reviews from our travellers yet.
                  </T>
                </p>
              )}
              {canReview && user ? (
                <details>
                  <summary>
                    <T ru="Оставить отзыв о поездке" kk="Сапар туралы пікір қалдыру">Review your trip</T>
                  </summary>
                  <ReviewForm placeId={item.id} slug={item.slug || item.id} defaultName={user.name} />
                </details>
              ) : (
                <p className="hub-caption">
                  <T ru="Отзывы оставляют только путешественники после завершённой поездки." kk="Пікірді тек аяқталған сапардан кейін саяхатшылар қалдырады.">
                    Only travellers who completed a trip here can leave a review.
                  </T>
                </p>
              )}
              {google && google.reviews.length > 0 && (
                <>
                  <h3>
                    Google · {google.rating?.toFixed(1)} ({google.count})
                  </h3>
                  {google.reviews.map((g, i) => (
                    <article className="review" key={i}>
                      <header>
                        {g.authorPhoto && <img src={g.authorPhoto} alt="" width={28} height={28} style={{ borderRadius: "50%" }} referrerPolicy="no-referrer" />}
                        {g.authorUrl ? (
                          <a href={g.authorUrl} target="_blank" rel="noreferrer">
                            <strong>{g.author}</strong>
                          </a>
                        ) : (
                          <strong>{g.author}</strong>
                        )}
                        {g.rating !== null && <span className="stars">{stars(g.rating)}</span>}
                        <small>{g.when}</small>
                      </header>
                      <p>{g.text}</p>
                    </article>
                  ))}
                  <p className="review-google">
                    Reviews from Google Maps, shown as published by Google.{" "}
                    {google.mapsUrl && (
                      <a href={google.mapsUrl} target="_blank" rel="noreferrer">
                        See all on Google Maps ↗
                      </a>
                    )}
                  </p>
                </>
              )}
            </section>
          </div>
          <aside>
            <section className="tour-card">
              <dl className="place-facts">
                <div>
                  <dt><T ru="Вход" kk="Кіру">Entry</T></dt>
                  <dd>
                    {price ? (
                      <>
                        <strong>
                          {price.type === "free"
                            ? "Free"
                            : `${money(price.min, price.currency)}${price.max > price.min ? ` – ${money(price.max, price.currency)}` : ""}`}
                        </strong>
                        {price.source === "estimated" && <small> (estimate)</small>}
                        {price.note && <small style={{ display: "block" }}>{price.note}</small>}
                        {price.sourceUrl && (
                          <small style={{ display: "block" }}>
                            Source:{" "}
                            <a href={price.sourceUrl} target="_blank" rel="noreferrer">
                              {new URL(price.sourceUrl).host}
                            </a>
                            {price.checkedAt && ` · checked ${price.checkedAt}`}
                          </small>
                        )}
                      </>
                    ) : (
                      <T ru="Цена не опубликована — уточните на месте" kk="Баға жарияланбаған">Price not published — check on site</T>
                    )}
                  </dd>
                </div>
                <div>
                  <dt><T ru="Время визита" kk="Бару уақыты">Typical visit</T></dt>
                  <dd>≈ {item.duration >= 120 ? `${Math.round(item.duration / 60)} h` : `${item.duration} min`}</dd>
                </div>
                {hours.length > 0 && (
                  <div>
                    <dt><T ru="Часы работы" kk="Жұмыс уақыты">Hours</T></dt>
                    <dd>
                      {hours.map((h) => (
                        <span key={h} style={{ display: "block" }}>{h}</span>
                      ))}
                      {!item.hours && live && <small>Google Maps</small>}
                    </dd>
                  </div>
                )}
                {address && (
                  <div>
                    <dt><T ru="Адрес" kk="Мекенжай">Address</T></dt>
                    <dd>
                      {address}
                      {!item.address && live && <small style={{ display: "block" }}>Google Maps</small>}
                    </dd>
                  </div>
                )}
                {item.season && (
                  <div>
                    <dt><T ru="Сезон" kk="Маусым">Season</T></dt>
                    <dd>{item.season}</dd>
                  </div>
                )}
                {item.transport && (
                  <div>
                    <dt><T ru="Как добраться" kk="Қалай жетуге болады">Getting there</T></dt>
                    <dd>{item.transport}</dd>
                  </div>
                )}
                {item.website && (
                  <div>
                    <dt>Website</dt>
                    <dd>
                      <a href={item.website} target="_blank" rel="noreferrer">
                        {new URL(item.website).host}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </section>
            <section className="tour-card">
              <RouteMap points={[{ id: item.id, name: item.name, lat: item.lat, lng: item.lng }]} loop={false} height={280} label={`Map: ${item.name}`} />
              <p className="hub-caption">
                <a href={live?.googleMapsUri || `https://www.openstreetmap.org/?mlat=${item.lat}&mlon=${item.lng}#map=14/${item.lat}/${item.lng}`} target="_blank" rel="noreferrer">
                  Open in maps ↗
                </a>
              </p>
            </section>
          </aside>
        </div>
      </main>
      <HubFooter />
    </>
  );
}
