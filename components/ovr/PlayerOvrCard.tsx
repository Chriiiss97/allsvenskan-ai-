"use client";

/**
 * OVR v2 — betygskortet med "varför?"-nedbrytning.
 * =============================================================================
 * Ersätter components/data/PlayerRating.tsx, som var byggd på den gamla
 * motorns fyra kategorier och dess kontributionsmodell.
 *
 * Tre saker kortet kan som det gamla inte kunde:
 *
 *  1. Visa SÄSONG mot HISTORIK. Den gamla motorn hade bara ett tal. Skillnaden
 *     mellan vad spelaren gjort i år och vad historiken förutsade är den mest
 *     användbara signalen i hela modellen för en scout.
 *  2. Visa hur varje mätvärde krympts mot sin prior — observerat, prior och
 *     justerat sida vid sida, med hur många minuter som ligger bakom just det
 *     måttet. Ett betyg går att härleda hela vägen ned.
 *  3. Redovisa speltid vi INTE kunnat värdera, i stället för att tyst utelämna
 *     den.
 *
 * Konfidensen är aldrig valfri här. Kortet tar emot en färdig displayHint från
 * lib/ovr/store.ts, samma som topplistan och Scout-listan använder, så samma
 * spelare aldrig beskrivs olika beroende på var man tittar.
 */

import { ovrColor } from "@/lib/ovr/color";
import type { OvrBreakdown, OvrDisplayHint, PlayerOvr } from "@/lib/ovr/store";
import { POSITION_GROUP_LABELS, type ConfidenceTier, type SubscoreKey } from "@/lib/ovr/config";
import type { MatchedArchetype } from "@/lib/ovr/archetypes";

const CONFIDENCE_COLOR: Record<ConfidenceTier, string> = {
  hög: "#22c55e",
  medel: "#d9a526",
  låg: "#e66767",
};

const CONFIDENCE_LABEL: Record<ConfidenceTier, string> = {
  hög: "Säkert underlag",
  medel: "Medelsäkert underlag",
  låg: "Begränsat underlag",
};

const SUBSCORE_LABELS: Record<SubscoreKey, string> = {
  finishing: "Avslutning",
  passing: "Passning",
  dribbling: "Dribbling",
  defending: "Försvar",
  duels: "Duellspel",
  goalkeeping: "Målvaktsspel",
};

const SUBSCORE_ORDER: SubscoreKey[] = ["finishing", "passing", "dribbling", "defending", "duels", "goalkeeping"];

function fmt(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(1);
}

