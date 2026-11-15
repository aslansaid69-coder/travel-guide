"use client";
import { T, useT } from "@/components/hub/language";
import { useState, type FormEvent } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import site from "@/data/site.json";
import { createEmailDraft } from "@/lib/contact";
export function Contact() {
  const t = useT();
  const [state, setState] = useState<
      "idle" | "sending" | "sent" | "error" | "draft"
    >("idle"),
    [message, setMessage] = useState("");
  const [draft, setDraft] = useState("");
  const emailApp = site.contactMode === "email-app";
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (emailApp) {
      const href = createEmailDraft(site.contactEmail, data);
      if (!href) {
        setState("error");
        setMessage("Please check your name, email, and message.");
        return;
      }
      setDraft(href);
      setState("draft");
      setMessage(
        "Your draft is ready. Open it in your email app, review it, and send when you’re ready.",
      );
      return;
    }
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
    <form
      className="contact-form"
      onSubmit={submit}
      onChange={() => {
        if (draft) {
          setDraft("");
          setState("idle");
          setMessage("");
        }
      }}
    >
      <div className="form-row">
        <label>
          <T ru="Ваше имя">Your name</T>
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
          <T ru="Электронная почта">Email address</T>
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
        <T ru="Вопрос, совет или просто приветствие">
          A question, a tip, a little hello
        </T>
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
        <span>
          {emailApp
            ? t("Prepare a draft in your own email app.")
            : "We’ll only use your email to reply."}
        </span>
        <button
          type="submit"
          disabled={state === "sending"}
          className="button button-accent"
        >
          {state === "sending"
            ? "Sending…"
            : emailApp
              ? t("Prepare email")
              : "Send a little hello"}
          {state === "sent" ? <Check size={17} /> : <ArrowUpRight size={17} />}
        </button>
      </div>
      <p className={`form-status ${state}`} role="status" aria-live="polite">
        {t(message)}
      </p>
      {draft && (
        <div className="email-draft">
          <a className="button button-outline" href={draft}>
            <T ru="Открыть черновик письма">Open email draft</T>
            <ArrowUpRight size={16} />
          </a>
          <span>
            Or write to{" "}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.
          </span>
        </div>
      )}
    </form>
  );
}
