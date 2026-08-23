import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { IN_PLAY_STATUSES, matchPhase, liveClockLabel, statusShortLabel, type MatchPhase } from "./live-status";

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
  player: { id: number; full_name: string } | null;
  assist: { id: number; full_name: string } | null;
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

/** Samma flöde, men för en bestämd uppsättning matcher (matchvyns polling). */
export async function getLiveFeedForFixtures(supabase: Supabase, fixtureIds: number[]): Promise<LiveFeed> {
  if (fixtureIds.length === 0) {
    return { matches: [], nextRefreshSeconds: CLIENT_INTERVAL_SECONDS.idle, fetchedAt: new Date().toISOString() };
  }
  const { data, error } = await supabase.from("fixture").select(FIXTURE_SELECT).in("id", fixtureIds).returns<FixtureRow[]>();
  if (error) throw error;
  return buildFeed(supabase, data ?? []);
}

async function buildFeed(supabase: Supabase, fixtures: FixtureRow[]): Promise<LiveFeed> {
  const fetchedAt = new Date().toISOString();
  if (fixtures.length === 0) {
    return { matches: [], nextRefreshSeconds: CLIENT_INTERVAL_SECONDS.idle, fetchedAt };
  }

  const ids = fixtures.map((f) => f.id);

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
    .select("fixture_id, type, detail, minute, extra_minute, team_id, player:player_id(id, full_name), assist:assist_player_id(id, full_name)")
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
        player: e.player?.full_name ?? null,
        playerId: e.player?.id ?? null,
        assist: e.assist?.full_name ?? null,
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
    };
  });

  return { matches, nextRefreshSeconds: computeNextRefreshSeconds(matches), fetchedAt };
}
