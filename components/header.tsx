"use client";
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
          <a href="#live">
            <span className="tiny-dot" />
            Live Almaty
          </a>
          <a href="#events">Events</a>
          <a href="#places">Places</a>
          <a href="#tips">Travel tips</a>
        </nav>
        <a className="nav-cta" href="#places">
          Find your Almaty <ArrowUpRight size={17} />
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
            <a key={id} href={`#${id}`} onClick={() => setOpen(false)}>
              {label}
              <ArrowUpRight size={18} />
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
