import { TripRoom } from "@/components/platform/trip";
export const metadata = {
  title: "Private trip",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TripRoom id={id} />;
}
