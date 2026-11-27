import { requirePage } from "@/lib/auth/session";
import { PageHeader } from "@/components/admin/ui";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const user = await requirePage("dashboard.view");
  return <PageHeader title={`Hello, ${user.name || user.email}`} intro="Your workspace." />;
}
