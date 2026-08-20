/**
 * Positionsgrupp för peer-jämförelser (getPlayerProfile/computePlayerDNA).
 *
 * Samma indelning som lib/i18n/sv.ts:s POSITION_LABELS (Attacker/Forward
 * slås ihop), men här som ren speldatalogik: används för att jämföra en
 * spelare mot ANDRA SPELARE PÅ SAMMA POSITION, aldrig mot en pool som
 * blandar in målvakter (som nästan aldrig tacklar) och försvarare (som
 * nästan alltid gör det). Utan den här uppdelningen blir "bättre än
 * snittet" på ett försvarsmått en artefakt av VILKA som råkar vara i
 * poolen, inte ett verkligt uttalande om spelaren — det var precis så en
 * anfallare (A. Ahmed Fatah, säsong 2022) kunde se ut som "bättre än
 * snittet på försvar" trots att hans tacklingssiffra bara var hög jämfört
 * med en pool som innehöll målvakter med ~0 tacklingar/90.
 */
export type PositionGroupKey = "attacker" | "midfielder" | "defender" | "goalkeeper";

export interface PositionGroupInfo {
  group: PositionGroupKey;
  /** Svensk pluralform för meningar som "jämfört med 11 andra {label}". */
  label: string;
}

const POSITION_GROUPS: Record<string, PositionGroupInfo> = {
  Goalkeeper: { group: "goalkeeper", label: "målvakter" },
  Defender: { group: "defender", label: "försvarare" },
  Midfielder: { group: "midfielder", label: "mittfältare" },
  Attacker: { group: "attacker", label: "anfallare" },
  Forward: { group: "attacker", label: "anfallare" },
};

export function getPositionGroup(position: string | null | undefined): PositionGroupInfo | null {
  if (!position) return null;
  return POSITION_GROUPS[position] ?? null;
}

/**
 * Minsta antal spelade minuter för att räknas som en stabil jämförelsepunkt
 * (~5 matcher). Under den gränsen blir per-90-tal lätt missvisande — en enda
 * tackling på 24 minuter blir "3.75/90" och kan dra ett litet peer-underlag
 * åt fel håll.
 */
export const MIN_PEER_MINUTES = 450;

/**
 * Om färre än så här många spelare klarar minutgränsen (litet underlag,
 * t.ex. bara 2 målvakter totalt i vår IFK/AIK-pool) används alla peers på
 * samma position oavsett minuter istället för att gränsen skulle göra
 * underlaget ännu mindre — men resultatet flaggas som lågt konfidensunderlag
 * i UI:t (peerGroup.isLowSample) istället för att presenteras som säkert.
 */
export const MIN_PEER_COUNT = 4;

export interface PeerGroupSummary {
  /** Svensk pluralform, t.ex. "anfallare" — "spelare" om position saknas. */
  label: string;
  /** Antal peers jämförelsen faktiskt bygger på (spelaren själv exkluderad). */
  count: number;
  /** Minutgränsen som faktiskt tillämpades — 0 om vi föll tillbaka pga litet underlag. */
  minMinutesApplied: number;
  /** Färre än MIN_PEER_COUNT peers — visa en varning, inte en tyst siffra. */
  isLowSample: boolean;
  /** Spelaren själv har färre minuter än MIN_PEER_MINUTES den här säsongen. */
  playerBelowMinMinutes: boolean;
}

/**
 * Väljer vilken delmängd av en position-filtrerad peer-pool jämförelsen ska
 * bygga på, enligt regeln ovan, och sammanfattar valet för UI:t.
 */
export function selectPeers<T extends { minutes_played: number }>(
  samePositionPeers: T[],
  positionLabel: string,
  playerMinutes: number
): { peers: T[]; summary: PeerGroupSummary } {
  const aboveFloor = samePositionPeers.filter((p) => p.minutes_played >= MIN_PEER_MINUTES);
  const useFloor = aboveFloor.length >= MIN_PEER_COUNT;
  const peers = useFloor ? aboveFloor : samePositionPeers;
  return {
    peers,
    summary: {
      label: positionLabel,
      count: peers.length,
      minMinutesApplied: useFloor ? MIN_PEER_MINUTES : 0,
      isLowSample: peers.length < MIN_PEER_COUNT,
      playerBelowMinMinutes: playerMinutes < MIN_PEER_MINUTES,
    },
  };
}
