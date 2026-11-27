"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, Send, X } from "lucide-react";
import { pick, useLanguage } from "@/components/hub/language";

type ChatMessage = { role: "user" | "assistant"; text: string; tools?: string[]; error?: boolean };
type Event =
  | { type: "start"; conversationId: string }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string }
  | { type: "action"; action: { type: "add_to_tour"; placeId: string; name: string; slug: string } }
  | { type: "done" }
  | { type: "error"; message: string };

const DRAFT_KEY = "almaty-tour-draft";
const CONV_KEY = "almaty-assistant-conversation";
const TOOL_LABEL: Record<string, { en: string; ru: string; kk: string }> = {
  search_places: { en: "Searching our places…", ru: "Ищу места…", kk: "Орындарды іздеуде…" },
  estimate_tour: { en: "Calculating an approximate price…", ru: "Считаю примерную цену…", kk: "Бағаны есептеуде…" },
  find_guides: { en: "Checking guides…", ru: "Подбираю гидов…", kk: "Гидтерді іздеуде…" },
  add_to_tour: { en: "Adding to your tour…", ru: "Добавляю в тур…", kk: "Турға қосуда…" },
};

/** Adds a place to the tour builder draft stored in localStorage (same format as /build). */
function addToDraft(placeId: string) {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null") || { ids: [], adults: 2, children: 0, startDate: "", guideId: "" };
    if (!d.ids.includes(placeId)) d.ids = [...d.ids, placeId].slice(0, 6);
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ids: [placeId], adults: 2, children: 0, startDate: "", guideId: "" }));
  }
}

/** Renders plain text with /places/… and /build links; never injects HTML. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\/(?:places\/[a-z0-9-]+|build|guides\/[A-Za-z0-9_-]+))/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <Link key={i} href={p}>
            {p}
          </Link>
        ) : (
          <span key={i}>{p.replace(/\*\*(.+?)\*\*/g, "$1")}</span>
        ),
      )}
    </>
  );
}

export function AssistantChat() {
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages, status]);
  const t = (en: string, ru: string, kk: string) => pick(lang, { en, ru, kk });
  const suggestions = [
    t("A day in the mountains — what do you suggest?", "Куда поехать в горы на один день?", "Тауға бір күнге қайда баруға болады?"),
    t("Price for Kok-Tobe, Shymbulak and Medeu for 2 people", "Сколько стоит тур Кок-Тобе, Шымбулак и Медеу на двоих?", "Көктөбе, Шымбұлақ және Медеу екі адамға қанша тұрады?"),
  ];

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setStatus("");
    setMessages((m) => [...m, { role: "user", text: message }, { role: "assistant", text: "" }]);
    const update = (fn: (last: ChatMessage) => ChatMessage) =>
      setMessages((m) => [...m.slice(0, -1), fn(m[m.length - 1])]);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, language: lang, conversationId: sessionStorage.getItem(CONV_KEY) || undefined }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t("The assistant is unavailable right now.", "Помощник сейчас недоступен.", "Көмекші қазір қолжетімсіз."));
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as Event;
          if (e.type === "start") sessionStorage.setItem(CONV_KEY, e.conversationId);
          else if (e.type === "text") {
            setStatus("");
            update((last) => ({ ...last, text: last.text + e.delta }));
          } else if (e.type === "tool") setStatus(pick(lang, TOOL_LABEL[e.name] || { en: "Working…" }));
          else if (e.type === "action") {
            addToDraft(e.action.placeId);
            setAdded((a) => [...a, e.action.name]);
          } else if (e.type === "error") update((last) => ({ ...last, text: last.text || e.message, error: true }));
        }
      }
    } catch (error) {
      update((last) => ({ ...last, text: (error as Error).message, error: true }));
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  return (
    <>
      <div className="platform-assistant">
        <button className="button button-accent" aria-expanded={open} aria-controls="travel-assistant" onClick={() => setOpen(!open)}>
          {open ? <X size={18} /> : <MessageCircle size={19} />}
          {open ? t("Close", "Закрыть", "Жабу") : t("Ask a local", "Спросить", "Сұрау")}
        </button>
      </div>
      {open && (
        <section id="travel-assistant" className="platform-assistant-panel assistant-panel" aria-label="Travel assistant">
          <div className="platform-panel-title">
            <h2>{t("A little local knowledge.", "Ваш помощник в Алматы", "Алматыдағы көмекшіңіз")}</h2>
            <button aria-label="Close" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="assistant-log" aria-live="polite">
            {!messages.length && (
              <>
                <p className="platform-muted">
                  {t(
                    "Ask about places, approximate prices and guides. Answers use only our catalog; prices are approximate.",
                    "Спросите о местах, примерных ценах и гидах. Ответы — только по нашему каталогу; цены ориентировочные.",
                    "Орындар, шамамен бағалар және гидтер туралы сұраңыз.",
                  )}
                </p>
                {suggestions.map((s) => (
                  <button key={s} className="assistant-suggestion" onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </>
            )}
            {messages.map((m, i) => (
              <p key={i} className={`assistant-msg assistant-${m.role}${m.error ? " assistant-error" : ""}`}>
                {m.role === "assistant" && !m.text && busy ? "…" : <Rich text={m.text} />}
              </p>
            ))}
            {status && <p className="platform-muted">{status}</p>}
            {added.length > 0 && (
              <p className="review-verified">
                ✓ {t("Added to your tour", "Добавлено в тур", "Турға қосылды")}: {[...new Set(added)].join(", ")} ·{" "}
                <Link href="/build">{t("Open tour builder", "Открыть конструктор", "Құрастырушыны ашу")} →</Link>
              </p>
            )}
            <div ref={end} />
          </div>
          <form
            className="assistant-form"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              maxLength={2000}
              rows={2}
              placeholder={t("Type your question…", "Ваш вопрос…", "Сұрағыңыз…")}
              aria-label={t("Message", "Сообщение", "Хабарлама")}
            />
            <button className="button button-accent" disabled={busy || !input.trim()} aria-label="Send">
              <Send size={17} />
            </button>
          </form>
          <p className="hub-caption">
            {t(
              "AI can make mistakes. Prices are approximate; bookings happen only in the tour builder.",
              "ИИ может ошибаться. Цены ориентировочные; бронирование — только в конструкторе тура.",
              "ЖИ қателесуі мүмкін. Бағалар шамамен.",
            )}
            {messages.length > 0 && (
              <>
                {" "}
                <button
                  className="hub-caption"
                  onClick={() => {
                    sessionStorage.removeItem(CONV_KEY);
                    setMessages([]);
                    setAdded([]);
                  }}
                >
                  {t("New chat", "Новый чат", "Жаңа чат")}
                </button>
              </>
            )}
          </p>
        </section>
      )}
    </>
  );
}
