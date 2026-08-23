"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PlayerCard, type PlayerCardData, type PlayerSortKey } from "./PlayerCard";
import { matchesSearchTokens, tokenizeSearchQuery } from "@/lib/football/player-search";
import {
  EMPTY_EXPLORER_FILTERS,
  EXPLORER_POSITIONS,
  type ExplorerFilters,
  type ExplorerSortKey,
} from "@/lib/football/player-explorer-params";
import { computeScoutMatch } from "@/lib/football/scout/scout-match";
import { translatePosition } from "@/lib/i18n/sv";

/**
 * Spelarutforskaren (2026-08-23) — den delade, direktsökande listvyn för
 * /spelare och /scout/spelare.
 *
 * VARFÖR KLIENTSIDAN. Användarfeedbacken var explicit: "när jag skriver ska
 * spelarlistan uppdateras samtidigt". Den gamla vyn var ett `<form
 * method="get">` med en Sök-knapp — varje sökning var en full
 * serverrundtur, och `listPlayers` läser ändå HELA säsongens spelarmängd
 * (~400 rader) innan den filtrerar i JS. Att skicka den mängden EN gång och
 * filtrera i webbläsaren ger noll latens per tangenttryck istället för en
 * rundtur per tangenttryck, utan att någon ny datakälla införs — det är
 * exakt samma rader, samma `listPlayers`, bara filtrerade på andra sidan
 * ledningen. Namnmatchningen delas dessutom med servern
 * (lib/football/player-search.ts), så en delad länk med ?q= ger samma
 * träffar som den direktsökta listan.
 *
 * VAD SOM ÄNDÅ ÄR SERVERSTYRT (och därför navigerar): säsong,
 * jämförelsesäsong och "konsekvent bra". De tre kräver data som inte finns
 * i den skickade mängden (en annan säsongs ratings, respektive HELA
 * player_ratings-tabellen) och hämtas bara när någon faktiskt ber om
 * dem — samma "ingen kostnad om ingen frågar"-princip som player-catalog.ts
 * redan följer. De visar en tydlig laddningsindikator istället för att låtsas
 * vara direkta.
 *
 * URL:en hålls i synk med `history.replaceState` (stöds av Next.js router,
 * se docs 01-app/01-getting-started/04-linking-and-navigating.md) — länken
 * går alltid att dela/ladda om, men uppdateringen kostar ingen rendering.
 */

export interface ExplorerPlayer {
  id: number;
  fullName: string;
  position: string | null;
  photoUrl: string | null;
  teamName: string | null;
  teamExternalId: number | null;
  age: number | null;
  goals: number;
  assists: number;
  appearances: number;
  minutesPlayed: number;
  goalsPer90: number | null;
  rating: number | null;
  ovrDelta: number | null;
  /** Bara nycklarna — etiketter/definitioner skickas EN gång via `archetypeOptions`, inte upprepade per spelare. */
  archetypeKeys: string[];
  seasonsAboveThreshold: number;
}

export interface ExplorerTeam {
  externalId: number;
  name: string;
}

export interface ExplorerArchetype {
  key: string;
  label: string;
  definition: string;
}

/** Hur många kort som renderas åt gången. Filtreringen ser ALLTID hela säsongen — det här är bara hur mycket som ritas ut. */
const RENDER_STEP = 36;

const SORT_LABELS: Record<ExplorerSortKey, string> = {
  rating: "OVR",
  goals: "Mål",
  assists: "Assist",
  goalsPer90: "Mål per 90 min",
  minutes: "Spelade minuter",
  appearances: "Matcher",
  age: "Ålder",
  name: "Namn",
  ovrDelta: "OVR-utveckling",
  consistency: "Konsekvent bra",
};

/** Sorteringsnycklar som spelarkortet kan markera i sin statistikrad. */
const CARD_SORT_KEYS = new Set<string>(["goals", "assists", "appearances", "minutes", "goalsPer90"]);

const NUMBER_FORMAT = new Intl.NumberFormat("sv-SE");

function toNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function PlayerExplorer({
  basePath,
  accent,
  players,
  teams,
  seasons,
  season,
  initialFilters,
  archetypeOptions = [],
  advanced = false,
  compareSeason = null,
  consistencyMinSeasons = null,
  consistencyThreshold,
  selectionMode = "profile",
  selectedId = null,
  sidePanel,
}: {
  /** "/spelare" eller "/scout/spelare" — används både för URL-synk och för korta länkar. */
  basePath: string;
  /** Zonens accentfärg (Fotboll blå / Scout violett), se lib/design/tokens.ts. */
  accent: string;
  players: ExplorerPlayer[];
  teams: ExplorerTeam[];
  seasons: number[];
  season: number | null;
  initialFilters: ExplorerFilters;
  /** Tom array döljer hela spelartyps-sektionen (och matchnings-badgen på korten). Båda listvyerna skickar hela ARCHETYPES idag. */
  archetypeOptions?: ExplorerArchetype[];
  /** Scout: visar assist-/minut-trösklar, utvecklings- och konsekvens-filtren. */
  advanced?: boolean;
  compareSeason?: number | null;
  consistencyMinSeasons?: number | null;
  consistencyThreshold?: number;
  /** "panel" = klick öppnar Scout:s detaljpanel på samma sida, "profile" = gå till spelarsidan. */
  selectionMode?: "panel" | "profile";
  selectedId?: number | null;
  sidePanel?: ReactNode;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<ExplorerFilters>(initialFilters);
  const [panelOpen, setPanelOpen] = useState(false);
  const [visible, setVisible] = useState(RENDER_STEP);
  const [isPending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const archetypeByKey = useMemo(() => new Map(archetypeOptions.map((a) => [a.key, a])), [archetypeOptions]);
  const teamNameByExternalId = useMemo(() => new Map(teams.map((t) => [String(t.externalId), t.name])), [teams]);

  const update = useCallback(<K extends keyof ExplorerFilters>(key: K, value: ExplorerFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setVisible(RENDER_STEP);
  }, []);

  /**
   * Alla sökparametrar som EN sträng. `overrides` används både av URL-synken
   * (inga overrides) och av de serverstyrda kontrollerna (t.ex. ny säsong) —
   * en och samma byggare, så en länk aldrig kan tappa ett aktivt filter.
   */
  const buildQuery = useCallback(
    (overrides: Record<string, string | undefined> = {}) => {
      const params = new URLSearchParams();
      const set = (key: string, value: string | number | null | undefined) => {
        if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
      };
      set("season", season);
      set("compareSeason", compareSeason);
      set("consistencyMinSeasons", consistencyMinSeasons);
      set("q", filters.q.trim());
      set("team", filters.team);
      set("position", filters.position);
      set("ageMin", filters.ageMin);
      set("ageMax", filters.ageMax);
      set("goalsMin", filters.goalsMin);
      set("assistsMin", filters.assistsMin);
      set("minutesMin", filters.minutesMin);
      set("ratingMin", filters.ratingMin);
      set("ratingMax", filters.ratingMax);
      set("ovrDeltaMin", filters.ovrDeltaMin);
      set("ovrDeltaMax", filters.ovrDeltaMax);
      set("sort", filters.sort);
      set("dir", filters.dir);
      set("selected", selectedId);
      for (const [key, value] of Object.entries(overrides)) {
        params.delete(key);
        if (value) params.set(key, value);
      }
      // Arketyperna sist och separat — de är den enda parametern som får
      // förekomma flera gånger, och kan därför inte gå via `set` ovan.
      const archetypes = overrides.archetype === undefined ? filters.archetypes : [];
      for (const key of archetypes) params.append("archetype", key);
      return params.toString();
    },
    [filters, season, compareSeason, consistencyMinSeasons, selectedId]
  );

  // URL-synk utan rendering. Debouncad så snabb inmatning inte skriver till
  // history-API:et en gång per tangenttryck.
  useEffect(() => {
    const timer = setTimeout(() => {
      const qs = buildQuery();
      const next = qs ? `${basePath}?${qs}` : basePath;
      if (next !== window.location.pathname + window.location.search) {
        window.history.replaceState(null, "", next);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [buildQuery, basePath]);

  /** Serverstyrd omladdning (säsong/jämförelsesäsong/konsekvent bra) — stänger alltid detaljpanelen, precis som tidigare. */
  const navigate = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const qs = buildQuery({ selected: undefined, ...overrides });
      startTransition(() => router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false }));
    },
    [buildQuery, basePath, router]
  );

  // Snabbkommando: "/" fokuserar sökfältet var man än står på sidan
  // (samma vana som GitHub/Linear), Escape tömmer det.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA");
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === "Escape" && target === searchRef.current) {
        update("q", "");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [update]);

  const matchParams = useMemo(
    () => ({
      position: filters.position || undefined,
      teamId: filters.team ? Number(filters.team) : undefined,
      ageMin: toNumber(filters.ageMin),
      ageMax: toNumber(filters.ageMax),
      goalsMin: toNumber(filters.goalsMin),
      assistsMin: toNumber(filters.assistsMin),
      minutesMin: toNumber(filters.minutesMin),
      ratingMin: toNumber(filters.ratingMin),
      ratingMax: toNumber(filters.ratingMax),
      ovrDeltaMin: toNumber(filters.ovrDeltaMin),
      ovrDeltaMax: toNumber(filters.ovrDeltaMax),
      consistencyMinSeasons: consistencyMinSeasons ?? undefined,
      archetypeKeys: filters.archetypes.length > 0 ? filters.archetypes : undefined,
      query: filters.q.trim() || undefined,
    }),
    [filters, consistencyMinSeasons]
  );

  const results = useMemo(() => {
    const tokens = tokenizeSearchQuery(filters.q);
    const wanted = new Set(filters.archetypes);
    const list = players.filter((p) => {
      if (matchParams.position && p.position !== matchParams.position) return false;
      if (filters.team && String(p.teamExternalId) !== filters.team) return false;
      if (matchParams.ageMin !== undefined && (p.age === null || p.age < matchParams.ageMin)) return false;
      if (matchParams.ageMax !== undefined && (p.age === null || p.age > matchParams.ageMax)) return false;
      if (matchParams.goalsMin !== undefined && p.goals < matchParams.goalsMin) return false;
      if (matchParams.assistsMin !== undefined && p.assists < matchParams.assistsMin) return false;
      if (matchParams.minutesMin !== undefined && p.minutesPlayed < matchParams.minutesMin) return false;
      if (matchParams.ratingMin !== undefined && (p.rating === null || p.rating < matchParams.ratingMin)) return false;
      if (matchParams.ratingMax !== undefined && (p.rating === null || p.rating > matchParams.ratingMax)) return false;
      if (matchParams.ovrDeltaMin !== undefined && (p.ovrDelta === null || p.ovrDelta < matchParams.ovrDeltaMin)) return false;
      if (matchParams.ovrDeltaMax !== undefined && (p.ovrDelta === null || p.ovrDelta > matchParams.ovrDeltaMax)) return false;
      if (wanted.size > 0 && !p.archetypeKeys.some((k) => wanted.has(k))) return false;
      if (tokens.length > 0 && !matchesSearchTokens(tokens, [p.fullName, p.teamName])) return false;
      return true;
    });

    const dir = filters.dir === "asc" ? 1 : -1;
    // Exakt samma jämförelser som serversidans listPlayers — samma sortering
    // oavsett var den körs (och därmed samma ordning i en delad länk).
    list.sort((a, b) => {
      switch (filters.sort) {
        case "name":
          return dir * a.fullName.localeCompare(b.fullName, "sv");
        case "assists":
          return dir * (a.assists - b.assists);
        case "appearances":
          return dir * (a.appearances - b.appearances);
        case "minutes":
          return dir * (a.minutesPlayed - b.minutesPlayed);
        case "age":
          return dir * ((a.age ?? -1) - (b.age ?? -1));
        case "goalsPer90":
          return dir * ((a.goalsPer90 ?? -1) - (b.goalsPer90 ?? -1));
        case "rating":
          return dir * ((a.rating ?? -1) - (b.rating ?? -1));
        case "ovrDelta":
          return dir * ((a.ovrDelta ?? -100) - (b.ovrDelta ?? -100));
        case "consistency":
          return dir * (a.seasonsAboveThreshold - b.seasonsAboveThreshold);
        case "goals":
        default:
          return dir * (a.goals - b.goals);
      }
    });
    return list;
  }, [players, filters, matchParams]);

  const cards: PlayerCardData[] = useMemo(
    () =>
      results.slice(0, visible).map((p) => ({
        id: p.id,
        full_name: p.fullName,
        position: p.position,
        photoUrl: p.photoUrl,
        teamName: p.teamName,
        teamExternalId: p.teamExternalId,
        age: p.age,
        rating: p.rating,
        ovrDelta: p.ovrDelta,
        archetypes: p.archetypeKeys.map((key) => archetypeByKey.get(key)).filter((a): a is ExplorerArchetype => Boolean(a)),
        scoutMatch: archetypeOptions.length > 0 ? computeScoutMatch(p, matchParams) : null,
        stat: {
          goals: p.goals,
          assists: p.assists,
          appearances: p.appearances,
          minutesPlayed: p.minutesPlayed,
          goalsPer90: p.goalsPer90,
          year: season ?? "all",
        },
      })),
    [results, visible, archetypeByKey, archetypeOptions.length, matchParams, season]
  );

  /** De aktiva filtren som avfärdbara chips — gör läget läsbart utan att man behöver fälla ut panelen. */
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (filters.team) {
      chips.push({
        key: "team",
        label: teamNameByExternalId.get(filters.team) ?? "Vald klubb",
        clear: () => update("team", ""),
      });
    }
    // Position har medvetet INGEN chip — den är redan synlig som markerad
    // snabbknapp ovanför, och två samtidiga representationer av samma filter
    // var precis den sortens dubbelvisning som gjorde den gamla vyn rörig.
    if (filters.ageMin || filters.ageMax) {
      chips.push({
        key: "age",
        label: `${filters.ageMin || "0"}–${filters.ageMax || "45"} år`,
        clear: () => setFilters((prev) => ({ ...prev, ageMin: "", ageMax: "" })),
      });
    }
    if (filters.ratingMin || filters.ratingMax) {
      chips.push({
        key: "rating",
        label: `OVR ${filters.ratingMin || "0"}–${filters.ratingMax || "99"}`,
        clear: () => setFilters((prev) => ({ ...prev, ratingMin: "", ratingMax: "" })),
      });
    }
    if (filters.goalsMin) chips.push({ key: "goals", label: `${filters.goalsMin}+ mål`, clear: () => update("goalsMin", "") });
    if (filters.assistsMin) chips.push({ key: "assists", label: `${filters.assistsMin}+ assist`, clear: () => update("assistsMin", "") });
    if (filters.minutesMin) chips.push({ key: "minutes", label: `${filters.minutesMin}+ min`, clear: () => update("minutesMin", "") });
    if (filters.ovrDeltaMin || filters.ovrDeltaMax) {
      chips.push({
        key: "ovrDelta",
        label: `OVR-utveckling ${filters.ovrDeltaMin || "−∞"}…${filters.ovrDeltaMax || "∞"}`,
        clear: () => setFilters((prev) => ({ ...prev, ovrDeltaMin: "", ovrDeltaMax: "" })),
      });
    }
    for (const key of filters.archetypes) {
      chips.push({
        key: `archetype-${key}`,
        label: archetypeByKey.get(key)?.label ?? key,
        clear: () => update("archetypes", filters.archetypes.filter((k) => k !== key)),
      });
    }
    if (compareSeason) {
      chips.push({ key: "compareSeason", label: `Jämför mot ${compareSeason}`, clear: () => navigate({ compareSeason: undefined }) });
    }
    if (consistencyMinSeasons) {
      chips.push({
        key: "consistency",
        label: `${consistencyMinSeasons}+ säsonger över OVR ${consistencyThreshold ?? 70}`,
        clear: () => navigate({ consistencyMinSeasons: undefined }),
      });
    }
    return chips;
  }, [filters, teamNameByExternalId, archetypeByKey, compareSeason, consistencyMinSeasons, consistencyThreshold, update, navigate]);

  const clearAll = useCallback(() => {
    setFilters((prev) => ({ ...EMPTY_EXPLORER_FILTERS, q: "", sort: prev.sort, dir: prev.dir }));
    setVisible(RENDER_STEP);
    if (compareSeason || consistencyMinSeasons) navigate({ compareSeason: undefined, consistencyMinSeasons: undefined });
  }, [compareSeason, consistencyMinSeasons, navigate]);

  const sortKeys: ExplorerSortKey[] = useMemo(() => {
    const keys: ExplorerSortKey[] = ["rating", "goals", "assists", "goalsPer90", "minutes", "appearances", "age", "name"];
    if (compareSeason) keys.splice(1, 0, "ovrDelta");
    if (consistencyMinSeasons) keys.splice(1, 0, "consistency");
    return keys;
  }, [compareSeason, consistencyMinSeasons]);

  const cardSort = (CARD_SORT_KEYS.has(filters.sort) ? filters.sort : "name") as PlayerSortKey;
  const gridColumns = selectedId ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3";
  const hasAnyFilter = activeChips.length > 0 || filters.q.trim() !== "" || filters.position !== "";

  const teamOptions: DropdownOption[] = useMemo(
    () => [{ value: "", label: "Alla klubbar" }, ...teams.map((t) => ({ value: String(t.externalId), label: t.name }))],
    [teams]
  );
  const seasonOptions: DropdownOption[] = useMemo(() => seasons.map((y) => ({ value: String(y), label: String(y) })), [seasons]);
  const compareOptions: DropdownOption[] = useMemo(
    () => [
      { value: "", label: "Ingen jämförelse" },
      ...seasons.filter((y) => y !== season).map((y) => ({ value: String(y), label: `Säsongen ${y}` })),
    ],
    [seasons, season]
  );

  return (
    <div
      className={`player-explorer ${selectedId ? "grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]" : ""}`}
      // Accentfärgen som CSS-variabel: Tailwind kan generera
      // `border-[var(--accent)]` statiskt, till skillnad från en interpolerad
      // hex-klass (se varningen i lib/design/tokens.ts) — så fokus- och
      // aktivtillstånd får zonens färg utan en inline-style per element.
      style={{ "--accent": accent, "--accent-ring": `${accent}22` } as CSSProperties}
    >
      {/* Detaljpanelen ligger FÖRE listan i ordningen på smala skärmar
          (order-1) — där staplas kolumnerna, och en panel längst ner under 36
          kort hade varit osynlig efter klicket. Från xl, där de ligger sida
          vid sida, går den tillbaka till höger kolumn. */}
      <div className="order-2 min-w-0 lg:order-1">
        {/* ── Kontrollpanel ───────────────────────────────────────────── */}
        <div className="relative rounded-2xl border border-white/[0.08] bg-[#131317]">
          {isPending && (
            <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 overflow-hidden rounded-t-2xl">
              <span className="block h-full w-1/3 rounded-full bg-[var(--accent)] animate-[explorer-scan_1.1s_ease-in-out_infinite]" />
            </span>
          )}

          <div className="flex flex-col gap-2 p-2 sm:flex-row sm:items-center">
            <div className="group relative min-w-0 flex-1">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5f5e59] transition-colors group-focus-within:text-[var(--accent)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={searchRef}
                type="search"
                value={filters.q}
                onChange={(e) => update("q", e.target.value)}
                placeholder="Sök förnamn, efternamn eller klubb…"
                aria-label="Sök spelare"
                autoComplete="off"
                className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#0b0b0e] pl-10 pr-16 text-sm text-white outline-none transition-all placeholder:text-[#5f5e59] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-ring)] [&::-webkit-search-cancel-button]:hidden"
              />
              {filters.q ? (
                <button
                  type="button"
                  onClick={() => {
                    update("q", "");
                    searchRef.current?.focus();
                  }}
                  aria-label="Rensa sökningen"
                  className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-xs text-[#898781] transition-colors hover:bg-white/10 hover:text-white"
                >
                  ✕
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-[#5f5e59] sm:block">
                  /
                </kbd>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {seasonOptions.length > 0 && (
                <Dropdown
                  label="Säsong"
                  value={season ? String(season) : ""}
                  options={seasonOptions}
                  onChange={(v) => navigate({ season: v })}
                  accent={accent}
                  size="lg"
                  align="right"
                  className="w-[104px]"
                />
              )}
              <button
                type="button"
                onClick={() => setPanelOpen((v) => !v)}
                aria-expanded={panelOpen}
                className={`flex h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors ${
                  panelOpen
                    ? "border-white/20 bg-white/[0.06] text-white"
                    : "border-white/[0.08] text-[#c3c2b7] hover:border-white/20 hover:text-white"
                }`}
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 6h16M7 12h10M10 18h4" />
                </svg>
                Filter
                {activeChips.length > 0 && (
                  <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-white">
                    {activeChips.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Snabbval för position — det överlägset vanligaste filtret, och det
              enda som får plats som alltid synliga knappar. Ett klick, ingen
              panel att fälla ut. */}
          <div className="flex items-center gap-0.5 overflow-x-auto border-t border-white/[0.06] px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[{ value: "", label: "Alla" }, ...EXPLORER_POSITIONS.map((p) => ({ value: p as string, label: translatePosition(p) ?? p }))].map(
              (option) => {
                const isActive = filters.position === option.value;
                return (
                  <button
                    key={option.value || "all"}
                    type="button"
                    onClick={() => update("position", option.value)}
                    aria-pressed={isActive}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive ? "bg-[var(--accent)]/15 text-white" : "text-[#898781] hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              }
            )}
          </div>

          {panelOpen && (
            <div className="animate-[explorer-reveal_.18s_ease-out] border-t border-white/[0.06] px-4 pb-4">
              <FilterGroup title="Klubb och ålder">
                <Field label="Klubb" wide>
                  <Dropdown value={filters.team} options={teamOptions} onChange={(v) => update("team", v)} accent={accent} />
                </Field>
                <Field label="Ålder" wide>
                  <Range
                    minValue={filters.ageMin}
                    maxValue={filters.ageMax}
                    onMin={(v) => update("ageMin", v)}
                    onMax={(v) => update("ageMax", v)}
                    min={15}
                    max={45}
                    unit="år"
                  />
                </Field>
              </FilterGroup>

              <FilterGroup title="Betyg och statistik">
                <Field label="OVR" wide hint="Player Rating — den statistiska 0–99-skalan.">
                  <Range
                    minValue={filters.ratingMin}
                    maxValue={filters.ratingMax}
                    onMin={(v) => update("ratingMin", v)}
                    onMax={(v) => update("ratingMax", v)}
                    min={0}
                    max={99}
                  />
                </Field>
                <Field label="Minst mål">
                  <NumberBox value={filters.goalsMin} onChange={(v) => update("goalsMin", v)} min={0} placeholder="0" />
                </Field>
                {advanced && (
                  <>
                    <Field label="Minst assist">
                      <NumberBox value={filters.assistsMin} onChange={(v) => update("assistsMin", v)} min={0} placeholder="0" />
                    </Field>
                    <Field label="Minst minuter">
                      <NumberBox value={filters.minutesMin} onChange={(v) => update("minutesMin", v)} min={0} step={90} placeholder="0" />
                    </Field>
                  </>
                )}
              </FilterGroup>

              {archetypeOptions.length > 0 && (
                <FilterGroup
                  title="Spelartyp"
                  hint="Regelbaserade etiketter byggda på riktig statistik — inga gissningar. Peka på en typ för definitionen."
                >
                  <div className="col-span-full flex flex-wrap gap-1.5">
                    {archetypeOptions.map((a) => {
                      const isActive = filters.archetypes.includes(a.key);
                      return (
                        <button
                          key={a.key}
                          type="button"
                          title={a.definition}
                          onClick={() =>
                            update("archetypes", isActive ? filters.archetypes.filter((k) => k !== a.key) : [...filters.archetypes, a.key])
                          }
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            isActive
                              ? "border-[var(--accent)] bg-[var(--accent)]/15 text-white"
                              : "border-white/[0.08] text-[#898781] hover:border-white/25 hover:text-white"
                          }`}
                        >
                          {a.label}
                        </button>
                      );
                    })}
                  </div>
                </FilterGroup>
              )}

              {advanced && (
                <FilterGroup
                  title="Utveckling över tid"
                  hint="De här två hämtar data utanför den valda säsongen — sidan laddas om när du ändrar dem."
                >
                  <Field label="Jämför OVR mot" wide>
                    <Dropdown
                      value={compareSeason ? String(compareSeason) : ""}
                      options={compareOptions}
                      onChange={(v) => navigate({ compareSeason: v || undefined })}
                      accent={accent}
                    />
                  </Field>
                  <Field label={`Säsonger över OVR ${consistencyThreshold ?? 70}`} wide>
                    <NumberBox
                      value={consistencyMinSeasons ? String(consistencyMinSeasons) : ""}
                      onChange={(v) => navigate({ consistencyMinSeasons: v || undefined })}
                      min={1}
                      placeholder="Minst antal"
                      commitOnBlur
                    />
                  </Field>
                  {compareSeason && (
                    <Field label="OVR-förändring" wide>
                      <Range
                        minValue={filters.ovrDeltaMin}
                        maxValue={filters.ovrDeltaMax}
                        onMin={(v) => update("ovrDeltaMin", v)}
                        onMax={(v) => update("ovrDeltaMax", v)}
                      />
                    </Field>
                  )}
                </FilterGroup>
              )}
            </div>
          )}
        </div>

        {/* ── Resultatrad: antal, aktiva filter, sortering ─────────────── */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="mr-1 text-sm text-[#898781]">
              <span className="font-semibold tabular-nums text-white">{NUMBER_FORMAT.format(results.length)}</span> spelare
            </span>
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.clear}
                className="group flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] py-1 pl-2.5 pr-1.5 text-xs text-[#c3c2b7] transition-colors hover:border-white/20 hover:text-white"
              >
                {chip.label}
                <span aria-hidden className="text-[10px] text-[#5f5e59] transition-colors group-hover:text-white">
                  ✕
                </span>
              </button>
            ))}
            {hasAnyFilter && (
              <button
                type="button"
                onClick={clearAll}
                className="ml-0.5 text-xs text-[#7d7c76] underline-offset-2 transition-colors hover:text-white hover:underline"
              >
                Rensa alla
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Dropdown
              label="Sortera efter"
              value={filters.sort}
              options={sortKeys.map((key) => ({ value: key, label: SORT_LABELS[key] }))}
              onChange={(v) => update("sort", v as ExplorerSortKey)}
              accent={accent}
              size="sm"
              align="right"
              prefix="Sortera:"
              className="w-auto"
            />
            <button
              type="button"
              onClick={() => update("dir", filters.dir === "desc" ? "asc" : "desc")}
              title={filters.dir === "desc" ? "Högst först" : "Lägst först"}
              aria-label={filters.dir === "desc" ? "Sorterar högst först" : "Sorterar lägst först"}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-xs text-[#c3c2b7] transition-colors hover:border-white/25 hover:text-white"
            >
              {filters.dir === "desc" ? "↓" : "↑"}
            </button>
          </div>
        </div>

        {/* ── Resultat ─────────────────────────────────────────────────── */}
        {results.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center">
            <p className="text-sm text-[#c3c2b7]">Ingen spelare matchar sökningen.</p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-[#7d7c76]">
              Prova ett kortare sökord, en annan säsong, eller ta bort ett filter.
            </p>
            {hasAnyFilter && (
              <button
                type="button"
                onClick={clearAll}
                className="mt-5 rounded-lg border border-white/15 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-white/5"
              >
                Rensa alla filter
              </button>
            )}
          </div>
        ) : (
          <>
            <div className={`mt-3 grid grid-cols-1 gap-2.5 ${gridColumns}`}>
              {cards.map((card) => (
                <PlayerCard
                  key={card.id}
                  player={card}
                  accent={accent}
                  sort={cardSort}
                  active={card.id === selectedId}
                  href={selectionMode === "panel" ? `${basePath}?${buildQuery({ selected: String(card.id) })}` : `/spelare/${card.id}`}
                />
              ))}
            </div>

            {visible < results.length && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisible((v) => v + RENDER_STEP)}
                  className="rounded-xl border border-white/[0.08] px-5 py-2.5 text-sm font-medium text-[#c3c2b7] transition-colors hover:border-white/25 hover:bg-white/[0.03] hover:text-white"
                >
                  Visa fler <span className="text-[#5f5e59]">({NUMBER_FORMAT.format(results.length - visible)} kvar)</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {sidePanel && (
        <div className="order-1 min-w-0 lg:order-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          {sidePanel}
        </div>
      )}

      <style>{`
        @keyframes explorer-scan { 0% { transform: translateX(-110%) } 100% { transform: translateX(410%) } }
        @keyframes explorer-reveal { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: none } }
        /* Tangentbordsfokus i zonens accentfärg istället för webbläsarens
           egen ring (som lyste vitgul mitt i den mörka ytan). Fälten har
           redan en egen fokusram via focus-within, så outline gäller bara
           knappar/ledtrådar. */
        .player-explorer button:focus-visible,
        .player-explorer [role="note"]:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .player-explorer input:focus-visible { outline: none; }
      `}</style>
    </div>
  );
}

/* ── Formulärprimitiver ────────────────────────────────────────────────── */

/**
 * En namngiven grupp av fält. Panelen hade annars varit ett platt rutnät av
 * nio likadana rutor där "Konsekvent bra" såg exakt lika viktig ut som
 * "Klubb" — rubrikerna gör det läsbart i ett svep vilken sorts filter man
 * tittar på, utan att något gömts undan.
 */
function FilterGroup({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-b border-white/[0.06] py-4 last:border-b-0 last:pb-1">
      <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5f5e59]">
        {title}
        {hint && <Hint text={hint} />}
      </p>
      {/* Sex kolumner, inte fyra: intervallfälten (`wide`) tar tre var och
          de smala tröskelfälten en var — så varje grupp går jämnt ut på en
          rad istället för att lämna ett ensamt fält hängande på nästa. */}
      <div className="grid grid-cols-2 items-end gap-x-3 gap-y-3 sm:grid-cols-6">{children}</div>
    </section>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <span
      title={text}
      tabIndex={0}
      role="note"
      aria-label={text}
      className="flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-white/15 text-[8px] font-bold normal-case tracking-normal text-[#7d7c76] transition-colors hover:border-white/35 hover:text-white"
    >
      ?
    </span>
  );
}

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-3" : "sm:col-span-1"}>
      <p className="mb-1.5 flex items-center gap-1.5 truncate text-[11px] font-medium text-[#898781]">
        {label}
        {hint && <Hint text={hint} />}
      </p>
      {children}
    </div>
  );
}

export interface DropdownOption {
  value: string;
  label: string;
}

/**
 * Egen dropdown istället för `<select>`. Ett native select öppnar
 * operativsystemets egen lista — ljusgrå och kantig mitt i en mörk yta, det
 * enda i vyn som inte gick att forma (användarfeedback 2026-08-23). Den här
 * ritar listan själv i samma mörka palett, markerar valt alternativ, stänger
 * på Escape och klick utanför, och behåller `role="listbox"`/`aria-selected`
 * så den fortfarande annonseras korrekt av skärmläsare.
 */
function Dropdown({
  value,
  options,
  onChange,
  accent,
  label,
  prefix,
  size = "md",
  align = "left",
  className = "w-full",
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  accent: string;
  /** Osynlig etikett för skärmläsare när kontrollen saknar en synlig rubrik. */
  label?: string;
  /** Liten inledande text i knappen, t.ex. "Sortera:". */
  prefix?: string;
  size?: "sm" | "md" | "lg";
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const height = size === "lg" ? "h-11" : size === "sm" ? "h-8" : "h-9";
  const textSize = size === "sm" ? "text-xs" : "text-sm";
  const surface = size === "sm" ? "bg-transparent" : "bg-[#0b0b0e]";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 ${height} ${textSize} font-medium transition-colors ${
          open ? "border-white/25 bg-white/[0.05] text-white" : `border-white/[0.08] ${surface} text-white hover:border-white/20`
        }`}
      >
        <span className="flex min-w-0 items-baseline gap-1.5">
          {prefix && <span className="shrink-0 font-normal text-[#5f5e59]">{prefix}</span>}
          <span className={`truncate ${selected ? "" : "text-[#5f5e59]"}`}>{selected?.label ?? "Välj…"}</span>
        </span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 shrink-0 text-[#7d7c76] transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className={`absolute z-30 mt-1.5 max-h-64 min-w-full overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-[#191920] p-1 shadow-2xl shadow-black/70 animate-[explorer-reveal_.14s_ease-out] [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:bg-transparent ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value || "__all"}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                  isSelected ? "bg-white/[0.06] text-white" : "text-[#c3c2b7] hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {option.label}
                {isSelected && (
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: accent }}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const NUMBER_INPUT_CLASS =
  "h-9 w-full min-w-0 bg-transparent px-3 text-sm tabular-nums text-white outline-none placeholder:text-[#4a4a52] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function NumberBox({
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
  commitOnBlur = false,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  /** För serverstyrda fält: skicka först när fältet lämnas eller Enter trycks, så varje siffra inte blir en egen omladdning. */
  commitOnBlur?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#0b0b0e] transition-colors focus-within:border-[var(--accent)]">
      {commitOnBlur ? (
        // Okontrollerat fält med `key={value}`: användaren skriver fritt utan
        // att varje siffra blir en omladdning, och när det bekräftade värdet
        // väl ändras (navigeringen är klar) byts nyckeln och fältet
        // återskapas med det nya värdet. Ingen draft-state att synka i en
        // effekt — se react-hooks/set-state-in-effect.
        <input
          key={value}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          className={NUMBER_INPUT_CLASS}
          defaultValue={value}
          onBlur={(e) => e.target.value !== value && onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      ) : (
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          className={NUMBER_INPUT_CLASS}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

/**
 * Min–max som EN kontroll i en ram, inte två fristående rutor med ett
 * bindestreck emellan — intervallet läses då som en sak, och panelen slutar
 * se ut som ett formulär med dubbelt så många fält som det egentligen har.
 */
function Range({
  minValue,
  maxValue,
  onMin,
  onMax,
  min,
  max,
  unit,
}: {
  minValue: string;
  maxValue: string;
  onMin: (value: string) => void;
  onMax: (value: string) => void;
  min?: number;
  max?: number;
  unit?: string;
}) {
  return (
    <div className="flex items-center rounded-lg border border-white/[0.08] bg-[#0b0b0e] transition-colors focus-within:border-[var(--accent)]">
      <input
        type="number"
        inputMode="numeric"
        value={minValue}
        min={min}
        max={max}
        placeholder={min !== undefined ? String(min) : "min"}
        onChange={(e) => onMin(e.target.value)}
        aria-label="Från"
        className={NUMBER_INPUT_CLASS}
      />
      <span aria-hidden className="shrink-0 text-xs text-[#3f3f47]">
        –
      </span>
      <input
        type="number"
        inputMode="numeric"
        value={maxValue}
        min={min}
        max={max}
        placeholder={max !== undefined ? String(max) : "max"}
        onChange={(e) => onMax(e.target.value)}
        aria-label="Till"
        className={NUMBER_INPUT_CLASS}
      />
      {unit && (
        <span aria-hidden className="shrink-0 pr-3 text-[11px] text-[#5f5e59]">
          {unit}
        </span>
      )}
    </div>
  );
}
