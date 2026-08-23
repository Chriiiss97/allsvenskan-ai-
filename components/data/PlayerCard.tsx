import Link from "next/link";
import { PlayerAvatar } from "./PlayerAvatar";
import { translatePosition } from "@/lib/i18n/sv";
import { getTeamAccent } from "@/lib/data/team-colors";
import { ovrColor, deltaColor } from "@/lib/ovr/color";

export interface PlayerCardStat {
  goals: number;
  assists: number;
  appearances: number;
  minutesPlayed: number;
  /** Mål per 90 minuter — null om spelaren saknar speltid. Visas bara när listan sorteras på det. */
  goalsPer90?: number | null;
  // "all" = summerat över alla importerade säsonger (2022–2024), annars ett
  // specifikt säsongsår — se Spelare-sidans säsongsväljare.
  year: number | "all";
}

export interface PlayerCardData {
  id: number;
  full_name: string;
  position: string | null;
  photoUrl: string | null;
  teamName: string | null;
  teamExternalId: number | null;
  stat: PlayerCardStat | null;
  /** Player Rating OVR (0–99) — odefinierad/null döljer badgen helt (t.ex. lagtruppens vy som inte alltid har en säsong att räkna mot). */
  rating?: number | null;
  /** Visas i undertexten om satt (t.ex. Scout) — odefinierad/null döljer den helt, samma mönster som position. */
  age?: number | null;
  /** OVR-förändring mot en jämförelsesäsong (t.ex. Scout:s utvecklingsfilter) — odefinierad/null döljer chippen helt. */
  ovrDelta?: number | null;
  /** Scout Engine Fas 4 — regelbaserade spelartyper (t.ex. "Målskytt"). Odefinierad/tom döljer raden helt. */
  archetypes?: { label: string; definition: string }[];
  /** Scout Engine Fas 6 — hur väl spelaren matchar de aktiva Scout-kriterierna, transparent (se lib/football/scout/scout-match.ts). Odefinierad/null döljer badgen helt (t.ex. inga filter aktiva). */
  scoutMatch?: { percent: number; criteria: { label: string; strong: boolean }[] } | null;
}

export type PlayerSortKey = "name" | "goals" | "assists" | "appearances" | "minutes" | "goalsPer90";

// Positionsgrupp -> färg. Återanvänder redan etablerade tokens (blå/orange
// från kategorisk-paletten, grönt/gult från status-paletten) istället för
// att introducera nya kulörer bara för det här badget.
const POSITION_COLORS: Record<string, string> = {
  Goalkeeper: "#eab308",
  Defender: "#3987e5",
  Midfielder: "#0ca30c",
  Attacker: "#d95926",
  Forward: "#d95926",
};

// Kort positionsetikett — "Mål" (av "Målvakt") hade lästs som antal mål
// bredvid statistikraden, därför svensk fotbollsförkortning istället.
const POSITION_SHORT: Record<string, string> = {
  Goalkeeper: "MV",
  Defender: "BACK",
  Midfielder: "MITT",
  Attacker: "ANF",
  Forward: "ANF",
};

/** Hur många spelartyper som får plats innan resten döljs bakom "+N". */
const MAX_VISIBLE_ARCHETYPES = 2;

const NUMBER_FORMAT = new Intl.NumberFormat("sv-SE");

interface CardMetric {
  key: PlayerSortKey;
  value: string;
  label: string;
}

/**
 * Kortets statistikrad. ALLTID samma tre mått (mål/assist/matcher) i samma
 * ordning — den tidigare enskilda "primärstat"-rutan bytte innehåll med
 * sorteringen, vilket gjorde två kort bredvid varandra omöjliga att jämföra
 * med ögat. Sorteringsmåttet markeras istället i vitt, och läggs till som
 * ett fjärde mått om det inte redan är ett av de tre.
 */
