import { ResearchDesk } from "@/components/platform/research";
import { staffSession } from "@/lib/hub/access";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Research desk",
  robots: { index: false, follow: false },
};
export default async function Page() {
  const staff = await staffSession();
  if (!staff) redirect("/auth/sign-in");
  if (!["owner"].includes(staff.role)) redirect("/account");
  return <ResearchDesk />;
}
