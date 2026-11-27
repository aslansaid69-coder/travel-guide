import Link from "next/link";
import { StaffSignIn } from "@/components/staff-sign-in";
import { safeNext } from "@/lib/auth/redirect";
export const metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  return (
    <main className="shell credits-page">
      <p className="eyebrow">ALMATY · YOUR ACCOUNT</p>
      <h1>Welcome back.</h1>
      <p>
        Enter your email and we will send a one-time sign-in code. Travellers, guides and staff use the same
        sign-in; permissions are assigned by the owner.
      </p>
      {sp.error === "unavailable" && (
        <p role="alert">Sign-in could not be verified right now. Please try again in a moment.</p>
      )}
      <StaffSignIn next={next} />
      <Link href="/">Return to the guide</Link>
    </main>
  );
}
