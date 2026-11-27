"use client";
import { useActionState } from "react";
import { postReview, type ReviewState } from "@/app/places/[slug]/actions";
import { useLanguage, pick } from "@/components/hub/language";

export function ReviewForm({ placeId, slug, defaultName }: { placeId: string; slug: string; defaultName: string }) {
  const { lang } = useLanguage();
  const [state, action, pending] = useActionState<ReviewState, FormData>(postReview, { ok: false, message: "" });
  if (state.ok) return <p className="review-verified" role="status">{state.message}</p>;
  return (
    <form action={action} className="tour-form">
      <input type="hidden" name="placeId" value={placeId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="language" value={lang} />
      <div className="row">
        <label>
          {pick(lang, { en: "Your name", ru: "Ваше имя", kk: "Атыңыз" })}
          <input name="authorName" defaultValue={defaultName} required minLength={2} maxLength={80} />
        </label>
        <label>
          {pick(lang, { en: "Rating", ru: "Оценка", kk: "Баға" })}
          <select name="rating" defaultValue="5">
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        {pick(lang, { en: "Title (optional)", ru: "Заголовок (необязательно)", kk: "Тақырып (міндетті емес)" })}
        <input name="title" maxLength={120} />
      </label>
      <label>
        {pick(lang, { en: "Your review", ru: "Ваш отзыв", kk: "Пікіріңіз" })}
        <textarea name="body" rows={4} required minLength={20} maxLength={3000} />
      </label>
      {state.message && <p role="alert">{state.message}</p>}
      <button className="button button-accent" disabled={pending}>
        {pending ? "…" : pick(lang, { en: "Send review", ru: "Отправить отзыв", kk: "Пікір жіберу" })}
      </button>
    </form>
  );
}
