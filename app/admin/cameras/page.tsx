import { redirect } from "next/navigation";
import { ownerSession } from "@/lib/auth/owner";
import { CameraAdmin } from "@/components/camera-admin";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Camera management",
  robots: { index: false, follow: false },
};
export default async function Cameras() {
  if (!(await ownerSession())) redirect("/auth/sign-in");
  return (
    <main className="shell credits-page admin-page">
      <p className="eyebrow">OWNER WORKSPACE · STAGE 1</p>
      <h1>Cameras</h1>
      <p>
        Direct live streams, their health, and the latest monitoring history.
      </p>
      <CameraAdmin />
    </main>
  );
}
