import { settings } from "@/lib/hub/store";
import { ArrowUpRight, Route, CalendarDays, Sparkles } from "lucide-react";
import { T } from "./language";
export async function HubTeaser() {
  const content = await settings().catch(() => null);
  return (
    <section className="hub-teaser">
      <div className="shell">
        <div>
          <p className="eyebrow">A LITTLE STRUCTURE. PLENTY OF DISCOVERY.</p>
          <h2>
            <T>Your Almaty, your way.</T>
          </h2>
          <p>
            <T
              ru={
                content?.welcomeRu ||
                "Соберите маршрут из любимых мест, проверьте погоду и попросите нашу команду помочь с деталями."
              }
            >
              {content?.welcomeEn ||
                "Build a day around what you love, check the weather, and let our team help with the details."}
            </T>
          </p>
          <a className="button button-accent" href="/plan">
            <T>Start planning</T>
            <ArrowUpRight size={18} />
          </a>
          <a className="hub-teaser-secondary" href="/explore">
            <T>Explore</T> ↗
          </a>
        </div>
        <div className="hub-teaser-note">
          <span>
            <CalendarDays size={20} />
            <T ru="От одного дня до двух недель">One day or two weeks</T>
          </span>
          <span>
            <Route size={20} />
            <T ru="Маршрут, который можно менять">
              A plan you can make your own
            </T>
          </span>
          <span>
            <Sparkles size={20} />
            <T ru="Помощь местной команды">A little help from a local team</T>
          </span>
        </div>
      </div>
    </section>
  );
}
