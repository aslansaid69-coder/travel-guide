"use client";
import Link from "next/link";
import { MapPinned, Calculator, UserRound, CreditCard, MessageCircle } from "lucide-react";
import { T } from "@/components/hub/language";

/** Homepage block that introduces the tour builder and the assistant. */
export function HomeTour() {
  const steps = [
    { icon: MapPinned, en: "Pick 3–4 places", ru: "Выберите 3–4 места", kk: "3–4 орын таңдаңыз" },
    { icon: Calculator, en: "See the approximate price and route", ru: "Узнайте примерную цену и маршрут", kk: "Шамамен баға мен бағытты көріңіз" },
    { icon: UserRound, en: "Choose your local guide", ru: "Выберите гида", kk: "Гидті таңдаңыз" },
    { icon: CreditCard, en: "Confirm and pay online", ru: "Подтвердите и оплатите онлайн", kk: "Растап, онлайн төлеңіз" },
  ];
  return (
    <section id="build" className="section home-tour">
      <div className="shell">
        <p className="eyebrow">
          <T ru="КОНСТРУКТОР ТУРА" kk="ТУР ҚҰРАСТЫРУШЫ">TOUR BUILDER</T>
        </p>
        <h2>
          <T ru="Соберите свой тур за 2 минуты." kk="Туріңізді 2 минутта құрастырыңыз.">
            Build your own tour in 2 minutes.
          </T>
        </h2>
        <p className="section-intro">
          <T
            ru="Честная цена с разбивкой ещё до брони: билеты, транспорт, гид и комиссия. Ориентировочная цена, итог может отличаться."
            kk="Брондауға дейін бағаның толық құрамы: билеттер, көлік, гид және қызмет ақысы."
          >
            A transparent price before you book: tickets, transport, guide and service fee. Approximate — the final amount may differ.
          </T>
        </p>
        <ol className="home-tour-steps">
          {steps.map(({ icon: Icon, en, ru, kk }, i) => (
            <li key={en}>
              <span className="home-tour-num">{i + 1}</span>
              <Icon size={22} aria-hidden="true" />
              <strong>
                <T ru={ru} kk={kk}>
                  {en}
                </T>
              </strong>
            </li>
          ))}
        </ol>
        <div className="hero-actions">
          <Link href="/build" className="button button-accent">
            <T ru="Собрать тур" kk="Тур құрастыру">Build my tour</T>
          </Link>
          <span className="home-tour-hint">
            <MessageCircle size={16} aria-hidden="true" />{" "}
            <T ru="Или спросите помощника — кнопка «Спросить» внизу справа." kk="Немесе көмекшіден сұраңыз — төменгі оң жақтағы батырма.">
              Or ask our assistant — the “Ask a local” button, bottom right.
            </T>
          </span>
        </div>
      </div>
    </section>
  );
}
