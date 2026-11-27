"use client";
import extra from "./ru-extra.json";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
const words: Record<string, string> = {
  Explore: "Места",
  "Plan your trip": "Спланировать поездку",
  "My plans": "Мои планы",
  "Travel desk": "Команда",
  "Live Almaty": "Алматы сейчас",
  Events: "События",
  Places: "Места",
  "Travel tips": "Советы",
  "Emergency help": "Экстренная помощь",
  Privacy: "Конфиденциальность",
  "Start planning": "Начать планирование",
  "Your Almaty, your way.": "Ваш Алматы. Ваш маршрут.",
  "A little structure. Plenty of discovery.":
    "Немного планирования. Много открытий.",
  "Build a day around what you love.": "Проведите день так, как нравится вам.",
  All: "Все",
  mountains: "Горы",
  viewpoint: "Смотровые площадки",
  park: "Парки",
  museum: "Музеи",
  market: "Рынки",
  restaurant: "Рестораны",
  cafe: "Кафе",
  shop: "Магазины",
  activity: "Развлечения",
  transfer: "Трансферы",
  rental: "Аренда",
  beach: "Пляжи",
  "Search places": "Поиск мест",
  "Open now": "Открыто сейчас",
  "Closed now": "Сейчас закрыто",
  "Hours unverified": "Часы не подтверждены",
  "Add to plan": "Добавить в план",
  "Google Maps": "Google Карты",
  "Get directions": "Проложить маршрут",
  "View menu": "Посмотреть меню",
  "Price to confirm": "Цена уточняется",
  Estimate: "Оценка",
  "Confirmed price": "Подтверждённая цена",
  "From the menu": "По меню",
  "per person": "на человека",
  "Distance from centre": "Расстояние от центра",
  "Visit duration": "Длительность визита",
  Map: "Карта",
  List: "Список",
  "Load interactive map": "Загрузить интерактивную карту",
  "Map tiles are provided by OpenStreetMap.":
    "Картографические данные предоставлены OpenStreetMap.",
  "Create your itinerary": "Создайте свой маршрут",
  "Start with four quick choices, or make a blank canvas.":
    "Четыре простых вопроса — или начните с пустого маршрута.",
  Days: "Дней",
  Guests: "Гостей",
  Interests: "Интересы",
  Budget: "Бюджет",
  Easy: "Экономный",
  Balanced: "Средний",
  Premium: "Премиум",
  "Generate my plan": "Составить маршрут",
  "Start empty": "Пустой маршрут",
  "Start date": "Дата начала",
  Adults: "Взрослые",
  Children: "Дети",
  Day: "День",
  Catalog: "Каталог",
  "Save & share": "Сохранить и поделиться",
  "Save changes": "Сохранить изменения",
  "PDF export": "Скачать PDF",
  "Email me my plan": "Отправить план на почту",
  "Save in my account": "Сохранить в аккаунте",
  "Copy share link": "Скопировать ссылку",
  "Copy private edit link": "Скопировать приватную ссылку",
  "Only share your edit link with someone you trust.":
    "Передавайте ссылку редактирования только тем, кому доверяете.",
  "Start time": "Время начала",
  Minutes: "Минут",
  "Move up": "Выше",
  "Move down": "Ниже",
  Remove: "Удалить",
  "Suggest replacement": "Предложить замену",
  "Move to day": "Перенести на день",
  "No stops yet. Add a place from the catalog.":
    "Пока пусто. Добавьте место из каталога.",
  "Live price estimate": "Предварительная стоимость",
  "Total priced portion": "Учтённая стоимость",
  "Per person": "На человека",
  "Unpriced items": "Позиции без цены",
  "Estimate only; the final price is confirmed by our team.":
    "Это предварительный расчёт; окончательную цену подтвердит наша команда.",
  "Book this itinerary": "Забронировать маршрут",
  "Ask a manager to adjust it": "Попросить менеджера изменить",
  Name: "Имя",
  Email: "Электронная почта",
  Phone: "Телефон",
  Language: "Язык",
  Allergies: "Аллергии",
  "Accessibility needs": "Особые потребности",
  Message: "Сообщение",
  "Send request": "Отправить запрос",
  "Send message": "Отправить сообщение",
  "Request sent": "Заявка отправлена",
  "Messages & final quote": "Сообщения и окончательная цена",
  "Approve quote": "Подтвердить предложение",
  "Pay deposit": "Внести депозит",
  "Pay in full": "Оплатить полностью",
  "Pay on arrival": "Оплатить при встрече",
  "Cancel request": "Отменить заявку",
  "Ask for a free weather reschedule":
    "Запросить бесплатный перенос из-за погоды",
  "Your request": "Ваша заявка",
  "Saved plans": "Сохранённые планы",
  "Sign in": "Войти",
  "Return to the guide": "Вернуться к путеводителю",
  "Sign in to see your saved plans.":
    "Войдите, чтобы увидеть сохранённые планы.",
  "Current plan": "Текущий план",
  "Daily Almaty, in your inbox.": "Алматы каждый день — на вашей почте.",
  Subscribe: "Подписаться",
  "I agree to receive the daily travel email.":
    "Я согласен получать ежедневную рассылку о путешествиях.",
  "Optional analytics": "Необязательная аналитика",
  "Allow analytics": "Разрешить аналитику",
  "Essential only": "Только необходимые",
  "We use essential sign-in cookies and local storage for your plan. Optional anonymous analytics help us improve the guide.":
    "Мы используем необходимые cookies входа и локальное хранилище маршрута. Необязательная анонимная аналитика помогает улучшать сайт.",
  Save: "Сохранить",
  "Loading…": "Загрузка…",
  "No account needed to save and share.":
    "Для сохранения и отправки аккаунт не нужен.",
  "A shared plan": "Общий маршрут",
  "Make a copy": "Создать копию",
  "This link shows the plan only. Contact details and messages stay private.":
    "Эта ссылка показывает только маршрут. Контакты и сообщения скрыты.",
  "Select a time slot": "Выберите время",
  "Availability needs confirmation": "Наличие мест уточняется",
  "Planning checks": "Проверка маршрута",
  "Your trip title": "Название поездки",
  "Find your kind of wonder.": "Найдите то, что вдохновляет.",
  "City soul.": "Душа города.",
  "Mountain heart.": "Сердце гор.",
  "Discover Almaty": "Откройте Алматы",
  "See the city live": "Город в прямом эфире",
  "A city worth getting to know.": "Город, который стоит узнать.",
  "Made with love in Almaty": "С любовью из Алматы",
  "Today’s forecast": "Прогноз на сегодня",
  "Almaty, today.": "Алматы сегодня.",
  "What to wear today": "Что надеть сегодня",
  "The next seven days": "Ближайшие семь дней",
  "Your outdoor window": "Время для прогулки",
  "Current conditions": "Текущая погода",
  Today: "Сегодня",
  "Feels like": "Ощущается",
  Wind: "Ветер",
  Humidity: "Влажность",
  "Planning cautions": "Погодные риски",
  "Last refreshed": "Обновлено",
  Sunrise: "Восход",
  Sunset: "Закат",
};
Object.assign(words, extra);
export type Lang = "en" | "ru" | "kk";
/** Kazakh UI strings. Missing keys fall back to Russian, then English. */
const kk: Record<string, string> = {
  Explore: "Шолу",
  "Plan your trip": "Сапарды жоспарлау",
  "My plans": "Жоспарларым",
  "Return to the guide": "Нұсқаулыққа оралу",
  "Emergency help": "Шұғыл көмек",
  Privacy: "Құпиялылық",
  "Travel desk": "Саяхат бюросы",
  "Made with love in Almaty": "Алматыда сүйіспеншілікпен жасалған",
  "Build a tour": "Тур құрастыру",
  Places: "Орындар",
  Reviews: "Пікірлер",
  "Verified trip": "Расталған сапар",
};
const Context = createContext<{
  lang: Lang;
  setLang: (v: Lang) => void;
}>({ lang: "en", setLang: () => {} });
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, set] = useState<Lang>("en");
  useEffect(() => {
    const saved = localStorage.getItem("almaty-language");
    const browser = navigator.language;
    const value: Lang =
      saved === "ru" || saved === "kk" || saved === "en"
        ? saved
        : browser.startsWith("kk")
          ? "kk"
          : browser.startsWith("ru")
            ? "ru"
            : "en";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs browser-only state (URL, storage, clock) or an async fetch result after hydration
    set(value);
    document.documentElement.lang = value;
  }, []);
  const setLang = (value: Lang) => {
    set(value);
    localStorage.setItem("almaty-language", value);
    document.documentElement.lang = value;
  };
  return (
    <Context.Provider value={{ lang, setLang }}>{children}</Context.Provider>
  );
}
export function useLanguage() {
  return useContext(Context);
}
export function useT() {
  const { lang } = useLanguage();
  return useCallback(
    (text: string) =>
      lang === "en" ? text : (lang === "kk" && kk[text]) || words[text] || text,
    [lang],
  );
}
export function T({
  children,
  ru,
  kk: kazakh,
}: {
  children: string;
  ru?: string;
  kk?: string;
}) {
  const { lang } = useLanguage();
  if (lang === "en") return <>{children}</>;
  if (lang === "kk") return <>{kazakh || kk[children] || ru || words[children] || children}</>;
  return <>{ru || words[children] || children}</>;
}
/** Picks the best available translation: kk → ru → en. */
export function pick(lang: Lang, text: { en: string; ru?: string; kk?: string }) {
  if (lang === "kk") return text.kk || text.ru || text.en;
  if (lang === "ru") return text.ru || text.en;
  return text.en;
}
export function LanguageSwitch() {
  const { lang, setLang } = useLanguage();
  return (
    <select
      className="hub-language"
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      aria-label="Language / Язык / Тіл"
    >
      <option value="en">EN</option>
      <option value="ru">РУ</option>
      <option value="kk">ҚАЗ</option>
    </select>
  );
}
