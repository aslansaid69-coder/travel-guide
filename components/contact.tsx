"use client";
import { useState, type FormEvent } from "react";
import { ArrowUpRight, Check } from "lucide-react";
export function Contact() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
      "idle",
    ),
    [message, setMessage] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setState("sending");
    setMessage("");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setState("sent");
      setMessage("Thank you! Your message is on its way.");
      form.reset();
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "We could not send your message. Please try again.",
      );
    }
  }
  return (
    <form className="contact-form" onSubmit={submit}>
      <div className="form-row">
        <label>
          Your name
          <input
            autoComplete="name"
            name="name"
            required
            minLength={2}
            maxLength={100}
            placeholder="Alex"
          />
        </label>
        <label>
          Email address
          <input
            autoComplete="email"
            name="email"
            type="email"
            required
            maxLength={254}
            placeholder="you@example.com"
          />
        </label>
      </div>
      <label>
        A question, a tip, a little hello
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={4000}
          rows={3}
          placeholder="We’d love to hear from you…"
        />
      </label>
      <div className="honeypot" aria-hidden="true">
        <label>
          Leave this empty
          <input name="website" autoComplete="off" tabIndex={-1} />
        </label>
      </div>
      <div className="form-bottom">
        <span>We’ll only use your email to reply.</span>
        <button
          type="submit"
          disabled={state === "sending"}
          className="button button-accent"
        >
          {state === "sending" ? "Sending…" : "Send a little hello"}
          {state === "sent" ? <Check size={17} /> : <ArrowUpRight size={17} />}
        </button>
      </div>
      <p className={`form-status ${state}`} role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
