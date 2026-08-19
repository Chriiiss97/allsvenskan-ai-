"use client";

import { useRef, useState, type FormEvent } from "react";
import { strings } from "@/lib/i18n/sv";

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
      <div className="border-b border-black/10 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-700 dark:border-white/10 dark:text-amber-400">
        {strings.chat.liveHint}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-md text-center">
            <p className="text-sm font-medium text-black/70 dark:text-white/70">
              {strings.chat.emptyStateTitle}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {strings.chat.suggestedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => void sendMessage(q)}
                  disabled={loading || quotaExhausted}
                  className="rounded-full border border-black/10 px-3 py-1.5 text-xs transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "self-end bg-foreground text-background"
                    : "self-start bg-black/[.05] dark:bg-white/[.08]"
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="self-start rounded-2xl bg-black/[.05] px-4 py-2 text-sm text-black/40 dark:bg-white/[.08] dark:text-white/40">
                {strings.chat.sending}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {error && (
        <p className="px-4 pb-2 text-center text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-black/10 p-3 dark:border-white/10"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={strings.chat.placeholder}
          disabled={loading || quotaExhausted}
          className="flex-1 rounded-full border border-black/10 bg-transparent px-4 py-2 text-sm outline-none disabled:opacity-50 dark:border-white/15"
        />
        <button
          type="submit"
          disabled={loading || quotaExhausted || !input.trim()}
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {strings.chat.send}
        </button>
      </form>

      {quota && (
        <p className="pb-3 text-center text-xs text-black/40 dark:text-white/40">
          {quota.unlimited
            ? strings.chat.quotaUnlimited
            : strings.chat.quotaLabel(quota.used, quota.limit)}
        </p>
      )}
    </div>
  );
}
