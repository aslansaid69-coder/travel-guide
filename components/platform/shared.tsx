"use client";
import { useState, useEffect, useCallback } from "react";
import { HubHeader, HubFooter } from "@/components/hub/shared";
import { useLanguage } from "@/components/hub/language";
export async function platform(path: string, data?: unknown, key?: string) {
  const r = await fetch("/api/platform/" + path, {
    method: data ? "POST" : "GET",
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "X-Plan-Key": key } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
    cache: "no-store",
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || "Please try again.");
  return result;
}
export function usePrivate() {
  const [access, set] = useState({ ready: false, key: "", planId: "" });
  useEffect(() => {
    const q = new URLSearchParams(location.search),
      f = new URLSearchParams(location.hash.slice(1)),
      planId = q.get("plan") || "",
      key =
        f.get("edit") ||
        (planId ? localStorage.getItem(`almaty-key-${planId}`) : "") ||
        "";
    if (key && planId) localStorage.setItem(`almaty-key-${planId}`, key);
    if (f.has("edit"))
      history.replaceState(null, "", location.pathname + location.search);
    set({ ready: true, key, planId });
  }, []);
  return access;
}
export function useResource(
  path: string,
  key?: string,
  ready = true,
  initial: any = null,
) {
  const [data, setData] = useState<any>(initial),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await platform(path, undefined, key));
    } catch (e) {
      setMessage((e as Error).message);
    }
  }, [path, key]);
  useEffect(() => {
    if (ready) void load();
  }, [load, ready]);
  const run = async (input: unknown) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await platform(path, input, key);
      if (result.planId && result.editToken)
        localStorage.setItem(`almaty-key-${result.planId}`, result.editToken);
      if (result.url && !(input as any)?.stay) {
        window.location.assign(result.url);
        return result;
      }
      await load();
      setMessage(result.message || "Saved.");
      return result;
    } catch (e) {
      setMessage((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { data, message, busy, load, run, setMessage };
}
export function Shell({
  title,
  kicker = "ALMATY, WITH LOVE",
  intro,
  children,
  admin = false,
}: {
  title: string;
  kicker?: string;
  intro?: string;
  children: React.ReactNode;
  admin?: boolean;
}) {
  return (
    <>
      <HubHeader />
      <main id="main" className="hub-page platform-page">
        <div className="platform-heading">
          <p className="eyebrow">{kicker}</p>
          <h1>{title}</h1>
          {intro && <p>{intro}</p>}
        </div>
        {admin && (
          <nav className="platform-subnav" aria-label="Owner tools">
            <a href="/admin/hub">Requests & catalog</a>
            <a href="/admin/research">Internet research</a>
            <a href="/admin/guides">Guides</a>
            <a href="/admin/payments">Payments & operations</a>
            <a href="/admin/updates">Update log</a>
            <a href="/admin/cameras">Cameras</a>
          </nav>
        )}
        {children}
      </main>
      <HubFooter />
    </>
  );
}
export function Status({ message, busy }: { message: string; busy?: boolean }) {
  return (
    <p role="status" aria-live="polite" className="platform-status">
      {busy ? "Working…" : message}
    </p>
  );
}
export function Money({
  amount,
  currency = "KZT",
}: {
  amount: number;
  currency?: string;
}) {
  return (
    <>
      {new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
        Number(amount || 0) / 100,
      )}
    </>
  );
}
export function Button({
  children,
  busy,
  primary = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      {...props}
      className={`button ${primary ? "button-accent" : "button-outline"} ${props.className || ""}`}
      disabled={busy || props.disabled}
      aria-busy={busy || undefined}
    >
      {busy && <span className="control-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="platform-empty">{children}</div>;
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="platform-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function PrivatePhoto({
  id,
  requestId,
  accessKey,
  caption,
}: {
  id: string;
  requestId: string;
  accessKey: string;
  caption?: string;
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let value = "",
      live = true;
    void fetch(`/api/platform/trip/${requestId}/asset?asset=${id}`, {
      headers: accessKey ? { "X-Plan-Key": accessKey } : {},
    }).then(async (r) => {
      if (!r.ok) return;
      value = URL.createObjectURL(await r.blob());
      if (live) setSrc(value);
      else URL.revokeObjectURL(value);
    });
    return () => {
      live = false;
      if (value) URL.revokeObjectURL(value);
    };
  }, [id, requestId, accessKey]);
  return src ? (
    <figure>
      <a href={src} download="almaty-trip-photo.jpg">
        <img loading="lazy" src={src} alt={caption || "Private tour photo"} />
      </a>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  ) : (
    <p>Loading private photo…</p>
  );
}
export async function downloadPrivate(path: string, key: string, name: string) {
  const r = await fetch("/api/platform/" + path, {
    headers: key ? { "X-Plan-Key": key } : {},
  });
  if (!r.ok)
    throw new Error(
      "Download unavailable. Open the private booking link first.",
    );
  const url = URL.createObjectURL(await r.blob()),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}
export function LocalText({ en, ru }: { en: string; ru: string }) {
  const { lang } = useLanguage();
  return <>{lang === "ru" ? ru : en}</>;
}
