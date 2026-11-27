import { Account } from "@/components/hub/account";
import { HubHeader, HubFooter } from "@/components/hub/shared";
import { MyBookings } from "@/components/tours/my-bookings";
export const metadata = {
  title: "Your saved plans",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  return (
    <>
      <HubHeader />
      <main id="main" className="hub-page">
        {sp.denied && (
          <p className="platform-warning" role="alert">
            Your account does not have access to that area. Ask the owner if you need staff access.
          </p>
        )}
        <MyBookings />
        <Account />
      </main>
      <HubFooter />
    </>
  );
}
