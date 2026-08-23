import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { IN_PLAY_STATUSES, matchPhase, liveClockLabel, statusShortLabel, type MatchPhase } from "./live-status";
import type { MatchClockAnchor } from "./match-clock";
import { liveStatMeta } from "./live-stat-types";
import { displayPlayerName } from "./player-name";

type Supabase = SupabaseClient<Database>;

/**
 * Fas 20 (2026-08-23) — det SMALA live-flödet.
 *
 * Matchsidan (app/(app)/(content)/matcher/[id]/page.tsx) gör ~15 separata
 * Supabase-frågor för att rendera en match: rapport, lagstatistik,
 * laguppställningar, Sportmonks-fakta, inloggad användare, premiumroll,
 * H2H, formsekvenser för båda lagen, tabellplacering. Det är rimligt för en
 * sida som renderas en gång — men förödande att upprepa var 20:e sekund.
 *
 * Den här modulen hämtar bara det som FAKTISKT ändrar sig under en match:
 * status, minut, ställning, händelser och live-statistik. Tre frågor, inga
 * joins mot spelarbetyg eller säsongsaggregat. Både matchlistan och
 * matchvyn pollar samma form, så det bara finns EN definition av "vad är
 * färskt just nu" att hålla korrekt.
 *
 * Ingen data hittas på: saknas en snapshot returneras null-fält och UI:t
 * visar "väntar på data", aldrig en nolla som ser ut som ett mätvärde.
 */

export interface LiveFeedEvent {
  type: string;
  detail: string | null;
  minute: number;
  extraMinute: number | null;
  /** Vilken sida händelsen tillhör — null när laget inte kunde bestämmas. */
  side: "home" | "away" | null;
  player: string | null;
  playerId: number | null;
  assist: string | null;
  assistId: number | null;
}

export interface LiveFeedStats {
  possession: { home: number | null; away: number | null } | null;
  shots: { home: number | null; away: number | null } | null;
  shotsOnTarget: { home: number | null; away: number | null } | null;
  corners: { home: number | null; away: number | null } | null;
}

/** En rad ur den löpande matchkommentaren. Texten är engelsk, se migrationen. */
export interface LiveComment {
  id: number;
  comment: string;
  minute: number | null;
  extraMinute: number | null;
  isGoal: boolean;
  isImportant: boolean;
}

/** Ett statistikmått med båda lagens värden, färdigt att rita som jämförelse. */
export interface LiveStatRow {
  typeId: number;
  label: string;
  suffix?: string;
  decimals?: number;
  home: number | null;
  away: number | null;
}

/** En punkt i momentumkurvan — pressure per minut, per lag. */
export interface MomentumPoint {
  minute: number;
  home: number | null;
  away: number | null;
}

export interface LiveFeedMatch {
  fixtureId: number;
  kickoff: string;
  round: string | null;
  status: string;
  phase: MatchPhase;
  /** Färdig text för minut-pillen ("67′", "Halvtid") — null när matchen inte pågår. */
  clock: string | null;
  /** Kort svensk statustext, alltid satt (t.ex. "Kommande", "Slut"). */
  statusLabel: string | null;
  minute: number | null;
  home: { id: number; name: string; logoUrl: string | null } | null;
  away: { id: number; name: string; logoUrl: string | null } | null;
  homeScore: number | null;
  awayScore: number | null;
  /** När live-pipelinen senast läste av matchen. null = ingen avläsning än. */
  lastUpdated: string | null;
  events: LiveFeedEvent[];
  stats: LiveFeedStats | null;
  /**
   * Fas 21 — matchhubbens extradata. Fylls BARA när flödet hämtas för
   * bestämda matcher (matchvyn), aldrig i dagslistan: kommentarer och
   * minutupplöst momentum för åtta matcher hade gjort listans svar tiotals
   * gånger större utan att något av det syns där.
   */
  clockAnchor: MatchClockAnchor | null;
  comments: LiveComment[];
  liveStats: LiveStatRow[];
  momentum: MomentumPoint[];
  /** Sportmonks formation per lag, från metadata type_id 159. */
  formation: { home: string | null; away: string | null } | null;
}

