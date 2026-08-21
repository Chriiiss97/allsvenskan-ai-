/**
 * TypeScript-typer för Sportmonks Football API v3 — byggda på RIKTIGA
 * testanrop denna session (tre Allsvenska matcher, 2024/2025/2026,
 * `include=participants;lineups.details;statistics;events;xgfixture;
 * matchfacts;metadata;pressure`), inte gissade ur dokumentationen.
 *
 * Sportmonks generiska `{type_id, data:{value}}`-mönster (till skillnad från
 * API-Footballs platta namngivna fält) kräver en separat uppslagstabell för
 * att avkoda vad varje type_id betyder — se sportmonks_type-tabellen
 * (20260821150000-migrationen) och lib/sportmonks/resolve-type.ts (Fas 5+).
 */

export interface SportmonksType {
  id: number;
  name: string;
  code: string | null;
  stat_group: string | null;
  developer_name?: string;
  model_type?: string;
}

export interface SportmonksSeason {
  id: number;
  name: string;
  is_current: boolean;
}

export interface SportmonksLeague {
  id: number;
  name: string;
  active: boolean;
  seasons?: SportmonksSeason[];
}

export interface SportmonksTeam {
  id: number;
  name: string;
  short_code: string | null;
  image_path: string | null;
  country_id: number | null;
}

export interface SportmonksFixtureSummary {
  id: number;
  league_id: number;
  season_id: number;
  starting_at: string;
  state_id: number;
  name: string | null;
}

/** Generisk {type_id, data:{value}}-rad — grunden för statistics/xgfixture/trends. */
export interface SportmonksTypedValueRow {
  id: number;
  fixture_id: number;
  type_id: number;
  participant_id: number;
  data: { value: number | boolean | string };
  location?: "home" | "away";
}

export interface SportmonksLineupDetail {
  type_id: number;
  data: { value: number | boolean | string };
}

export interface SportmonksLineupEntry {
  id: number;
  fixture_id: number;
  player_id: number;
  team_id: number;
  player_name: string;
  type_id: number; // startXI vs substitute — avkodas via sportmonks_type
  details?: SportmonksLineupDetail[];
}

export interface SportmonksPressureRow {
  id: number;
  fixture_id: number;
  participant_id: number;
  minute: number;
  pressure: number;
}

/** Heterogen data-shape mellan de 139+ observerade typerna — se value_shape-klassificering vid import (Fas 7). */
export interface SportmonksMatchFact {
  id: number;
  sport_id: number;
  fixture_id: number;
  type_id: number;
  participant: "home" | "away" | "both" | null;
  basis: string | null;
  data: Record<string, unknown>;
  natural_language: string | null;
  category: string | null;
  scope: string | null;
}

export interface SportmonksMetadataRow {
  id: number;
  metadatable_id: number;
  type_id: number;
  value_type: string;
  values: Record<string, unknown>;
}

/**
 * Rik händelse (Fas 5b) — fälten är EXAKT vad ett riktigt /events-anrop gav
 * för en match med rött kort (fixture 19049416) denna session, inte gissat.
 * result = löpande ställning vid händelsen; addition = läsbar beskrivning
 * ("1st Goal"); rescinded = VAR-upphävt.
 */
export interface SportmonksRichEvent {
  id: number;
  fixture_id: number;
  period_id: number | null;
  participant_id: number;
  type_id: number;
  sub_type_id: number | null;
  section: string | null;
  player_id: number | null;
  related_player_id: number | null;
  player_name: string | null;
  related_player_name: string | null;
  result: string | null;
  info: string | null;
  addition: string | null;
  minute: number;
  extra_minute: number | null;
  injured: boolean | null;
  on_bench: boolean | null;
  rescinded: boolean | null;
  sort_order: number | null;
}

/** Minutstämplad lagstatistik-avläsning (Fas 5b, `include=trends`). */
export interface SportmonksTrendRow {
  id: number;
  fixture_id: number;
  participant_id: number;
  type_id: number;
  period_id: number | null;
  value: number;
  minute: number;
}

/** Väderprognos/rapport (Fas 5b, `include=weatherreport`). */
export interface SportmonksWeatherReport {
  id: number;
  fixture_id: number;
  venue_id: number | null;
  temperature: { day: number; morning: number; evening: number; night: number } | null;
  feels_like: { day: number; morning: number; evening: number; night: number } | null;
  wind: { speed: number; direction: number } | null;
  humidity: string | null; // "61%"
  pressure: number | null;
  clouds: string | null; // "84%"
  description: string | null;
  type: string | null; // 'forecast' | 'current' m.fl.
}

export interface SportmonksFixtureDetail extends SportmonksFixtureSummary {
  participants?: SportmonksTeam[];
  lineups?: SportmonksLineupEntry[];
  statistics?: SportmonksTypedValueRow[];
  xgfixture?: SportmonksTypedValueRow[];
  matchfacts?: SportmonksMatchFact[];
  metadata?: SportmonksMetadataRow[];
  pressure?: SportmonksPressureRow[];
  events?: SportmonksRichEvent[];
  trends?: SportmonksTrendRow[];
  weatherreport?: SportmonksWeatherReport | null;
  predictedlineups?: unknown[]; // overifierat om den nagonsin populeras, se Fas 5b-forskningen
}
