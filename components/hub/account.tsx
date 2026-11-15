"use client";
import { createAuthClient } from "@neon/auth/next";
import { useEffect, useState } from "react";
import { api } from "./shared";
import { useT } from "./language";
export function Account() {
  const [plans, setPlans] = useState<any[]>([]),
    [message, setMessage] = useState("");
  const t = useT();
  useEffect(() => {
    void api("account")
      .then((d) => setPlans(d.plans))
      .catch((e) => setMessage(e.message));
  }, []);
  return (
    <>
      <div className="hub-page-heading">
        <p className="eyebrow">YOUR ALMATY STORIES</p>
        <h1>{t("Saved plans")}</h1>
        <p role="status">{message}</p>
        <a className="button button-outline" href="/auth/sign-in">
          {t("Sign in")}
        </a>
      </div>
      <div className="hub-admin-catalog">
        {plans.map((p) => (
          <article className="hub-panel" key={p.id}>
            <p className="eyebrow">{p.start_date}</p>
            <h2>{p.title}</h2>
            <a href={`/trip/${p.id}`}>{t("Current plan")} ↗</a>
          </article>
        ))}
      </div>
      <button
        onClick={async () => {
          const result = await createAuthClient().signOut();
          if (result.error)
            setMessage(result.error.message || "Sign out failed.");
          else window.location.assign("/");
        }}
      >
        Sign out
      </button>
      <p className="hub-caption">
        Link a plan to your account from the itinerary editor. Plans made
        anonymously stay on your device until you save them.
      </p>
    </>
  );
}
