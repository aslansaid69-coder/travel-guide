"use client";
import { useState, type FormEvent } from "react";
import { createAuthClient } from "@neon/auth/next";
const client = createAuthClient();
export function StaffSignIn() {
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const result = sent
        ? await client.signIn.emailOtp({ email, otp: code })
        : await client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
      if (result.error)
        throw new Error(result.error.message || "Sign-in failed.");
      if (sent) window.location.assign("/account");
      else {
        setSent(true);
        setMessage("Check your email for a sign-in code.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="contact-form staff-login">
      <label>
        Email
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          disabled={sent}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {sent && (
        <label>
          Verification code
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
      )}
      <button disabled={pending} className="button button-accent">
        {pending ? "Please wait…" : sent ? "Sign in" : "Send sign-in code"}
      </button>
      <p role="status">{message}</p>
      {sent && (
        <button
          type="button"
          onClick={() => {
            setSent(false);
            setCode("");
          }}
        >
          Use another email
        </button>
      )}
    </form>
  );
}
