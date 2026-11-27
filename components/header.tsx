"use client";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme";
import { T, LanguageSwitch } from "@/components/hub/language";
import { useState } from "react";
import { MountainSnow, ArrowUpRight, Menu, X } from "lucide-react";
export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="shell nav-wrap">
        <Link href="/" className="brand" aria-label="Almaty with love home">
          <MountainSnow size={33} strokeWidth={1.4} />
          <span>
            almaty<span className="brand-dot">.</span>
            <small>WITH LOVE</small>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <Link href="/#live">
            <span className="tiny-dot" />
            <T>Live Almaty</T>
          </Link>
          <Link href="/#events">
            <T>Events</T>
          </Link>
          <Link href="/#places">
            <T>Places</T>
          </Link>
          <Link href="/#tips">
            <T>Travel tips</T>
          </Link>
          <a href="/explore">
            <T>Explore</T>
          </a>
          <LanguageSwitch /><ThemeToggle/>
        </nav>
        <Link className="nav-cta" href="/build">
          <T ru="Собрать тур">Build a tour</T> <ArrowUpRight size={17} />
        </Link>
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