function OvrBadge({ ovr, label, hint }: { ovr: number | null; label: string; hint?: string }) {
  const color = ovr !== null ? ovrColor(ovr) : "#5f5e59";
  return (
    <div
      className="flex shrink-0 flex-col items-center justify-center rounded-xl border px-3 py-2"
      style={{ borderColor: `${color}55`, backgroundColor: `${color}14` }}
      title={hint ?? "Intern allsvensk skala 48–91 — inte jämförbar med FIFA:s globala skala"}
    >
      <span className="text-2xl font-bold tabular-nums" style={{ color }}>
        {ovr === null ? "—" : ovr.toFixed(0)}
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-wide text-[#898781]">{label}</span>
    </div>
  );
}

/** En stapel per delbetyg, skalad över det faktiska spannet 48–91. */
function SubscoreBar({ label, value }: { label: string; value: number | null }) {
  if (value === null) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="w-24 shrink-0 text-[#7d7c76]">{label}</span>
        <span className="text-[#5f5e59]">Ej tillgängligt</span>
      </div>
    );
  }
  const pct = Math.max(0, Math.min(100, ((value - 48) / (91 - 48)) * 100));
  const color = ovrColor(value);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-[#c3c2b7]">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[.06]">
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </span>
      <span className="w-8 shrink-0 text-right font-semibold tabular-nums" style={{ color }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

export interface PlayerOvrCardProps {
  rating: PlayerOvr;
  display: OvrDisplayHint;
  breakdown?: OvrBreakdown | null;
  archetypes?: MatchedArchetype[];
  /** Kompakt läge för Scout-panelen — döljer den fulla måttnedbrytningen. */
  compact?: boolean;
}

export function PlayerOvrCard({ rating, display, breakdown, archetypes = [], compact = false }: PlayerOvrCardProps) {
  const tier = rating.confidenceTier;
  const totalMinutes = rating.minutesPlayed + rating.externalMinutes;

  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Betyg {rating.seasonYear}</h2>
          <p className="mt-0.5 text-xs text-[#898781]">
            {POSITION_GROUP_LABELS[rating.positionGroup]}
            {rating.secondaryPositionGroup && ` · även ${POSITION_GROUP_LABELS[rating.secondaryPositionGroup]}`}
            {rating.positionConfidence > 0 && ` · ${Math.round(rating.positionConfidence * 100)} % av startminuterna`}
          </p>
        </div>
        <OvrBadge ovr={rating.ovr} label="OVR" />
      </div>

      {/* Konfidens och speltid — aldrig valfritt, se lib/ovr/store.ts */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {tier && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ backgroundColor: `${CONFIDENCE_COLOR[tier]}1a`, color: CONFIDENCE_COLOR[tier] }}
          >
            {CONFIDENCE_LABEL[tier]}
          </span>
        )}
        <span className="text-xs text-[#898781]">
          {totalMinutes} min
          {rating.externalMinutes > 0 && ` (varav ${rating.externalMinutes} utanför Allsvenskan)`}
        </span>
      </div>

      {display.caveat && (
        <p className="mt-2 rounded-lg border border-[#d9a526]/25 bg-[#d9a526]/[.07] p-2.5 text-xs leading-relaxed text-[#c3c2b7]">
          {display.caveat}
        </p>
      )}

      {/* Säsong mot historik — den signal den gamla motorn inte kunde ge */}
      <div className="mt-4 flex items-stretch gap-2">
        <OvrBadge ovr={rating.currentSeasonRating} label="I år" hint="Enbart den här säsongen, utan att väga in historiken" />
        <OvrBadge ovr={rating.historicalRating} label="Historik" hint="Vad tidigare säsonger förutsade inför den här" />
        {rating.potential !== null && (
          <OvrBadge
            ovr={rating.potential}
            label="Potential"
            hint="Ren åldersprojektion mot 27 år — inte en scoutbedömning, den vet ingenting om talang"
          />
        )}
        <div className="flex flex-1 flex-col justify-center rounded-xl border border-white/10 px-3 py-2">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-[#898781]">Form</span>
          <span
            className="text-lg font-bold tabular-nums"
            style={{ color: rating.form > 1 ? "#22c55e" : rating.form < -1 ? "#e66767" : "#898781" }}
            title="Senaste matcherna i nuvarande klubb, jämfört med spelarens egen säsongsnivå. Påverkar aldrig OVR."
          >
            {rating.form > 0 ? "+" : ""}
            {rating.form.toFixed(1)}
          </span>
        </div>
      </div>

      {archetypes.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {archetypes.map((a) => (
            <span
              key={a.key}
              className="rounded-full bg-white/[.06] px-2 py-1 text-[10px] font-medium text-[#c3c2b7]"
              title={`${a.definition}\n\n${a.reason}`}
            >
              {a.label}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-1.5 border-t border-white/10 pt-3">
        {SUBSCORE_ORDER.filter((k) => rating.subscores[k] !== null).map((k) => (
          <SubscoreBar key={k} label={SUBSCORE_LABELS[k]} value={rating.subscores[k]} />
        ))}
      </div>

      {!compact && breakdown && breakdown.metrics.length > 0 && (
        <details className="mt-4 border-t border-white/10 pt-3">
          <summary className="cursor-pointer text-xs font-semibold text-[#c3c2b7]">
            Varför {rating.ovr?.toFixed(0)}? — mätvärde för mätvärde
          </summary>

          <p className="mt-2 text-[11px] leading-relaxed text-[#898781]">
            Varje mätvärde percentileras mot andra {POSITION_GROUP_LABELS[rating.positionGroup]} och vägs sedan mot
            spelarens historik. Ju färre minuter, desto tyngre väger historiken — kolumnen &quot;prior&quot; visar hur
            stor den andelen är för just det måttet.
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-[11px]">
              <thead>
                <tr className="text-left text-[#7d7c76]">
                  <th className="py-1 font-medium">Mätvärde</th>
                  <th className="py-1 text-right font-medium">Vikt</th>
                  <th className="py-1 text-right font-medium">I år</th>
                  <th className="py-1 text-right font-medium">Historik</th>
                  <th className="py-1 text-right font-medium">Vägt</th>
                  <th className="py-1 text-right font-medium">Min</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {breakdown.metrics.map((m) => (
                  <tr key={m.metric} className="border-t border-white/[.06]">
                    <td className="py-1 pr-2 text-[#c3c2b7]">{m.label}</td>
                    <td className="py-1 text-right text-[#898781]">{m.weight}</td>
                    <td className="py-1 text-right text-[#898781]">{fmt(m.observedPercentile)}</td>
                    <td className="py-1 text-right text-[#898781]">{fmt(m.priorPercentile)}</td>
                    <td className="py-1 text-right font-semibold text-[#c3c2b7]">{fmt(m.adjustedPercentile)}</td>
                    <td className="py-1 text-right text-[#5f5e59]">{m.minutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[10px] text-[#5f5e59]">Talen är percentiler inom positionsgruppen, inte OVR.</p>
          </div>

          {breakdown.contributions.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold text-[#c3c2b7]">Historiken bakom betyget</p>
              <ul className="mt-1 space-y-0.5">
                {breakdown.contributions.map((c, i) => (
                  <li key={`${c.seasonYear}-${c.leagueName}-${i}`} className="text-[11px] text-[#898781]">
                    {c.seasonYear} · {c.leagueName ?? "Allsvenskan"} · {c.minutes} min · vikt {c.weight}
                    {c.leagueCoefficient !== 1 && ` · nivåfaktor ${c.leagueCoefficient.toFixed(2)}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {breakdown.currentSeasonExternal.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold text-[#c3c2b7]">Inräknad speltid utanför Allsvenskan i år</p>
              <ul className="mt-1 space-y-0.5">
                {breakdown.currentSeasonExternal.map((e) => (
                  <li key={e.leagueExternalId} className="text-[11px] text-[#898781]">
                    {e.leagueName} · {e.minutes} min · nivåfaktor {e.leagueCoefficient.toFixed(2)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {breakdown.unratedLeagues.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold text-[#c3c2b7]">Speltid vi inte kunnat värdera</p>
              <ul className="mt-1 space-y-0.5">
                {breakdown.unratedLeagues.map((u, i) => (
                  <li key={`${u.leagueExternalId}-${u.seasonYear}-${i}`} className="text-[11px] text-[#898781]">
                    {u.seasonYear} · {u.leagueName} · {u.minutes} min ·{" "}
                    {u.reason === "cup"
                      ? "cupspel blandar divisioner"
                      : u.reason === "friendly"
                        ? "träningsmatch"
                        : u.reason === "youth"
                          ? "ungdoms-/reservserie"
                          : "ligan saknar verifierad nivåfaktor"}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[10px] leading-relaxed text-[#5f5e59]">
                Den här speltiden påverkar inte betyget. Den redovisas hellre som en synlig lucka än vägs in med en
                gissad nivåfaktor.
              </p>
            </div>
          )}
        </details>
      )}
    </div>
  );
}
