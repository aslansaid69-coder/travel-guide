"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MapPin,
  Users,
  CalendarCheck,
  CreditCard,
  MessageSquareText,
  SlidersHorizontal,
  Bot,
  ShieldCheck,
  ScrollText,
  Inbox,
  Search,
  RefreshCw,
  Video,
} from "lucide-react";
import type { Permission, Role } from "@/lib/auth/roles";
import { can } from "@/lib/auth/roles";

const links: {
  href: string;
  label: string;
  icon: typeof MapPin;
  permission: Permission;
}[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { href: "/admin/places", label: "Places", icon: MapPin, permission: "places.read" },
  { href: "/admin/guides", label: "Guides", icon: Users, permission: "guides.view" },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarCheck, permission: "bookings.view" },
  { href: "/admin/payments", label: "Payments", icon: CreditCard, permission: "payments.view" },
  { href: "/admin/reviews", label: "Reviews", icon: MessageSquareText, permission: "reviews.moderate" },
  { href: "/admin/pricing", label: "Pricing", icon: SlidersHorizontal, permission: "pricing.manage" },
  { href: "/admin/assistant", label: "Assistant", icon: Bot, permission: "assistant.conversations" },
  { href: "/admin/users", label: "Users & roles", icon: ShieldCheck, permission: "users.view" },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText, permission: "audit.view" },
  { href: "/admin/hub", label: "Travel desk", icon: Inbox, permission: "bookings.manage" },
  { href: "/admin/research", label: "Research", icon: Search, permission: "settings.manage" },
  { href: "/admin/updates", label: "Updates", icon: RefreshCw, permission: "settings.manage" },
  { href: "/admin/cameras", label: "Cameras", icon: Video, permission: "settings.manage" },
];

export function AdminNav({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="Admin sections">
      {links
        .filter((l) => can(role, l.permission))
        .map(({ href, label, icon: Icon }) => {
          const active =
            href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="admin-nav-link"
              aria-current={active ? "page" : undefined}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
    </nav>
  );
}
