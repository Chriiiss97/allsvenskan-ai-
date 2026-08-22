import Link from "next/link";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayerRating } from "./PlayerRating";
import { PlayerDNA } from "./PlayerDNA";
import { PlayerRatingHistory } from "./PlayerRatingHistory";
import { ovrColor } from "@/lib/football/rating/ovr-color";
import { translatePosition, translateNationality } from "@/lib/i18n/sv";
import type { AnyPlayerRating } from "@/lib/football/rating/compute-rating";
import type { PlayerDNA as PlayerDNAData } from "@/lib/football/player-dna";
import type { SeasonRatingPoint } from "@/lib/football/rating/rating-store";
import type { RatingTrendSummary } from "@/lib/football/rating/rating-trend";
import type { MatchedArchetype } from "@/lib/football/rating/archetypes";

export interface ScoutDetailPlayer {
  id: number;
  name: string;
  photoUrl: string | null;
  position: string | null;
  teamName: string | null;
  teamExternalId: number | null;
  age: number | null;
  nationality: string | null;
}

export interface ScoutMatchInfo {
  percent: number;
  criteria: { label: string; strong: boolean }[];
}

/**
 * Scout Engine Fas 7 — detaljpanelen. Man ska ALDRIG lämna Scout för att se
 * en spelares fulla bild (uttrycklig instruktion, uppgraderad från "trevligt
 * att ha" till ett hårt krav mitt i projektet) — den här panelen visas
 * SOM EN DEL av /scout/spelare, aldrig som en egen sida. Byggd genom att
 * återanvända EXAKT samma komponenter som den fulla profilsidan
 * (PlayerRating/PlayerDNA/PlayerRatingHistory) — inget nytt parallellt
 * presentationslager, bara en annan plats att montera dem på. Länken
 * längst ner till den fulla profilsidan finns kvar för den som vill gräva
 * djupare i grundstatistiken (matcher, per-90-paneler) som inte får plats
 * här — det är ett medvetet val, inte en tvingad navigering.
 */
export function ScoutDetailPanel({
  player,
  season,
  closeHref,
  fullProfileHref,
  rating,
  dna,
  ratingHistory,
  ratingTrend,
  archetypes,
  scoutMatch,
  unavailableReason,
}: {
  player: ScoutDetailPlayer;
  season: number | null;
  closeHref: string;
  fullProfileHref: string;
  rating: AnyPlayerRating | null;
  dna: PlayerDNAData | null;
  ratingHistory: SeasonRatingPoint[];
  ratingTrend: RatingTrendSummary | null;
  archetypes: MatchedArchetype[];
  scoutMatch: ScoutMatchInfo | null;
  unavailableReason: string | null;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PlayerAvatar name={player.name} teamExternalId={player.teamExternalId} photoUrl={player.photoUrl} size={56} />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{player.name}</p>
            <p className="truncate text-xs text-[#898781]">
              {player.teamName ?? "—"}
              {player.position && ` · ${translatePosition(player.position)}`}
              {player.age !== null && ` · ${player.age} år`}
              {player.nationality && ` · ${translateNationality(player.nationality)}`}
            </p>
          </div>
        </div>
        <Link href={closeHref} title="Stäng" className="shrink-0 rounded-md p-1 text-[#898781] hover:bg-white/5 hover:text-white">
          ✕
        </Link>
      </div>

      {scoutMatch && (
        <div className="mt-3 rounded-lg bg-black/20 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#c3c2b7]">Matchning mot din sökning</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: ovrColor(scoutMatch.percent) }}>
              {scoutMatch.percent}%
            </span>
          </div>
          <ul className="mt-1.5 space-y-0.5">
            {scoutMatch.criteria.map((c) => (
              <li key={c.label} className="text-[11px] text-[#898781]">
                {c.strong ? "✅" : "⚠️"} {c.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {archetypes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {archetypes.map((a) => (
            <span
              key={a.key}
              title={a.definition}
              className="rounded bg-[#3987e5]/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[#3987e5]"
            >
              {a.label}
            </span>
          ))}
        </div>
      )}

      {unavailableReason ? (
        <p className="mt-4 text-sm text-[#898781]">{unavailableReason}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {rating && season !== null && <PlayerRating data={rating} season={season} compact />}
          {dna && <PlayerDNA dna={dna} compact />}
          <PlayerRatingHistory history={ratingHistory} trend={ratingTrend ?? { peakSeasonYear: null, peakOvr: null, trend: null, trendDescription: null, formDescription: null }} />
        </div>
      )}

      <Link
        href={fullProfileHref}
        className="mt-4 block rounded-md border border-white/10 px-3 py-2 text-center text-sm text-[#c3c2b7] transition-colors hover:bg-white/5 hover:text-white"
      >
        Öppna full profil →
      </Link>
    </div>
  );
}
