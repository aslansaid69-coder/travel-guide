import { Checkout } from "@/components/platform/checkout";
export const metadata = {
  title: "Payment status",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Checkout id={id} statusOnly />;
}