export interface LiveFeed {
  matches: LiveFeedMatch[];
  /** Serverns rekommenderade tid till nästa hämtning. Klienten följer den. */
  nextRefreshSeconds: number;
  fetchedAt: string;
}

/**
 * Pollningstakt för KLIENTEN. Medvetet glesare än pipelinens egen takt mot
 * API-Football (30 s, se app/api/cron/live/route.ts) — det finns ingen
 * anledning för webbläsaren att fråga tätare än datan kan bli ny, och varje
 * hämtning är tre databasfrågor per öppen flik.
 */
const CLIENT_INTERVAL_SECONDS = {
  live: 20,
  paused: 60,
  /** Avspark nära: fånga övergången utan att mala i onödan innan dess. */
  imminent: 60,
  /** Inget pågår men dagen har matcher kvar. */
  idle: 300,
} as const;

const IMMINENT_KICKOFF_MS = 15 * 60 * 1000;

export function computeNextRefreshSeconds(matches: LiveFeedMatch[]): number {
  if (matches.some((m) => m.phase === "live")) return CLIENT_INTERVAL_SECONDS.live;
  if (matches.some((m) => m.phase === "paused")) return CLIENT_INTERVAL_SECONDS.paused;
  const now = Date.now();
  const imminent = matches.some((m) => {
    if (m.phase !== "upcoming") return false;
    const delta = new Date(m.kickoff).getTime() - now;
    return delta > 0 && delta <= IMMINENT_KICKOFF_MS;
  });
  if (imminent) return CLIENT_INTERVAL_SECONDS.imminent;
  return CLIENT_INTERVAL_SECONDS.idle;
}

interface FixtureRow {
  id: number;
  kickoff_at: string;
  status: string;
  round: string | null;
  home_score: number | null;
  away_score: number | null;
  home: { id: number; name: string; logo_url: string | null } | null;
  away: { id: number; name: string; logo_url: string | null } | null;
}

interface SnapshotRow {
  fixture_id: number;
  captured_at: string;
  match_minute: number | null;
  home_score: number | null;
  away_score: number | null;
  home_possession_pct: number | null;
  away_possession_pct: number | null;
  home_shots_total: number | null;
  away_shots_total: number | null;
  home_shots_on_target: number | null;
  away_shots_on_target: number | null;
  home_corners: number | null;
  away_corners: number | null;
}

interface EventRow {
  fixture_id: number;
  type: string;
  detail: string | null;
  minute: number;
  extra_minute: number | null;
  team_id: number | null;
  player: { id: number; full_name: string; first_name: string | null; last_name: string | null } | null;
  assist: { id: number; full_name: string; first_name: string | null; last_name: string | null } | null;
}

/** Ett par (home/away) bara om minst ett av värdena finns — aldrig två null. */
function pair(home: number | null, away: number | null) {
  return home != null || away != null ? { home, away } : null;
}

const FIXTURE_SELECT =
  "id, kickoff_at, status, round, home_score, away_score, home:home_team_id(id, name, logo_url), away:away_team_id(id, name, logo_url)";

/**
 * Matcherna som är intressanta "just nu": allt som sparkar igång under det
 * svenska dygnet plus allt som faktiskt pågår (en match som dragit över
 * midnatt ska inte försvinna ur flödet).
 */
