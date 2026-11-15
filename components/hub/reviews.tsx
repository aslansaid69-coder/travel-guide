"use client";
import { useEffect, useState } from "react";
import { api } from "./shared";
import { T } from "./language";
export function Reviews() {
  const [reviews, setReviews] = useState<
    { rating: number; body: string; created_at: string }[]
  >([]);
  useEffect(() => {
    void api("reviews")
      .then((d) => setReviews(d.reviews))
      .catch(() => {});
  }, []);
  if (!reviews.length) return null;
  return (
    <section className="hub-reviews">
      <p className="eyebrow">FROM PEOPLE WHO HAVE BEEN HERE</p>
      <h2>
        <T ru="Воспоминания о поездке.">A few travel memories.</T>
      </h2>
      <div className="hub-admin-catalog">
        {reviews.map((r, i) => (
          <article className="hub-panel" key={i}>
            <span aria-label={`${r.rating} out of 5 stars`}>
              {"★".repeat(r.rating)}
            </span>
            <p>{r.body}</p>
            <small>{new Date(r.created_at).toLocaleDateString()}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
