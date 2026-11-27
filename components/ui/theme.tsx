"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const next = localStorage.getItem("almaty-theme") === "dark";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- theme lives in localStorage, readable only after hydration
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
  }, []);
  return (
    <button
      className="theme-toggle"
      aria-label={dark ? "Use light mode" : "Use dark mode"}
      aria-pressed={dark}
      onClick={() => {
        const next = !dark;
        setDark(next);
        localStorage.setItem("almaty-theme", next ? "dark" : "light");
        document.documentElement.dataset.theme = next ? "dark" : "light";
      }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
      <span>{dark ? "Light" : "Dark"}</span>
    </button>
  );
}
