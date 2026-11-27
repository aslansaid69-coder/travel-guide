import { GuidesAdmin } from "@/components/platform/admin-guides";
import { staffSession } from "@/lib/hub/access";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Guide team",
  robots: { index: false, follow: false },
};
export default async function Page() {
  const staff = await staffSession();
  if (!staff) redirect("/auth/sign-in");
  if (!["owner", "admin"].includes(staff.role)) redirect("/account");
  return <GuidesAdmin />;
}
