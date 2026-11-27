import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth/server";
import { ownerEmails } from "@/lib/auth/owner";
import { can, protectedArea, roleFromDatabase, type Role } from "@/lib/auth/roles";
import { database } from "@/lib/db";

/**
 * First line of defence for private pages (Next.js 16 `proxy`, Node.js runtime).
 * - /admin/**: requires a verified session AND the OWNER or ADMIN role.
 * - /account, /guide: require a verified session.
 * Every page, route handler and server action re-checks permissions on its own
 * (lib/auth/session.ts); this proxy only avoids rendering protected UI at all.
 * Fails closed: any auth/database error redirects to sign-in.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const area = protectedArea(pathname);
  if (!area) return NextResponse.next();
  const signIn = new URL("/auth/sign-in", request.url);
  signIn.searchParams.set("next", pathname + search);
  try {
    const { data } = await getAuth().getSession();
    const user = data?.user;
    if (!user?.emailVerified) return NextResponse.redirect(signIn);
    if (area === "admin") {
      let role: Role;
      if (ownerEmails().includes(user.email.toLowerCase())) role = "owner";
      else {
        const rows =
          await database()`SELECT role FROM staff_roles WHERE user_id=${user.id}`;
        const stored = roleFromDatabase(rows[0]?.role as string | undefined);
        role = stored === "owner" ? "tourist" : stored;
      }
      if (!can(role, "admin.access"))
        return NextResponse.redirect(new URL("/account?denied=1", request.url));
    }
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex");
    return response;
  } catch {
    signIn.searchParams.set("error", "unavailable");
    return NextResponse.redirect(signIn);
  }
}

export const config = {
  matcher: ["/admin/:path*", "/account/:path*", "/guide"],
};
