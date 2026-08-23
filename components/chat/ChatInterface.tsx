"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { strings } from "@/lib/i18n/sv";
import { Composer } from "./Composer";
import { AssistantAvatar, ChatMessage, type ChatMessageData } from "./ChatMessage";

interface ChatResponse {
  conversationId: number;
  reply: string;
  messagesUsedToday: number;
  dailyMessageLimit: number;
  unlimited: boolean;
}

interface ChatErrorResponse {
  error: string;
}

// Ikon + färg per förslagsfråga, indexbaserat i samma ordning som
// strings.chat.suggestedQuestions — samma grepp (och samma paletter) som
// startsidans "Populära frågor", så de två ingångarna känns som samma sak.
const SUGGESTION_ACCENTS = [
  { icon: "⚽", color: "#3987e5" },
  { icon: "🏛️", color: "#9b8cf5" },
  { icon: "🆚", color: "#d95926" },
  { icon: "🟨", color: "#eab308" },
] as const;

const NEAR_BOTTOM_PX = 120;

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/**
 * Chattvyn. Två lägen, precis som ChatGPT/Gemini/Claude:
 *
 *  - Tomt läge: hälsning + skrivfält centrerat mitt på ytan, med förslagskort
 *    under. Ingen tom scrollyta att titta på innan man skrivit något.
 *  - Aktivt samtal: meddelandena scrollar i en egen kolumn (max-w-3xl, samma
 *    läsbredd som en artikel) och skrivfältet ligger fast i botten.
 *
 * Fasta mörka tokens (samma som Data-sektionen) istället för adaptiva
 * dark:-klasser — hela appen är permanent mörk (se app/(app)/layout.tsx),
 * så text/kant-färger måste vara fasta, annars blir de osynliga om
 * användarens system råkar stå i ljust läge.
 */
