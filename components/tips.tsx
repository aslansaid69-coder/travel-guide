import {
  ArrowUpRight,
  Plus,
  IdCard,
  Wallet,
  TrainFront,
  Smartphone,
  ShieldCheck,
  CloudSun,
  Utensils,
} from "lucide-react";
const tips = [
  {
    icon: IdCard,
    title: "Before you fly",
    text: "Entry rules depend on your passport and itinerary. Check visa, QazETA, passport-validity, and host-registration requirements before booking. Ask your accommodation to confirm any arrival notification.",
    url: "https://qazeta.kz/en/",
    source: "Check official entry guidance",
  },
  {
    icon: Wallet,
    title: "Money, made simple",
    text: "The local currency is the Kazakhstani tenge (KZT, ₸). Cards are common in the city; carry some cash for markets and small vendors. Use bank ATMs or authorised exchange desks and check fees with your bank.",
    url: "https://nta.visitalmaty.kz/en/guides/almaty-practical-tips",
    source: "Visitor essentials",
  },
  {
    icon: TrainFront,
    title: "Getting around",
    text: "Yandex Go is useful for app-booked rides. The metro is a straightforward way to cross the centre; buses reach further into the city. Check current routes and payment options with ONAY or a local map app. Bus 12 serves the Medeu direction.",
    url: "https://nta.visitalmaty.kz/en/transit",
    source: "Explore local transport",
  },
  {
    icon: Smartphone,
    title: "Stay connected",
    text: "Bring your passport to an official mobile operator shop to buy a local SIM. Ask staff about device and SIM registration. An eSIM may work if your phone supports it; check coverage, roaming, and registration rules before paying.",
    url: "https://beeline.kz/ru/ctn-registration?isFrame=false&region=akm",
    source: "Operator registration guidance",
  },
  {
    icon: ShieldCheck,
    title: "Travel with confidence",
    text: "Keep valuables secure in crowded places and use official or app-booked taxis. Mountain weather changes quickly: carry layers, water, and a charged phone, and tell someone your route. Check current trail and road conditions before heading out.",
    url: "https://www.gov.uk/foreign-travel-advice/kazakhstan/safety-and-security",
    source: "Read current safety advice",
  },
  {
    icon: CloudSun,
    title: "A city for every season",
    text: "Spring brings blossom and changeable weather. Summer days can be hot, with cooler air higher up. Autumn is crisp and colourful. Winter means cold streets and mountain snow. Pack layers year-round and check the forecast for your exact destination.",
    url: "https://nta.visitalmaty.kz/en/guides/almaty-practical-tips",
    source: "Plan for the seasons",
  },
  {
    icon: Utensils,
    title: "Come hungry",
    text: "Try beshbarmak (meat and noodles), baursak (golden fried dough), manty (steamed dumplings), and lagman (noodles). Share a pot of tea. Meat and dairy are common, so explain allergies or dietary preferences clearly before ordering.",
    url: "https://visitalmaty.kz/",
    source: "Discover more of Almaty",
  },
];
export function Tips() {
  return (
    <section id="tips" className="section tips-section">
      <div className="shell tips-layout">
        <div className="tips-heading">
          <p className="eyebrow">A LITTLE KNOW-HOW GOES A LONG WAY</p>
          <h2>
            Arrive curious.
            <br />
            <em>Feel at home.</em>
          </h2>
          <p>
            From your first tenge to your first mountain trail, a few useful
            things to know.
          </p>
          <div className="local-note">
            <span>Sälem!</span>
            <p>
              That’s “hello” in Kazakh.
              <br />A lovely place to start.
            </p>
          </div>
        </div>
        <div className="tips-list">
          {tips.map((tip, i) => (
            <details key={tip.title} className="tip">
              <summary>
                <tip.icon size={21} strokeWidth={1.5} />
                <span>{tip.title}</span>
                <span className="tip-number">0{i + 1}</span>
                <Plus className="tip-plus" size={18} />
              </summary>
              <div className="tip-body">
                <p>{tip.text}</p>
                <a href={tip.url} target="_blank" rel="noopener noreferrer">
                  {tip.source}
                  <ArrowUpRight size={13} />
                </a>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