function metricsFor(stat: PlayerCardStat, sort: PlayerSortKey): CardMetric[] {
  const metrics: CardMetric[] = [
    { key: "goals", value: String(stat.goals), label: "mål" },
    { key: "assists", value: String(stat.assists), label: "assist" },
    { key: "appearances", value: String(stat.appearances), label: "matcher" },
  ];
  if (sort === "minutes") {
    metrics.push({ key: "minutes", value: NUMBER_FORMAT.format(stat.minutesPlayed), label: "min" });
  } else if (sort === "goalsPer90") {
    metrics.push({ key: "goalsPer90", value: stat.goalsPer90 != null ? stat.goalsPer90.toFixed(1) : "—", label: "mål/90" });
  }
  return metrics;
}

/**
 * Ett spelarkort — återanvänds av spelarlistan (/spelare), Scout
 * (/scout/spelare) och lagprofilens truppsektion, så det bara finns EN
 * kortstil att hålla konsekvent.
 *
 * Ombyggt 2026-08-23 (användarfeedback: "kaos, otydligt, svårt att
 * förstå"). Tre konkreta problem åtgärdade:
 *   1) Ojämna korthöjder — namnet, klubbraden och spelartyperna låg i
 *      samma flexrad som statistikrutorna, så ett kort med tre
 *      spelartyper blev nästan dubbelt så högt som ett utan. Nu: fast
 *      radordning i en egen kolumn, `h-full` + en statistikrad som
 *      trycks ner med `mt-auto` — alla kort på en rad är lika höga.
 *   2) Bortkapade klubbnamn ("BK ...", "Mal...") — badges och siffror
 *      trängdes på samma rad som klubben. Nu har metaraden hela bredden
 *      och sifferkolumnen en fast bredd.
 *   3) Radbrytande spelartyps-chips — max två visas, resten som "+N"
 *      (hela listan finns kvar i title-attributet och i detaljpanelen).
 */
