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

export interface SportmonksFixtureDetail extends SportmonksFixtureSummary {
  participants?: SportmonksTeam[];
  lineups?: SportmonksLineupEntry[];
  statistics?: SportmonksTypedValueRow[];
  xgfixture?: SportmonksTypedValueRow[];
  matchfacts?: SportmonksMatchFact[];
  metadata?: SportmonksMetadataRow[];
  pressure?: SportmonksPressureRow[];
  events?: { id: number; type_id: number; participant_id: number; minute: number }[];
}