export async function getLiveFeedForToday(supabase: Supabase): Promise<LiveFeed> {
  // Dygnsgränserna räknas i svensk lokaltid, inte UTC — annars hamnar en
  // kvällsmatch fel i förhållande till vad användaren kallar "idag".
  const now = new Date();
  const swedishToday = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(now);
  const dayStart = new Date(`${swedishToday}T00:00:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const { data: todays, error } = await supabase
    .from("fixture")
    .select(FIXTURE_SELECT)
    .gte("kickoff_at", dayStart.toISOString())
    .lt("kickoff_at", dayEnd.toISOString())
    .order("kickoff_at", { ascending: true })
    .returns<FixtureRow[]>();
  if (error) throw error;

  const { data: inPlay, error: inPlayError } = await supabase
    .from("fixture")
    .select(FIXTURE_SELECT)
    .in("status", IN_PLAY_STATUSES)
    .returns<FixtureRow[]>();
  if (inPlayError) throw inPlayError;

  const byId = new Map<number, FixtureRow>();
  for (const f of [...(todays ?? []), ...(inPlay ?? [])]) byId.set(f.id, f);
  const fixtures = [...byId.values()].sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));

  return buildFeed(supabase, fixtures);
}

/**
 * Samma flöde, men för en bestämd uppsättning matcher (matchvyns polling) —
 * OCH med matchhubbens extradata: klocka, kommentar, full statistik, momentum.
 */
export async function getLiveFeedForFixtures(supabase: Supabase, fixtureIds: number[]): Promise<LiveFeed> {
  if (fixtureIds.length === 0) {
    return { matches: [], nextRefreshSeconds: CLIENT_INTERVAL_SECONDS.idle, fetchedAt: new Date().toISOString() };
  }
  const { data, error } = await supabase.from("fixture").select(FIXTURE_SELECT).in("id", fixtureIds).returns<FixtureRow[]>();
  if (error) throw error;
  return buildFeed(supabase, data ?? [], { detail: true });
}

/**
 * Fas 21-tabellerna (migration 20260823120000) kan saknas i en miljö där
 * migrationen inte körts än. Hela matchhubben ska då degradera till Fas 20:s
 * enklare vy istället för att sidan går sönder — samma hållning som
 * startsidans live-yta redan har mot fixture_live_snapshots.
 */
async function safeSelect<T>(run: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await run();
    if (error || !Array.isArray(data)) return [];
    return data as T[];
  } catch {
    return [];
  }
}

interface HubData {
  clockByFixture: Map<number, MatchClockAnchor>;
  commentsByFixture: Map<number, LiveComment[]>;
  statsByFixture: Map<number, LiveStatRow[]>;
  momentumByFixture: Map<number, MomentumPoint[]>;
  formationByFixture: Map<number, { home: string | null; away: string | null }>;
}

/** Hur många kommentarsrader som följer med i flödet. Resten hämtas inte. */
const COMMENT_LIMIT = 60;

async function loadHubData(supabase: Supabase, fixtures: FixtureRow[]): Promise<HubData> {
  const ids = fixtures.map((f) => f.id);
  const empty: HubData = {
    clockByFixture: new Map(),
    commentsByFixture: new Map(),
    statsByFixture: new Map(),
    momentumByFixture: new Map(),
    formationByFixture: new Map(),
  };

  const [periods, comments, stats, pressure, metadata] = await Promise.all([
    safeSelect<{
      fixture_id: number;
      description: string | null;
      counts_from: number | null;
      period_length: number | null;
      time_added: number | null;
      minutes: number | null;
      seconds: number | null;
      ticking: boolean;
      updated_at: string;
      sort_order: number | null;
    }>(() =>
      supabase
        .from("fixture_period")
        .select("fixture_id, description, counts_from, period_length, time_added, minutes, seconds, ticking, updated_at, sort_order")
        .in("fixture_id", ids)
        .order("sort_order", { ascending: false })
    ),
    safeSelect<{
      fixture_id: number;
      id: number;
      comment: string;
      minute: number | null;
      extra_minute: number | null;
      is_goal: boolean;
      is_important: boolean;
      sort_order: number | null;
    }>(() =>
      supabase
        .from("fixture_comment")
        .select("fixture_id, id, comment, minute, extra_minute, is_goal, is_important, sort_order")
        .in("fixture_id", ids)
        .order("sort_order", { ascending: false })
        .limit(COMMENT_LIMIT * Math.max(1, ids.length))
    ),
    safeSelect<{ fixture_id: number; team_id: number | null; type_id: number; value: number | null }>(() =>
      supabase.from("fixture_live_team_stat").select("fixture_id, team_id, type_id, value").in("fixture_id", ids)
    ),
    safeSelect<{ fixture_id: number; team_id: number; minute: number; pressure: number }>(() =>
      supabase.from("fixture_pressure_index").select("fixture_id, team_id, minute, pressure").in("fixture_id", ids).order("minute")
    ),
    safeSelect<{ fixture_id: number; type_id: number; values: unknown }>(() =>
      supabase.from("fixture_sportmonks_metadata").select("fixture_id, type_id, values").in("fixture_id", ids).eq("type_id", 159)
    ),
  ]);

  // Klockan: den period som pågår, annars den senaste. sort_order är
  // fallande ovan, så första träffen per match är den aktuella.
  for (const p of periods) {
    if (empty.clockByFixture.has(p.fixture_id)) continue;
    empty.clockByFixture.set(p.fixture_id, {
      description: p.description,
      countsFrom: p.counts_from ?? 0,
      periodLength: p.period_length,
      timeAdded: p.time_added,
      ticking: p.ticking,
      minutes: p.minutes,
      seconds: p.seconds,
      // Ankaret är när RADEN senast skrevs, inte när vi läste den — det är
      // den tidpunkt Sportmonks minut/sekund gällde.
      readAt: p.updated_at,
    });
  }

  for (const c of comments) {
    const list = empty.commentsByFixture.get(c.fixture_id) ?? [];
    if (list.length >= COMMENT_LIMIT) continue;
    list.push({
      id: c.id,
      comment: c.comment,
      minute: c.minute,
      extraMinute: c.extra_minute,
      isGoal: c.is_goal,
      isImportant: c.is_important,
    });
    empty.commentsByFixture.set(c.fixture_id, list);
  }

  // Statistiken kommer som en rad per (lag, typ) — vänds till en rad per typ
  // med båda lagens värden, vilket är hur den ska visas.
  for (const fixture of fixtures) {
    const rows = stats.filter((s) => s.fixture_id === fixture.id);
    const byType = new Map<number, { home: number | null; away: number | null }>();
    for (const row of rows) {
      const entry = byType.get(row.type_id) ?? { home: null, away: null };
      if (row.team_id === fixture.home?.id) entry.home = row.value;
      else if (row.team_id === fixture.away?.id) entry.away = row.value;
      byType.set(row.type_id, entry);
    }
    const statRows: LiveStatRow[] = [...byType.entries()]
      .map(([typeId, value]) => {
        const meta = liveStatMeta(typeId);
        return { typeId, label: meta.label, suffix: meta.suffix, decimals: meta.decimals, home: value.home, away: value.away };
      })
      // En rad där ingen sida har ett värde säger ingenting — visa den aldrig.
      .filter((r) => r.home != null || r.away != null);
    if (statRows.length > 0) empty.statsByFixture.set(fixture.id, statRows);

    const pressureRows = pressure.filter((p) => p.fixture_id === fixture.id);
    if (pressureRows.length > 0) {
      const byMinute = new Map<number, MomentumPoint>();
      for (const row of pressureRows) {
        const point = byMinute.get(row.minute) ?? { minute: row.minute, home: null, away: null };
        if (row.team_id === fixture.home?.id) point.home = row.pressure;
        else if (row.team_id === fixture.away?.id) point.away = row.pressure;
        byMinute.set(row.minute, point);
      }
      empty.momentumByFixture.set(
        fixture.id,
        [...byMinute.values()].sort((a, b) => a.minute - b.minute)
      );
    }

    const meta = metadata.find((m) => m.fixture_id === fixture.id);
    if (meta && meta.values && typeof meta.values === "object") {
      const values = meta.values as { home?: unknown; away?: unknown };
      empty.formationByFixture.set(fixture.id, {
        home: typeof values.home === "string" ? values.home : null,
        away: typeof values.away === "string" ? values.away : null,
      });
    }
  }

  return empty;
}

async function buildFeed(supabase: Supabase, fixtures: FixtureRow[], options: { detail?: boolean } = {}): Promise<LiveFeed> {
  const fetchedAt = new Date().toISOString();
  if (fixtures.length === 0) {
    return { matches: [], nextRefreshSeconds: CLIENT_INTERVAL_SECONDS.idle, fetchedAt };
  }

  const ids = fixtures.map((f) => f.id);
  const hub = options.detail ? await loadHubData(supabase, fixtures) : null;

  // Senaste snapshot per match. Supabase saknar "senaste per grupp", så vi
  // sorterar fallande och tar första träffen per fixture_id i JS — samma
  // mönster som getLiveMatches redan använder.
  const { data: snapshots } = await supabase
    .from("fixture_live_snapshots")
    .select(
      "fixture_id, captured_at, match_minute, home_score, away_score, home_possession_pct, away_possession_pct, home_shots_total, away_shots_total, home_shots_on_target, away_shots_on_target, home_corners, away_corners"
    )
    .in("fixture_id", ids)
    .order("captured_at", { ascending: false })
    .returns<SnapshotRow[]>();

  const latestSnapshot = new Map<number, SnapshotRow>();
  for (const s of snapshots ?? []) if (!latestSnapshot.has(s.fixture_id)) latestSnapshot.set(s.fixture_id, s);

  const { data: events } = await supabase
    .from("event")
    .select(
      "fixture_id, type, detail, minute, extra_minute, team_id, player:player_id(id, full_name, first_name, last_name), assist:assist_player_id(id, full_name, first_name, last_name)"
    )
    .in("fixture_id", ids)
    .order("minute", { ascending: true })
    .returns<EventRow[]>();

  const eventsByFixture = new Map<number, EventRow[]>();
  for (const e of events ?? []) {
    const list = eventsByFixture.get(e.fixture_id) ?? [];
    list.push(e);
    eventsByFixture.set(e.fixture_id, list);
  }

  const matches: LiveFeedMatch[] = fixtures.map((f) => {
    const snap = latestSnapshot.get(f.id) ?? null;
    const phase = matchPhase(f.status);
    const inPlay = phase === "live" || phase === "paused";
    const minute = snap?.match_minute ?? null;

    // Ställningen: fixture-raden är sedan Fas 20 uppdaterad live och är
    // därför förstahandskällan. Snapshoten används bara som utfyllnad för
    // en match där fixture-raden ännu inte hunnit skrivas.
    const homeScore = f.home_score ?? snap?.home_score ?? null;
    const awayScore = f.away_score ?? snap?.away_score ?? null;

    return {
      fixtureId: f.id,
      kickoff: f.kickoff_at,
      round: f.round,
      status: f.status,
      phase,
      clock: liveClockLabel(f.status, minute),
      statusLabel: statusShortLabel(f.status),
      minute,
      home: f.home ? { id: f.home.id, name: f.home.name, logoUrl: f.home.logo_url } : null,
      away: f.away ? { id: f.away.id, name: f.away.name, logoUrl: f.away.logo_url } : null,
      homeScore,
      awayScore,
      lastUpdated: snap?.captured_at ?? null,
      events: (eventsByFixture.get(f.id) ?? []).map((e) => ({
        type: e.type,
        detail: e.detail,
        minute: e.minute,
        extraMinute: e.extra_minute,
        side: e.team_id === f.home?.id ? "home" : e.team_id === f.away?.id ? "away" : null,
        player: e.player ? displayPlayerName(e.player.first_name, e.player.last_name, e.player.full_name) : null,
        playerId: e.player?.id ?? null,
        assist: e.assist ? displayPlayerName(e.assist.first_name, e.assist.last_name, e.assist.full_name) : null,
        assistId: e.assist?.id ?? null,
      })),
      stats:
        inPlay && snap
          ? {
              possession: pair(snap.home_possession_pct, snap.away_possession_pct),
              shots: pair(snap.home_shots_total, snap.away_shots_total),
              shotsOnTarget: pair(snap.home_shots_on_target, snap.away_shots_on_target),
              corners: pair(snap.home_corners, snap.away_corners),
            }
          : null,
      clockAnchor: hub?.clockByFixture.get(f.id) ?? null,
      comments: hub?.commentsByFixture.get(f.id) ?? [],
      liveStats: hub?.statsByFixture.get(f.id) ?? [],
      momentum: hub?.momentumByFixture.get(f.id) ?? [],
      formation: hub?.formationByFixture.get(f.id) ?? null,
    };
  });

  return { matches, nextRefreshSeconds: computeNextRefreshSeconds(matches), fetchedAt };
}
