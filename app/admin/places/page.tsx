import Link from "next/link";
import { requirePage } from "@/lib/auth/session";
import { listParams, type SearchParams } from "@/lib/admin/list";
import { listPlaces, PLACE_STATUS } from "@/lib/places/store";
import { itemSchema } from "@/lib/hub/types";
import { money } from "@/lib/hub/core";
import { Badge, Empty, Filters, formatDate, Notice, PageHeader, Pagination } from "@/components/admin/ui";

export const metadata = { title: "Places" };
const CATEGORIES = itemSchema.shape.category.options;

function priceLabel(item: Awaited<ReturnType<typeof listPlaces>>["rows"][number]["item"]) {
  if (item.priceStatus === "not_found") return <Badge tone="warn">Price not found</Badge>;
  if (!item.price) return <Badge>Not researched</Badge>;
  if (item.price.type === "free") return "Free";
  const { min, max, currency } = item.price;
  return `${money(min, currency)}${max > min ? `–${money(max, currency)}` : ""}`;
}

export default async function PlacesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage("places.read", "/admin/places");
  const raw = await searchParams;
  const p = listParams(raw);
  const category = typeof raw.category === "string" && (CATEGORIES as readonly string[]).includes(raw.category) ? raw.category : "";
  const { rows, total } = await listPlaces(p, category);
  return (
    <>
      <PageHeader title="Places" intro="Everything travellers can see, plan and book. Drafts stay private until you publish them.">
        <Link className="admin-button" data-variant="primary" href="/admin/places/new">
          + Add place
        </Link>
      </PageHeader>
      <Notice message={raw.notice} tone="ok" />
      <Notice message={raw.error} tone="bad" />
      <Filters params={p} statuses={Object.values(PLACE_STATUS)} placeholder="Search name, slug or city">
        <select name="category" defaultValue={category} aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Filters>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Place</th>
              <th>Category</th>
              <th>Status</th>
              <th>Entry price</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, updatedAt }) => (
              <tr key={item.id}>
                <td>
                  <Link href={`/admin/places/${encodeURIComponent(item.id)}`}>
                    <strong>{item.name}</strong>
                  </Link>
                  <small>
                    /{item.slug || item.id} · {[item.city, item.region].filter(Boolean).join(", ")}
                    {item.googlePlaceId ? " · Google" : ""}
                  </small>
                </td>
                <td>{item.category}</td>
                <td>
                  <Badge tone={item.status === "approved" ? "ok" : item.status === "hidden" ? "bad" : "warn"}>
                    {PLACE_STATUS[item.status]}
                  </Badge>
                </td>
                <td>{priceLabel(item)}</td>
                <td>{formatDate(updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <Empty>No places match. Try another search or add a place.</Empty>}
      <Pagination base="/admin/places" params={p} total={total} />
    </>
  );
}
