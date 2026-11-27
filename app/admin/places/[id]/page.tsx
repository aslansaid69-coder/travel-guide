import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getPlace, PLACE_STATUS } from "@/lib/places/store";
import { googleDetails, googlePhotoUrl } from "@/lib/places/providers/google";
import { photosToText } from "@/lib/places/photos";
import { claudeConfigured } from "@/lib/ai/claude";
import { Badge, Notice, PageHeader } from "@/components/admin/ui";
import { ConfirmButton } from "@/components/admin/confirm";
import { PlaceEditor } from "@/components/admin/place-editor";
import { refreshGoogle, removePlace } from "../actions";
import type { SearchParams } from "@/lib/admin/list";

export const metadata = { title: "Edit place" };
/** Google allows caching coordinates for up to 30 days. */
function googleCacheExpired(fetchedAt: string) {
  return !fetchedAt || Date.now() - new Date(fetchedAt).valueOf() > 30 * 86400000;
}

export default async function EditPlace({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const user = await requirePage("places.read", `/admin/places/${id}`);
  const raw = await searchParams;
  const item = await getPlace(decodeURIComponent(id));
  if (!item) notFound();
  const live = item.googlePlaceId ? await googleDetails(item.googlePlaceId).catch(() => null) : null;
  const staleCoords = !!item.googlePlaceId && googleCacheExpired(item.googleFetchedAt);
  return (
    <>
      <PageHeader title={item.name} intro={`/${item.slug || item.id} · ${item.category}`}>
        <Badge tone={item.status === "approved" ? "ok" : item.status === "hidden" ? "bad" : "warn"}>{PLACE_STATUS[item.status]}</Badge>
        {item.status === "approved" && (
          <Link className="admin-button" href={`/places/${item.slug || item.id}`} target="_blank">
            View public page ↗
          </Link>
        )}
        <Link className="admin-button" href="/admin/places">
          ← All places
        </Link>
      </PageHeader>
      <Notice message={raw.notice} tone="ok" />
      <Notice message={raw.error} tone="bad" />
      {staleCoords && (
        <p className="admin-notice" data-tone="bad">
          Google coordinates are older than 30 days. Refresh them to stay within Google’s caching terms.
        </p>
      )}
      <div className="admin-two">
        <PlaceEditor
          item={item}
          photosText={photosToText(item.photos)}
          canWrite={can(user.role, "places.write")}
          aiConfigured={claudeConfigured()}
        />
        <div>
          {item.googlePlaceId && (
            <section className="admin-card">
              <h2>Live from Google</h2>
              {live ? (
                <>
                  <p>{live.formattedAddress}</p>
                  {live.rating !== undefined && (
                    <p>
                      ★ {live.rating.toFixed(1)} ({live.userRatingCount || 0} reviews)
                    </p>
                  )}
                  {live.regularOpeningHours?.weekdayDescriptions && (
                    <ul>
                      {live.regularOpeningHours.weekdayDescriptions.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  )}
                  {live.photos?.length ? (
                    <div className="admin-photos">
                      {live.photos.slice(0, 6).map((p) => (
                        <figure key={p.name}>
                          <img src={googlePhotoUrl(p.name, 320)} alt="" loading="lazy" referrerPolicy="no-referrer" />
                          <figcaption>{p.authorAttributions?.[0]?.displayName || "Google"}</figcaption>
                        </figure>
                      ))}
                    </div>
                  ) : null}
                  <p className="admin-muted">
                    Shown live on the public page with “Google Maps” attribution. Not stored.{" "}
                    {live.googleMapsUri && (
                      <a href={live.googleMapsUri} target="_blank" rel="noreferrer">
                        Open in Google Maps ↗
                      </a>
                    )}
                  </p>
                </>
              ) : (
                <p className="admin-muted">Google details are unavailable right now.</p>
              )}
              {can(user.role, "places.write") && (
                <form action={refreshGoogle}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="admin-button">Refresh coordinates</button>
                </form>
              )}
            </section>
          )}
          <section className="admin-card">
            <h2>Sources & credits</h2>
            <p>{item.source || "Owner"}</p>
            {item.sourceUrl && (
              <p>
                <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                  {item.sourceUrl}
                </a>
              </p>
            )}
            {item.price?.sourceUrl && (
              <p>
                Price source:{" "}
                <a href={item.price.sourceUrl} target="_blank" rel="noreferrer">
                  {new URL(item.price.sourceUrl).host}
                </a>{" "}
                · checked {item.price.checkedAt || item.price.updatedAt.slice(0, 10)}
              </p>
            )}
          </section>
          {can(user.role, "places.delete") && (
            <section className="admin-card">
              <h2>Delete</h2>
              <p className="admin-muted">
                Places used by bookings, inventory or deals are hidden instead of deleted, so history stays intact.
              </p>
              <form action={removePlace}>
                <input type="hidden" name="id" value={item.id} />
                <ConfirmButton message={`Delete “${item.name}”? This cannot be undone.`}>Delete place</ConfirmButton>
              </form>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
