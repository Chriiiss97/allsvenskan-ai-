import type { LiveComment } from "@/lib/football/live-feed";
import { formatMinute } from "@/lib/football/event-display";

/**
 * Fas 21 (2026-08-23) — den löpande matchkommentaren.
 *
 * SPRÅK: texten visas OÖVERSATT på engelska, som Sportmonks levererar den.
 * Uttryckligt användarbeslut 2026-08-23 med FotMob som referens (som inte
 * heller översätter kommentaren i sitt svenska gränssnitt). Alternativet —
 * maskinöversättning av hundratals meningar per match — hade infört exakt
 * den sorts gissning som resten av kodbasen är byggd för att undvika.
 * Undantaget är dokumenterat i migrationen; gör det inte till en
 * "översättning" utan att ta upp det igen.
 *
 * Ramen runt sektionen är svensk, så det är tydligt att den engelska texten
 * är ett citat från källan och inte ett oöversatt gränssnitt.
 */
export function CommentaryFeed({ comments, limit = 8 }: { comments: LiveComment[]; limit?: number }) {
  if (comments.length === 0) {
    return <p className="text-sm text-[#898781]">Ingen matchkommentar än.</p>;
  }

  const shown = comments.slice(0, limit);

  return (
    <div>
      <ul className="space-y-2">
        {shown.map((c) => (
          <li
            key={c.id}
            className={`rounded-xl border px-4 py-3 ${
              // Källans egen is_goal/is_important-flagga lyfter en rad — men
              // bara med en tydligare ram, inte en egen färg. Mål räknas av
              // event-tabellen, aldrig härifrån.
              c.isGoal
                ? "border-[#e0645f]/35 bg-[#e0645f]/[0.06]"
                : c.isImportant
                  ? "border-white/15 bg-white/[0.03]"
                  : "border-white/10 bg-[#1a1a19]"
            }`}
          >
            {c.minute != null && (
              <p className="text-[11px] font-semibold tabular-nums text-[#898781]">{formatMinute(c.minute, c.extraMinute)}</p>
            )}
            <p className="mt-1 text-sm leading-relaxed text-[#c3c2b7]">{c.comment}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[10px] text-[#5f5e59]">
        Matchkommentar från Sportmonks, visas i original (engelska) — samma som i andra matchappar.
      </p>
    </div>
  );
}
