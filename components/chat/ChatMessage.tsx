"use client";

import { useState } from "react";
import { strings } from "@/lib/i18n/sv";
import { MessageContent } from "./MessageContent";

/**
 * Samma märke som Sidebar-loggan (blå ring + "A") istället för en ⚽-emoji —
 * assistenten ska läsa som appens egen produkt, inte som en generisk bot.
 */
export function AssistantAvatar({ className = "h-7 w-7 text-[11px]" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full border border-[#3987e5]/60 bg-[#3987e5]/10 font-bold text-[#5c9ded] shadow-[0_0_10px_-3px_rgba(57,135,229,0.7)] ${className}`}
    >
      A
    </span>
  );
}

function CopyIcon({ done }: { done: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      {done ? (
        <path d="M4 12.5l5 5 11-11" />
      ) : (
        <>
          <rect x="9" y="9" width="11" height="11" rx="2.5" />
          <path d="M15 6.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7a2 2 0 002 2h.5" />
        </>
      )}
    </svg>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Utan clipboard-behörighet (t.ex. osäker origin) gör knappen inget —
      // hellre tyst än ett felmeddelande för något så perifert.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? strings.chat.copied : strings.chat.copy}
      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-[#7d7c76] transition-colors hover:bg-white/[0.06] hover:text-[#c3c2b7]"
    >
      <CopyIcon done={copied} />
      {copied ? strings.chat.copied : strings.chat.copy}
    </button>
  );
}

export interface ChatMessageData {
  role: "user" | "assistant";
  content: string;
}

/**
 * En rad i samtalet. Användaren får en bubbla högerställd, assistenten ren
 * text över hela kolumnbredden med avatar i vänstermarginalen — samma
 * asymmetri som ChatGPT/Claude, och av samma skäl: assistentsvaren är de långa,
 * strukturerade texterna (tabeller, listor) och ska inte klämmas in i en bubbla.
 *
 * Kopiera-knappen ligger under svaret och tonas fram vid hover (alltid synlig
 * på touch, där det inte finns någon hover — därför opacity-100 som utgångsläge
 * och nedtoning först på pekarenheter via `[@media(hover:hover)]`).
 */
export function ChatMessage({ message }: { message: ChatMessageData }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md border border-[#3987e5]/25 bg-[#3987e5]/12 px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-white">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex gap-3">
      <div className="mt-0.5">
        <AssistantAvatar />
      </div>
      <div className="min-w-0 flex-1">
        <MessageContent content={message.content} />
        <div className="mt-1.5 -ml-2 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
          <CopyButton text={message.content} />
        </div>
      </div>
    </div>
  );
}
