import { HubHeader, HubFooter } from "@/components/hub/shared";
import { T } from "@/components/hub/language";
export const metadata = {
  title: "Emergency help in Almaty",
  alternates: { canonical: "/emergency" },
};
export default function Emergency() {
  return (
    <>
      <HubHeader />
      <main id="main" className="hub-page hub-prose">
        <p className="eyebrow">KEEP THIS CLOSE</p>
        <h1>
          <T>Emergency help</T>
        </h1>
        <p>
          <T ru="При непосредственной опасности звоните 112. Сохраните адрес проживания и отправьте своё местоположение диспетчеру.">
            For immediate danger, call 112. Keep your accommodation address
            handy and share your exact location with the dispatcher.
          </T>
        </p>
        <div className="hub-emergency-grid">
          {[
            ["112", "Emergency & rescue", "Экстренные службы"],
            ["103", "Ambulance", "Скорая помощь"],
            ["102", "Police", "Полиция"],
          ].map(([number, en, ru]) => (
            <a className="hub-panel" href={`tel:${number}`} key={number}>
              <strong>{number}</strong>
              <span>
                <T ru={ru}>{en}</T>
              </span>
            </a>
          ))}
        </div>
        <p className="hub-caption">
          Numbers verified against{" "}
          <a
            href="https://www.gov.kz/article/19305?lang=en"
            target="_blank"
            rel="noopener noreferrer"
          >
            Kazakhstan government information
          </a>{" "}
          on 16 November 2026.
        </p>
        <h2>
          <T ru="Медицинская помощь и аптеки">Medical care & pharmacies</T>
        </h2>
        <p>
          <T ru="В экстренной ситуации звоните 103. Для неэкстренной помощи попросите отель или страховщика подобрать подходящую клинику. Список на карте не гарантирует наличие нужных услуг или круглосуточную работу.">
            For an emergency, call 103. For non-emergency care, ask your
            accommodation or insurer to help find an appropriate clinic. A map
            listing does not guarantee suitable care or 24-hour opening.
          </T>
        </p>
        <div className="hub-inline-actions">
          <a
            href="https://www.google.com/maps/search/?api=1&query=hospital+Almaty"
            target="_blank"
            rel="noopener noreferrer"
          >
            Hospitals on Google Maps ↗
          </a>
          <a
            href="https://www.google.com/maps/search/?api=1&query=24+hour+pharmacy+Almaty"
            target="_blank"
            rel="noopener noreferrer"
          >
            Pharmacies on Google Maps ↗
          </a>
        </div>
        <h2>
          <T ru="Посольство и транспорт">Embassy & transport</T>
        </h2>
        <p>
          <T ru="Контакты посольства или консульства уточняйте на сайте министерства иностранных дел вашей страны. Не все посольства находятся в Алматы. Для обычных поездок используйте официальное приложение такси или попросите отель вызвать машину.">
            Use your home country’s foreign ministry website for current embassy
            or consulate contacts. Not every embassy is in Almaty. For ordinary
            travel, use an established taxi app or ask your accommodation to
            arrange a car.
          </T>
        </p>
        <a
          href="https://www.gov.kz/memleket/entities/mfa?lang=en"
          target="_blank"
          rel="noopener noreferrer"
        >
          Kazakhstan Ministry of Foreign Affairs ↗
        </a>
        <h2>
          <T ru="В горах">In the mountains</T>
        </h2>
        <p>
          <T ru="Городской прогноз не отражает условия на высоте. Сообщите близким маршрут и время возвращения. При потере пути или травме звоните 112 и сообщите координаты.">
            City weather does not describe conditions at altitude. Tell someone
            your route and return time. If lost or injured, call 112 and give
            your coordinates.
          </T>
        </p>
      </main>
      <HubFooter />
    </>
  );
}
