import { redirect } from "next/navigation";
import { ownerSession } from "@/lib/auth/owner";
import { UpdateAdmin } from "@/components/update-admin";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Automatic updates",
  robots: { index: false, follow: false },
};
export default async function Updates() {
  if (!(await ownerSession())) redirect("/auth/sign-in");
  return (
    <main className="shell credits-page admin-page">
      <p className="eyebrow">OWNER WORKSPACE · AUTOMATIC UPDATES</p>
      <h1>A fresh view, every day.</h1>
      <p>
        Daily refresh targets 05:00 Asia/Almaty. Current weather also refreshes
        hourly. Last-good content survives source outages.
      </p>
      <UpdateAdmin />
    </main>
  );
}
