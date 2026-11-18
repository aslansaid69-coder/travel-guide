import { Deals } from "@/components/platform/extras";
export const metadata = {
  title: "Almaty deals",
  alternates: { canonical: "/deals" },
  robots: { index: true, follow: true },
};
export default function Page() {
  return <Deals />;
}
