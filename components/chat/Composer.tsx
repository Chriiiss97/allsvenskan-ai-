"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { strings } from "@/lib/i18n/sv";

const MAX_HEIGHT_PX = 200; // ~8 rader innan fältet börjar scrolla internt

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Blockerar både skrivfältet och skicka-knappen (kvot slut / chatt av). */
  disabled?: boolean;
  /** Svar på väg: fältet går att skriva i, men inget nytt kan skickas än. */
  loading?: boolean;
  autoFocus?: boolean;
}

/**
 * Skrivfältet — en ruta (inte en pill) som växer med texten, med skicka-knappen
 * inuti rutan. Samma grundform som ChatGPT/Gemini/Claude, och anledningen till
 * att det är en <textarea> och inte en <input>: en fråga om flera spelare eller
 * en klistrad textrad ska kunna vara flerradig utan att fältet klipper den.
 *
 * Enter skickar, Shift + Enter ger ny rad — förväntat i en chatt, men det
 * betyder också att formuläret aldrig får submitta på Enter av sig självt
 * (därav e.preventDefault() nedan).
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  disabled = false,
  loading = false,
  autoFocus = false,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = !disabled && !loading && value.trim().length > 0;

  // Auto-höjd: nollställ först, annars kan fältet bara växa och aldrig krympa
  // när användaren raderar rader.
  //
  // Tomt fält hanteras separat och får INTE sättas efter scrollHeight: en tom
  // textarea räknar in den radbrutna placeholdern där, så fältet startade två
  // rader högt på mobil. Utan inline-höjd faller det tillbaka på rows={1},
  // som ignorerar placeholdern — alltså exakt en rad.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    if (value) el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSubmit();
    }
  }

  return (
    <div
      className={`group relative rounded-[22px] border bg-[#17171a] shadow-[0_8px_30px_-12px_rgba(0,0,0,0.9)] transition-colors ${
        disabled
          ? "border-white/8 opacity-60"
          : "border-white/12 focus-within:border-[#3987e5]/60 focus-within:bg-[#191a1e]"
      }`}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={strings.chat.placeholder}
        aria-label={strings.chat.placeholder}
        className="block max-h-[200px] w-full resize-none bg-transparent py-3.5 pr-14 pl-4 text-[15px] leading-6 text-white outline-none placeholder:text-[#7d7c76] disabled:cursor-not-allowed"
      />

      {/* Knappen ligger absolut placerad i nederkanten så att den stannar
          kvar där när textarean växer uppåt med innehållet. */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSend}
        aria-label={strings.chat.send}
        className={`absolute right-2.5 bottom-2.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all ${
          canSend
            ? "bg-[#3987e5] text-white hover:bg-[#4a94ea] active:scale-95"
            : "bg-white/8 text-white/25"
        }`}
      >
        {loading ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/25 border-t-white/70" />
        ) : (
          <SendIcon />
        )}
      </button>
    </div>
  );
}
