"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { Camera } from "@/lib/cameras/types";
import { createAuthClient } from "@neon/auth/next";
type Check = {
  camera_id: string;
  checked_at: string;
  ok: boolean;
  reason: string;
};
export function CameraAdmin() {
  const [jobs, setJobs] = useState<
    { id: string; status: string; started_at: string }[]
  >([]);
  const [cameras, setCameras] = useState<Camera[]>([]),
    [checks, setChecks] = useState<Check[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function reload() {
    const response = await fetch("/api/admin/cameras", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load owner data.");
    const data = await response.json();
    setCameras(data.cameras);
    setChecks(data.checks);
    setJobs(data.jobs);
  }
  useEffect(() => {
    void reload().catch((e) => setMessage(e.message));
  }, []);
  async function action(payload: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/cameras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await reload();
      setMessage(data.skipped ? data.reason : "Saved and checked.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    if (
      await action({
        ...fields,
        action: "add",
        permissionConfirmed: fields.permissionConfirmed === "on",
      })
    )
      form.reset();
  }
  return (
    <>
      <div className="admin-actions">
        <button
          disabled={busy}
          className="button button-accent"
          onClick={() => action({ action: "check" })}
        >
          Run camera check
        </button>
        <a href="/">Open guide</a>
        <button
          onClick={async () => {
            await createAuthClient().signOut();
            window.location.assign("/auth/sign-in");
          }}
        >
          Sign out
        </button>
      </div>
      <p role="status" className="admin-message">
        {message}
      </p>
      <div className="admin-camera-list">
        {cameras.map((c) => (
          <article key={c.id}>
            <div>
              <h2>{c.name}</h2>
              <p>
                <strong>{c.status}</strong> · {c.failures} consecutive failures
                {c.manualHidden ? " · Manually hidden" : ""}
              </p>
              <p>
                Last check:{" "}
                {c.lastCheck ? new Date(c.lastCheck).toLocaleString() : "Never"}
              </p>
              <p>{c.reason || "No detected issues."}</p>
              <small>{c.streamUrl}</small>
            </div>
            <button
              disabled={busy || c.blocked}
              className="button button-outline"
              onClick={() =>
                action({ action: c.manualHidden ? "show" : "hide", id: c.id })
              }
            >
              {c.manualHidden ? "Validate & show" : "Hide"}
            </button>
          </article>
        ))}
      </div>
      <h2>Add a direct HLS camera</h2>
      <p>
        Only approved HTTPS hosts are accepted. A new host requires
        CAMERA_ALLOWED_HOSTS in the server environment. Every new camera is
        checked before publication.
      </p>
      <form onSubmit={add} className="contact-form admin-add">
        <div className="form-row">
          <label>
            Camera name
            <input name="name" required maxLength={150} />
          </label>
          <label>
            Location
            <input name="location" required maxLength={200} />
          </label>
        </div>
        <label>
          HLS stream URL
          <input
            type="url"
            name="streamUrl"
            placeholder="https://ipcam.kz/…/index.m3u8"
            required
          />
        </label>
        <div className="form-row">
          <label>
            Credit/source name
            <input name="sourceName" required />
          </label>
          <label>
            Credit/source URL
            <input type="url" name="sourceUrl" required />
          </label>
        </div>
        <label>
          Embedding permission or licence note
          <textarea name="permissionNote" required minLength={2} />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" name="permissionConfirmed" required />
          The operator permits this stream to be embedded here.
        </label>
        <button disabled={busy} className="button button-accent">
          Validate & publish
        </button>
      </form>
      <h2>Monitor runs</h2>
      <p>
        Target schedule: every 15 minutes. GitHub can delay scheduled runs. Run
        camera check is limited to one counted check per window.
      </p>
      <div className="admin-checks">
        {jobs.map((job) => (
          <p key={job.id}>
            {new Date(job.started_at).toLocaleString()} · {job.status}
          </p>
        ))}
      </div>
      <h2>Recent checks</h2>
      <div className="admin-checks">
        {checks.map((check, i) => (
          <p key={i}>
            <time>{new Date(check.checked_at).toLocaleString()}</time> ·{" "}
            {check.camera_id} · {check.ok ? "Passed" : "Failed"}
            <br />
            {check.reason}
          </p>
        ))}
      </div>
    </>
  );
}
