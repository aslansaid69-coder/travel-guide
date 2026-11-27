import Link from "next/link";
import { pageHref, PAGE_SIZE, type ListParams } from "@/lib/admin/list";

export function PageHeader({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="admin-header">
      <div>
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
      {children && <div className="admin-actions">{children}</div>}
    </header>
  );
}

export function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "ok" | "warn" | "bad";
}) {
  return (
    <span className="admin-badge" data-tone={tone}>
      {children}
    </span>
  );
}

export function Notice({
  message,
  tone,
}: {
  message?: string | string[];
  tone?: "ok" | "bad";
}) {
  const text = Array.isArray(message) ? message[0] : message;
  if (!text) return null;
  return (
    <p className="admin-notice" data-tone={tone} role="status">
      {text}
    </p>
  );
}

/** Search + status filter. Plain GET form: works without client JavaScript. */
export function Filters({
  params,
  statuses,
  placeholder = "Search…",
  children,
}: {
  params: ListParams;
  statuses?: readonly string[];
  placeholder?: string;
  children?: React.ReactNode;
}) {
  return (
    <form className="admin-filters" role="search">
      <input
        type="search"
        name="q"
        defaultValue={params.q}
        placeholder={placeholder}
        aria-label="Search"
      />
      {statuses && (
        <select name="status" defaultValue={params.status} aria-label="Status">
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
      {children}
      <button className="admin-button">Apply</button>
    </form>
  );
}

export function Pagination({
  base,
  params,
  total,
  size = PAGE_SIZE,
}: {
  base: string;
  params: ListParams;
  total: number;
  size?: number;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <nav className="admin-pagination" aria-label="Pagination">
      <span>
        {total} result{total === 1 ? "" : "s"} · page {Math.min(params.page, pages)} of {pages}
      </span>
      <span className="admin-actions">
        {params.page > 1 && (
          <Link className="admin-button" href={pageHref(base, params, params.page - 1)}>
            ← Previous
          </Link>
        )}
        {params.page < pages && (
          <Link className="admin-button" href={pageHref(base, params, params.page + 1)}>
            Next →
          </Link>
        )}
      </span>
    </nav>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="admin-muted">{children}</p>;
}

export const formatDate = (v: string | Date | null | undefined) =>
  v
    ? new Date(v).toLocaleString("en-GB", {
        timeZone: "Asia/Almaty",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

export const formatMoney = (minor: number, currency = "KZT") =>
  new Intl.NumberFormat("ru-KZ", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "KZT" ? 0 : 2,
  }).format(minor / 100);
