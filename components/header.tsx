"use client";
import { ThemeToggle } from "@/components/ui/theme";
import { T, LanguageSwitch } from "@/components/hub/language";
import { useState } from "react";
import { MountainSnow, ArrowUpRight, Menu, X } from "lucide-react";
export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="shell nav-wrap">
        <a href="/" className="brand" aria-label="Almaty with love home">
          <MountainSnow size={33} strokeWidth={1.4} />
          <span>
            almaty<span className="brand-dot">.</span>
            <small>WITH LOVE</small>
          </span>
        </a>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="/#live">
            <span className="tiny-dot" />
            <T>Live Almaty</T>
          </a>
          <a href="/#events">
            <T>Events</T>
          </a>
          <a href="/#places">
            <T>Places</T>
          </a>
          <a href="/#tips">
            <T>Travel tips</T>
          </a>
          <a href="/explore">
            <T>Explore</T>
          </a>
          <LanguageSwitch /><ThemeToggle/>
        </nav>
        <a className="nav-cta" href="/plan">
          <T>Plan your trip</T> <ArrowUpRight size={17} />
        </a>
        <button
          className="menu-button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <nav
          id="mobile-nav"
          className="mobile-nav"
          aria-label="Mobile navigation"
        >
          {[
            ["live", "Live Almaty"],
            ["events", "Events"],
            ["places", "Places"],
            ["tips", "Travel tips"],
          ].map(([id, label]) => (
            <a key={id} href={`/#${id}`} onClick={() => setOpen(false)}>
              {label}
              <ArrowUpRight size={18} />
            </a>
          ))}
          <a href="/plan" onClick={() => setOpen(false)}>
            <T>Plan your trip</T>
          </a>
          <a href="/explore" onClick={() => setOpen(false)}>
            <T>Explore</T>
          </a>
          <LanguageSwitch /><ThemeToggle/>
        </nav>
      )}
    </header>
  );
}