export function PlayerCard({
  player,
  sort = "name",
  href,
  active = false,
  accent = "#3987e5",
}: {
  player: PlayerCardData;
  sort?: PlayerSortKey;
  /** Scout Engine Fas 7 — override av standardmålet (`/spelare/{id}`), t.ex. Scout:s "stanna kvar, öppna detaljpanel"-länk. Odefinierad = oförändrat beteende för alla befintliga anropare. */
  href?: string;
  /** Scout Engine Fas 7 — visuellt markerad som den just nu öppna detaljpanelens spelare. */
  active?: boolean;
  /** Zonens accentfärg (Fotboll blå / Scout violett, se lib/design/tokens.ts) — sätts av sidan så kortet aldrig lyser i "fel" produktfärg. */
  accent?: string;
}) {
  const teamAccent = getTeamAccent(player.teamExternalId);
  const positionColor = player.position ? POSITION_COLORS[player.position] : undefined;
  const positionLabel = translatePosition(player.position);
  const metrics = player.stat ? metricsFor(player.stat, sort) : [];
  const archetypes = player.archetypes ?? [];
  const visibleArchetypes = archetypes.slice(0, MAX_VISIBLE_ARCHETYPES);
  const hiddenArchetypes = archetypes.slice(MAX_VISIBLE_ARCHETYPES);
  const matchTooltip = player.scoutMatch
    ? player.scoutMatch.criteria.map((c) => `${c.strong ? "✅" : "⚠️"} ${c.label}`).join("\n")
    : undefined;

  return (
    <Link
      href={href ?? `/spelare/${player.id}`}
      className={`group relative flex h-full flex-col overflow-hidden rounded-xl border bg-[#17171b] p-3 pl-4 transition-colors duration-150 ${
        active ? "bg-white/[.04] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]" : "border-white/10 hover:border-white/20 hover:bg-white/[.03]"
      }`}
      style={active ? { borderColor: `${accent}80` } : undefined}
    >
      {/* Klubbfärgad kantremsa — kortens enda kulör utöver siffrorna, så en
          lista går att läsa lagvis med ögat utan att varje kort blir brokigt. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: teamAccent }} />

      <div className="flex items-start gap-3">
        <PlayerAvatar name={player.full_name} teamExternalId={player.teamExternalId} photoUrl={player.photoUrl} size={42} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-white" title={player.full_name}>
            {player.full_name}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] leading-none text-[#898781]">
            {positionLabel && (
              <span
                title={positionLabel}
                className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                style={{ backgroundColor: `${positionColor}1f`, color: positionColor }}
              >
                {(player.position && POSITION_SHORT[player.position]) ?? positionLabel}
              </span>
            )}
            <span className="truncate" title={player.teamName ?? undefined}>
              {player.teamName ?? "—"}
            </span>
            {player.age != null && <span className="shrink-0 tabular-nums text-[#7d7c76]">{player.age} år</span>}
          </p>
        </div>

        {/* Sifferkolumn med FAST bredd — det är den som håller namn- och
            klubbraden från att kapas olika mycket från kort till kort. */}
        <div className="flex w-[46px] shrink-0 flex-col items-end gap-1">
          {player.rating != null ? (
            <div
              className="w-full rounded-lg px-1 py-1 text-center"
              style={{ backgroundColor: `${ovrColor(player.rating)}1a` }}
              title="Player Rating — statistisk 0–99-OVR"
            >
              <p className="text-[15px] font-bold leading-none tabular-nums" style={{ color: ovrColor(player.rating) }}>
                {player.rating}
              </p>
              <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] leading-none text-[#7d7c76]">OVR</p>
            </div>
          ) : (
            <div className="w-full rounded-lg bg-white/[.04] px-1 py-1 text-center" title="För lite speltid för en tillförlitlig OVR">
              <p className="text-[15px] font-bold leading-none text-[#5f5e59]">–</p>
              <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] leading-none text-[#5f5e59]">OVR</p>
            </div>
          )}
          {player.ovrDelta != null && (
            <span
              className="rounded px-1 py-0.5 text-[10px] font-bold leading-none tabular-nums"
              style={{ backgroundColor: `${deltaColor(player.ovrDelta)}1a`, color: deltaColor(player.ovrDelta) }}
              title="OVR-förändring mot jämförelsesäsongen"
            >
              {player.ovrDelta > 0 ? "+" : ""}
              {player.ovrDelta}
            </span>
          )}
        </div>
      </div>

      {(visibleArchetypes.length > 0 || player.scoutMatch != null) && (
        <div className="mt-2 flex items-center gap-1 overflow-hidden">
          {player.scoutMatch != null && (
            <span
              title={matchTooltip}
              className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold leading-none"
              style={{ backgroundColor: `${ovrColor(player.scoutMatch.percent)}1f`, color: ovrColor(player.scoutMatch.percent) }}
            >
              {player.scoutMatch.percent}%
            </span>
          )}
          {visibleArchetypes.map((a) => (
            <span
              key={a.label}
              title={a.definition}
              className="min-w-0 truncate rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide leading-none"
              style={{ backgroundColor: `${accent}14`, color: accent }}
            >
              {a.label}
            </span>
          ))}
          {hiddenArchetypes.length > 0 && (
            <span
              title={hiddenArchetypes.map((a) => `${a.label} — ${a.definition}`).join("\n")}
              className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium leading-none text-[#7d7c76]"
              style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
            >
              +{hiddenArchetypes.length}
            </span>
          )}
        </div>
      )}

      {metrics.length > 0 && (
        <div className="mt-auto flex items-center gap-3 border-t border-white/5 pt-2 text-[11px] leading-none">
          {metrics.map((m) => {
            const isActive = m.key === sort;
            return (
              <span key={m.key} className="flex items-baseline gap-1">
                <span className={`font-semibold tabular-nums ${isActive ? "text-white" : "text-[#c3c2b7]"}`}>{m.value}</span>
                <span className={isActive ? "text-[#898781]" : "text-[#5f5e59]"}>{m.label}</span>
              </span>
            );
          })}
        </div>
      )}
    </Link>
  );
}
