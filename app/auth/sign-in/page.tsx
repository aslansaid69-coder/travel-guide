import { StaffSignIn } from "@/components/staff-sign-in";
export const metadata = {
  title: "Owner sign-in",
  robots: { index: false, follow: false },
};
export default function SignIn() {
  return (
    <main className="shell credits-page">
      <p className="eyebrow">ALMATY · OWNER WORKSPACE</p>
      <h1>Welcome back.</h1>
      <p>Use your approved owner email to receive a secure sign-in code.</p>
      <StaffSignIn />
      <a href="/">Return to the guide</a>
    </main>
  );
}
