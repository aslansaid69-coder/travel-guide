import { GuideDashboard } from "@/components/platform/guides";
export const metadata = {
  title: "Guide workspace",
  alternates: { canonical: "/guide" },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <GuideDashboard />;
}
