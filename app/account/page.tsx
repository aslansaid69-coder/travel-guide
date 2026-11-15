import { Account } from "@/components/hub/account";
import { HubHeader, HubFooter } from "@/components/hub/shared";
export const metadata = {
  title: "Your saved plans",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <>
      <HubHeader />
      <main id="main" className="hub-page">
        <Account />
      </main>
      <HubFooter />
    </>
  );
}
