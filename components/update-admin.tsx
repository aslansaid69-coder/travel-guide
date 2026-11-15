"use client";
import { useEffect, useState } from "react";
import type { Snapshot } from "@/lib/updates/types";
type Dashboard = {
  sources: Snapshot[];
  runs: {
    id: string;
    job: string;
    started_at: string;
    status: string;
    summary: unknown;
  }[];
  results: {
    run_id: string;
    source_key: string;
    status: string;
    reason: string;
  }[];
  alerts: {
    id: string;
    subject: string;
    status: string;
    attempts: number;
    last_error: string | null;
  }[];
  emailAlertsConfigured: boolean;
};
const time = (s: string | null) =>
  s ? new Date(s).toLocaleString() : "No successful refresh yet";
export function UpdateAdmin() {
  const [data, setData] = useState<Dashboard | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await fetch("/api/admin/updates", { cache: "no-store" });
    if (!r.ok) throw new Error("Unable to load update history.");
    setData(await r.json());
  }
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, []);
  async function run() {
    setBusy(true);
    setMessage("Refreshing sources…");
    try {
      const r = await fetch("/api/admin/updates", { method: "POST" });
      const result = await r.json();
      await load();
      setMessage(
        result.skipped
          ? "This five-minute manual window has already been run."
          : result.busy
            ? "Another update is running; try again shortly."
            : r.ok
              ? "Update finished. See each source below."
              : "Some sources failed; previous content retained.",
      );
    } catch {
      setMessage("Update could not finish. Previous content retained.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="admin-actions">
        <button className="button button-accent" disabled={busy} onClick={run}>
          {busy ? "Updating…" : "Run update now"}
        </button>
        <a href="/admin/cameras">Cameras</a>
        <a href="/">Open guide</a>
      </div>
      <p role="status">{message}</p>
      {data && (
        <>
          <p className="admin-config-note">
            Email failure alerts:{" "}
            {data.emailAlertsConfigured
              ? "configured"
              : "needs RESEND_API_KEY, ALERT_FROM and ALERT_TO in Vercel"}
            . Alerts are created after two consecutive failed runs and
            deduplicated until recovery.
          </p>
          <h2>Sources</h2>
          <div className="update-source-grid">
            {data.sources.map((s) => (
              <article key={s.key}>
                <p className="eyebrow">{s.kind}</p>
                <h3>{s.label}</h3>
                <p>
                  <strong>{s.status.replaceAll("_", " ")}</strong> ·{" "}
                  {s.failures} consecutive failures
                </p>
                <p>Last good refresh: {time(s.lastSuccess)}</p>
                <p>Last attempt: {time(s.lastAttempt)}</p>
                {s.error && <p>{s.error}</p>}
              </article>
            ))}
          </div>
          <h2>Recent runs</h2>
          <div className="admin-checks">
            {data.runs.map((run) => (
              <details key={run.id}>
                <summary>
                  {time(run.started_at)} · {run.job} ·{" "}
                  <strong>{run.status.replaceAll("_", " ")}</strong>
                </summary>
                {data.results
                  .filter((r) => r.run_id === run.id)
                  .map((r) => (
                    <p key={r.source_key}>
                      {r.source_key} · {r.status}
                      <br />
                      {r.reason}
                    </p>
                  ))}
              </details>
            ))}
          </div>
          <h2>Email alerts</h2>
          <div className="admin-checks">
            {data.alerts.length ? (
              data.alerts.map((alert) => (
                <p key={alert.id}>
                  <strong>{alert.subject}</strong>
                  <br />
                  {alert.status} · {alert.attempts} delivery attempts
                  {alert.last_error && (
                    <>
                      <br />
                      {alert.last_error}
                    </>
                  )}
                </p>
              ))
            ) : (
              <p>No failure alerts.</p>
            )}
          </div>
        </>
      )}
    </>
  );
}
