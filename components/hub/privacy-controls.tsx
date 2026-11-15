"use client";
import { useState, useEffect } from "react";
import { api } from "./shared";
export function PrivacyControls() {
  const [subscriber, setSubscriber] = useState(""),
    [token, setToken] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setSubscriber(q.get("subscriber") || "");
    setToken(q.get("token") || "");
  }, []);
  return (
    <section className="hub-panel">
      <h2>Your choices</h2>
      <button
        onClick={() => {
          localStorage.setItem("almaty-analytics", "no");
          setMessage("Optional analytics are disabled.");
        }}
      >
        Disable optional analytics
      </button>
      <button
        onClick={() => {
          localStorage.removeItem("almaty-draft");
          setMessage(
            "The local draft has been cleared. Saved server plans are unchanged.",
          );
        }}
      >
        Clear local draft
      </button>
      {subscriber && token && (
        <div className="hub-inline-actions">
          <button
            onClick={() =>
              void api("newsletter", {
                action: "confirm",
                id: subscriber,
                token,
              })
                .then(() => setMessage("Your daily digest is confirmed."))
                .catch((e) => setMessage(e.message))
            }
          >
            Confirm daily digest
          </button>
          <button
            onClick={() =>
              void api("newsletter", {
                action: "unsubscribe",
                id: subscriber,
                token,
              })
                .then(() => setMessage("You are unsubscribed."))
                .catch((e) => setMessage(e.message))
            }
          >
            Unsubscribe
          </button>
        </div>
      )}
      <p role="status">{message}</p>
      <p>
        For access, correction or deletion of server records, contact{" "}
        <a href="mailto:aslansaid69@gmail.com">aslansaid69@gmail.com</a> from
        the email used for your request. To stop the digest without your
        preference link, email the same address.
      </p>
    </section>
  );
}