export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ used: number; limit: number; unlimited: boolean } | null>(
    null
  );
  const [quotaExhausted, setQuotaExhausted] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Läses inne i effekten nedan utan att vara en dependency — annars skulle
  // varje scroll-händelse trigga om auto-scrollen.
  const atBottomRef = useRef(true);

  // Anropas från en effekt (eller ett klick), alltså efter att React redan
  // skrivit det nya meddelandet till DOM:en — scrollHeight är rätt direkt och
  // behöver ingen requestAnimationFrame runt sig.
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distance < NEAR_BOTTOM_PX;
    atBottomRef.current = near;
    setAtBottom(near);
  }

  // Följ med nedåt när ett svar kommer in — men bara om användaren redan står
  // i botten. Den som scrollat upp för att läsa ett tidigare svar ska inte
  // ryckas ner mitt i meningen.
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading || quotaExhausted) return;

    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);
    // Den som skickar en fråga vill alltid se den — även om hen just läst
    // längre upp. Effekten nedan sköter själva scrollandet när DOM:en är klar.
    atBottomRef.current = true;
    setAtBottom(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, conversationId: conversationId ?? undefined }),
      });

      if (!res.ok) {
        const body: ChatErrorResponse = await res.json();
        if (res.status === 429) setQuotaExhausted(true);
        setError(body.error || strings.errors.generic);
        return;
      }

      const data: ChatResponse = await res.json();
      setConversationId(data.conversationId);
      setQuota({
        used: data.messagesUsedToday,
        limit: data.dailyMessageLimit,
        unlimited: data.unlimited,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      if (!data.unlimited && data.messagesUsedToday >= data.dailyMessageLimit) {
        setQuotaExhausted(true);
      }
    } catch {
      setError(strings.errors.generic);
    } finally {
      setLoading(false);
    }
  }

  // Nollställer bara vyn + konversations-id:t; historiken ligger kvar i
  // databasen och kvoten är per dag, inte per konversation, så den följer med.
  function startNewChat() {
    if (loading) return;
    setMessages([]);
    setConversationId(null);
    setError(null);
    setInput("");
    atBottomRef.current = true;
    setAtBottom(true);
  }

  const isEmpty = messages.length === 0;

  const footnote = (
    <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-2 text-center text-[11px] leading-relaxed text-[#6b6a65]">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e66767]/80" aria-hidden />
        {strings.chat.liveHint}
      </span>
      {quota && (
        <>
          <span aria-hidden>·</span>
          <span>
            {quota.unlimited
              ? strings.chat.quotaUnlimited
              : strings.chat.quotaLabel(quota.used, quota.limit)}
          </span>
        </>
      )}
    </div>
  );

  // Kvoten kan ta slut på två sätt: ett 429-svar (då sätts `error`) eller att
  // det svar vi just fick var dagens sista. I det senare fallet fanns inget
  // felmeddelande — skrivfältet låstes bara, utan förklaring. Därför faller
  // notisen tillbaka på kvot-texten när fältet är låst men inget fel visas.
  const notice = error ?? (quotaExhausted ? strings.errors.quotaExceeded : null);

  const notices = notice && (
    <div
      role="alert"
      className="mb-2.5 rounded-xl border border-[#e66767]/25 bg-[#e66767]/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-[#efa5a5]"
    >
      {notice}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0d0d0d]">
      {/* Rubrikraden hör till ett pågående samtal — i tomt läge tar hälsningen
          mitt på ytan den rollen, och en extra rad högst upp skulle bara
          konkurrera med den. */}
      {!isEmpty && (
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <AssistantAvatar className="h-6 w-6 text-[10px]" />
            <span className="truncate text-sm font-semibold tracking-tight text-white">
              {strings.chat.assistantName}
            </span>
          </div>
          <button
            type="button"
            onClick={startNewChat}
            disabled={loading}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-[#c3c2b7] transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white disabled:opacity-40"
          >
            <PlusIcon />
            {strings.chat.newChat}
          </button>
        </header>
      )}

      {isEmpty ? (
        /* ---------- Tomt läge: allt centrerat, skrivfältet mitt på ytan ---------- */
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-4 py-10 sm:px-6">
            <div className="flex flex-col items-center text-center">
              <AssistantAvatar className="h-11 w-11 text-base" />
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-[28px]">
                {strings.chat.emptyStateTitle}
              </h1>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-[#a3a29b]">
                {strings.chat.emptyStateSubtitle}
              </p>
            </div>

            <div className="mt-7">
              {notices}
              <Composer
                value={input}
                onChange={setInput}
                onSubmit={() => void sendMessage(input)}
                disabled={quotaExhausted}
                loading={loading}
                autoFocus
              />
            </div>

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {strings.chat.suggestedQuestions.map((q, i) => {
                const accent = SUGGESTION_ACCENTS[i % SUGGESTION_ACCENTS.length];
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void sendMessage(q)}
                    disabled={loading || quotaExhausted}
                    className="group flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 text-left transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.05] disabled:pointer-events-none disabled:opacity-40"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base"
                      style={{ backgroundColor: `${accent.color}22` }}
                    >
                      {accent.icon}
                    </span>
                    <span className="text-[13px] font-medium leading-snug text-[#c3c2b7] transition-colors group-hover:text-white">
                      {q}
                    </span>
                  </button>
                );
              })}
            </div>

            {footnote}
          </div>
        </div>
      ) : (
        /* ---------- Aktivt samtal: scrollande lista + fast skrivfält ---------- */
        <>
          <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-6 sm:px-6 sm:py-8">
              {messages.map((m, i) => (
                <ChatMessage key={i} message={m} />
              ))}

              {loading && (
                <div className="flex gap-3">
                  <div className="mt-0.5">
                    <AssistantAvatar />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-sm text-[#898781]">{strings.chat.thinking}</span>
                    <span className="flex gap-1" aria-hidden>
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#898781] [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#898781] [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#898781]" />
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="relative shrink-0">
            {/* Mjuk övergång så texten tonar ut i bakgrunden under skrivfältet
                istället för att klippas av en hård kant. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-[#0d0d0d] to-transparent"
            />

            {!atBottom && (
              <button
                type="button"
                onClick={() => scrollToBottom()}
                aria-label={strings.chat.scrollToLatest}
                className="absolute -top-5 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-white/12 bg-[#1e1e21] text-[#c3c2b7] shadow-lg transition-colors hover:bg-[#26262a] hover:text-white"
              >
                <ChevronDownIcon />
              </button>
            )}

            <div className="mx-auto w-full max-w-3xl px-4 pb-3 sm:px-6 sm:pb-4">
              {notices}
              <Composer
                value={input}
                onChange={setInput}
                onSubmit={() => void sendMessage(input)}
                disabled={quotaExhausted}
                loading={loading}
              />
              {footnote}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
