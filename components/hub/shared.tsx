"use client";
import { useEffect, useState } from "react";
import { MountainSnow, ArrowUpRight } from "lucide-react";
import { LanguageSwitch, T, useT } from "./language";
export function HubHeader() {
  return (
    <header className="hub-header">
      <a className="brand" href="/">
        <MountainSnow size={30} />
        <span>
          almaty<span className="brand-dot">.</span>
          <small>WITH LOVE</small>
        </span>
      </a>
      <nav aria-label="Travel hub">
        <a href="/explore">
          <T>Explore</T>
        </a>
        <a href="/plan">
          <T>Plan your trip</T>
        </a>
        <a href="/account">
          <T>My plans</T>
        </a>
        <LanguageSwitch />
      </nav>
    </header>
  );
}
export function HubFooter() {
  return (
    <footer className="hub-footer">
      <a href="/">
        <T>Return to the guide</T>
      </a>
      <a href="/emergency">
        <T>Emergency help</T>
      </a>
      <a href="/privacy">
        <T>Privacy</T>
      </a>
      <a href="/admin/hub">
        <T>Travel desk</T>
      </a>
      <span>
        <T>Made with love in Almaty</T>
      </span>
    </footer>
  );
}
export async function api(path: string, data?: unknown, key?: string) {
  const r = await fetch(`/api/hub/${path}`, {
    method: data ? "POST" : "GET",
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "X-Plan-Key": key } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || "Please try again.");
  return result;
}
export function track(event: string, itemId?: string) {
  if (localStorage.getItem("almaty-analytics") === "yes")
    void api("analytics", { event, itemId, consent: true }).catch(() => {});
}
export function Consent() {
  const [shown, setShown] = useState(false);
  const t = useT();
  useEffect(() => {
    setShown(!localStorage.getItem("almaty-analytics"));
    if (localStorage.getItem("almaty-analytics") === "yes") track("visitor");
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  if (!shown) return null;
  return (
    <div
      className="hub-consent"
      role="region"
      aria-label={t("Optional analytics")}
    >
      <p>
        {t(
          "We use essential sign-in cookies and local storage for your plan. Optional anonymous analytics help us improve the guide.",
        )}
      </p>
      <div>
        <button
          onClick={() => {
            localStorage.setItem("almaty-analytics", "no");
            setShown(false);
          }}
        >
          {t("Essential only")}
        </button>
        <button
          className="button button-accent"
          onClick={() => {
            localStorage.setItem("almaty-analytics", "yes");
            track("visitor");
            setShown(false);
          }}
        >
          {t("Allow analytics")}
        </button>
        <a href="/privacy">{t("Privacy")}</a>
      </div>
    </div>
  );
}
export function Newsletter() {
  const [message, setMessage] = useState("");
  const t = useT();
  return (
    <section className="hub-newsletter">
      <div>
        <p className="eyebrow">A LITTLE LOCAL KNOWLEDGE</p>
        <h2>{t("Daily Almaty, in your inbox.")}</h2>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await api("newsletter", {
              email: f.get("email"),
              consent: f.get("consent") === "on",
            });
            setMessage(
              "Check your email to confirm. Email delivery requires the site’s configured sender.",
            );
          } catch (err) {
            setMessage((err as Error).message);
          }
        }}
      >
        <label>
          {t("Email")}
          <input required name="email" type="email" autoComplete="email" />
        </label>
        <label className="hub-checkbox">
          <input required type="checkbox" name="consent" />
          {t("I agree to receive the daily travel email.")}
        </label>
        <button className="button button-accent">
          {t("Subscribe")}
          <ArrowUpRight size={16} />
        </button>
        <p role="status">{message}</p>
      </form>
    </section>
  );
}
