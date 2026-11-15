import { staffSession } from "@/lib/hub/access";
import { redirect } from "next/navigation";
import { HubAdmin } from "@/components/hub/admin";
import { HubHeader, HubFooter } from "@/components/hub/shared";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Travel desk",
  robots: { index: false, follow: false },
};
export default async function Page() {
  if (!(await staffSession())) redirect("/auth/sign-in");
  return (
    <>
      <HubHeader />
      <main id="main" className="hub-page hub-admin">
        <HubAdmin />
      </main>
      <HubFooter />
    </>
  );
}
