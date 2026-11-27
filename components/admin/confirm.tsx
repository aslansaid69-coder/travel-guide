"use client";
import { useFormStatus } from "react-dom";

/** Submit button that asks for confirmation before destructive actions. */
export function ConfirmButton({
  children,
  message = "Are you sure? This cannot be undone.",
  variant = "danger",
  name,
  value,
}: {
  children: React.ReactNode;
  message?: string;
  variant?: "danger" | "primary" | "default";
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className="admin-button"
      data-variant={variant === "default" ? undefined : variant}
      disabled={pending}
      name={name}
      value={value}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  name,
  value,
}: {
  children: React.ReactNode;
  variant?: "primary" | "default";
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className="admin-button"
      data-variant={variant === "default" ? undefined : variant}
      disabled={pending}
      name={name}
      value={value}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
