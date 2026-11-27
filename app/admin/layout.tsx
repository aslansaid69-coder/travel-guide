import Link from "next/link";
import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { AdminNav } from "@/components/admin/nav";
import "../styles/admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false },
};

/** Server-side gate for every /admin page (in addition to proxy.ts). */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePage("admin.access");
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/" className="admin-brand">
          Almaty<span>admin</span>
        </Link>
        <AdminNav role={user.role} />
        <p className="admin-user">
          <strong>{user.email}</strong>
          <span className="admin-role">{ROLE_LABELS[user.role]}</span>
        </p>
      </aside>
      <div className="admin-main" id="main">
        {children}
      </div>
    </div>
  );
}
