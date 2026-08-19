"use client";

import { useRef, useState, type FormEvent } from "react";
import { strings } from "@/lib/i18n/sv";
import { MessageContent } from "./MessageContent";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

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

// Fasta mörka tokens (samma som Data-sektionen) istället för adaptiva
// dark:-klasser — hela appen är nu permanent mörk (se app/(app)/layout.tsx),
// så text/kant-färger måste vara fasta, annars blir de osynliga om
// användarens system råkar stå i ljust läge.
export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ used: number; limit: number; unlimited: boolean } | null>(
    null
  );
  const [quotaExhausted, setQuotaExhausted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading || quotaExhausted) return;

    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);
    scrollToBottom();

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
      scrollToBottom();
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-400">
        {strings.chat.liveHint}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-md text-center">
            <p className="text-sm font-medium text-[#c3c2b7]">{strings.chat.emptyStateTitle}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {strings.chat.suggestedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => void sendMessage(q)}
                  disabled={loading || quotaExhausted}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[#c3c2b7] transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div
                  key={i}
                  className="max-w-[80%] self-end rounded-2xl bg-[#3987e5] px-4 py-2 text-sm whitespace-pre-wrap text-white"
                >
                  {m.content}
                </div>
              ) : (
                <div key={i} className="w-full">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[#898781]">
                    <span aria-hidden>⚽</span> Allsvenskan-AI
                  </p>
                  <MessageContent content={m.content} />
                </div>
              )
            )}
            {loading && (
              <div className="w-full">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[#898781]">
                  <span aria-hidden>⚽</span> Allsvenskan-AI
                </p>
                <div className="flex gap-1 py-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/30 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/30 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/30" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {error && <p className="px-4 pb-2 text-center text-xs text-[#e66767]">{error}</p>}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-white/10 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={strings.chat.placeholder}
          disabled={loading || quotaExhausted}
          className="flex-1 rounded-full border border-white/10 bg-transparent px-4 py-2 text-sm text-white outline-none placeholder:text-[#898781] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || quotaExhausted || !input.trim()}
          className="rounded-full bg-[#3987e5] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {strings.chat.send}
        </button>
      </form>

      {quota && (
        <p className="pb-3 text-center text-xs text-[#898781]">
          {quota.unlimited ? strings.chat.quotaUnlimited : strings.chat.quotaLabel(quota.used, quota.limit)}
        </p>
      )}
    </div>
  );
}
