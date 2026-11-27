import Link from "next/link";
export default function NotFound() {
  return (
    <main className="shell credits-page">
      <p className="eyebrow">A SMALL DETOUR</p>
      <h1>This path doesn’t go anywhere.</h1>
      <p>Let’s get you back to the mountains.</p>
      <Link className="button button-accent" href="/">
        Back to Almaty
      </Link>
    </main>
  );
}
