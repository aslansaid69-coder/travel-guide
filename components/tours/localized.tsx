"use client";
import { pick, useLanguage } from "@/components/hub/language";

/** Renders the best translation for the visitor's language (kk → ru → en fallback). */
export function Localized({ en, ru, kk, as: Tag = "span", className }: {
  en: string;
  ru?: string;
  kk?: string;
  as?: "span" | "p" | "h1" | "h2" | "strong";
  className?: string;
}) {
  const { lang } = useLanguage();
  return <Tag className={className}>{pick(lang, { en, ru, kk })}</Tag>;
}
