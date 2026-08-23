"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { LiveFeed } from "@/lib/football/live-feed";

/**
 * Fas 20 (2026-08-23) — klientens live-polling.
 *
 * Tre krav som alla tre bröts av "lägg en setInterval i komponenten":
 *
 *  1. EN pollning per datamängd, inte en per komponent. Matchvyn visar
 *     ställning och tidslinje — två komponenter som båda vill ha samma
 *     färska data. Med varsin timer hade en öppen matchsida gjort dubbelt
 *     så många anrop som den behövde. Här delar allt som frågar efter
 *     samma URL på en enda kanal: en timer, en request, ett svar.
 *  2. Takten ska komma från servern, inte gissas i komponenten. Svaret bär
 *     `nextRefreshSeconds` (lib/football/live-feed.ts) — 20 s medan spelet
 *     rullar, 60 s i paus, 5 min när ingenting pågår. Ingen komponent
 *     hittar på ett eget intervall.
 *  3. En bortglömd flik ska inte polla. Vid `document.hidden` stoppas
 *     timern helt, och när fliken blir synlig igen hämtas direkt en gång
 *     (så användaren aldrig möts av en gammal ställning).
 *
 * Byggd på `useSyncExternalStore` — kanalerna nedan ÄR en extern store, och
 * det är precis vad den API:n finns till för. En tidigare version använde
 * useEffect + setState, vilket ger kaskadrenderingar när en andra komponent
 * ansluter till en kanal som redan har data.
 *
 * Serverrenderad startdata skickas in som `initial`, så första bilden är
 * korrekt utan att vänta på en rundtur — pollingen tar bara vid därefter.
 */

export interface LiveFeedState {
  feed: LiveFeed | null;
  /** Sant när senaste hämtningen misslyckades — UI:t visar då sin senast kända data, inte ett fel. */
  stale: boolean;
}

interface Channel {
  url: string;
  state: LiveFeedState;
  subscribers: Set<() => void>;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
}

const channels = new Map<string, Channel>();

const DEFAULT_INTERVAL_SECONDS = 30;
/** Hur länge vi backar av efter ett misslyckat anrop, så ett nere-läge inte hamrar. */
const ERROR_BACKOFF_SECONDS = 60;

function emit(channel: Channel) {
  for (const notify of channel.subscribers) notify();
}

function schedule(channel: Channel, seconds: number) {
  if (channel.timer) clearTimeout(channel.timer);
  channel.timer = null;
  // Ingen timer alls medan fliken är dold — den startas om av
  // visibilitychange-lyssnaren nedan.
  if (typeof document !== "undefined" && document.hidden) return;
  if (channel.subscribers.size === 0) return;
  channel.timer = setTimeout(() => void refresh(channel), Math.max(5, seconds) * 1000);
}

async function refresh(channel: Channel) {
  if (channel.inFlight) return;
  channel.inFlight = true;
  try {
    const response = await fetch(channel.url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const feed = (await response.json()) as LiveFeed;
    channel.state = { feed, stale: false };
    emit(channel);
    schedule(channel, feed.nextRefreshSeconds || DEFAULT_INTERVAL_SECONDS);
  } catch {
    // Ett misslyckat anrop får ALDRIG tömma vyn. Vi behåller senast kända
    // läge och markerar det som inaktuellt, så komponenten kan visa "kunde
    // inte uppdatera" istället för en tom ruta.
    if (!channel.state.stale) {
      channel.state = { ...channel.state, stale: true };
      emit(channel);
    }
    schedule(channel, ERROR_BACKOFF_SECONDS);
  } finally {
    channel.inFlight = false;
  }
}

function getChannel(url: string, initial: LiveFeed | null): Channel {
  let channel = channels.get(url);
  if (!channel) {
    channel = { url, state: { feed: initial, stale: false }, subscribers: new Set(), timer: null, inFlight: false };
    channels.set(url, channel);
    return channel;
  }
  // En kanal kan överleva en navigering. Är serverns startdata NYARE än vad
  // kanalen har kvar sedan sist, är den bättre — annars skulle en
  // återbesökt sida visa ett gammalt läge tills nästa pollning hunnit gå.
  const existing = channel.state.feed;
  if (initial && (!existing || initial.fetchedAt > existing.fetchedAt)) {
    channel.state = { feed: initial, stale: false };
  }
  return channel;
}

let visibilityBound = false;
function bindVisibility() {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    for (const channel of channels.values()) {
      if (channel.subscribers.size === 0) continue;
      if (document.hidden) {
        if (channel.timer) clearTimeout(channel.timer);
        channel.timer = null;
      } else {
        void refresh(channel);
      }
    }
  });
}

/** Stabil "ingenting händer"-referens för avstängd polling — aldrig ett nytt objekt per render. */
const DISABLED_STATE: LiveFeedState = { feed: null, stale: false };

/**
 * Prenumererar på live-flödet för en URL. `enabled: false` gör hooken helt
 * passiv (används för en match som redan är slutspelad — då finns det inget
 * att följa och ingen anledning att polla).
 */
export function useLiveFeed(url: string, initial: LiveFeed | null, enabled = true): LiveFeedState {
  // `initial` är MEDVETET inte en beroende: den är ett startvärde, och ett
  // nytt objekt vid varje serverrendering skulle annars byta kanal.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const channel = useMemo(() => getChannel(url, initial), [url]);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!enabled) return () => {};
      bindVisibility();
      channel.subscribers.add(onStoreChange);
      // Första hämtningen sker efter att det serverrenderade läget hunnit
      // visas — inte omedelbart, det vore en rundtur för data vi just fick.
      if (channel.subscribers.size === 1 && !channel.timer) {
        schedule(channel, channel.state.feed?.nextRefreshSeconds || DEFAULT_INTERVAL_SECONDS);
      }
      return () => {
        channel.subscribers.delete(onStoreChange);
        if (channel.subscribers.size === 0 && channel.timer) {
          clearTimeout(channel.timer);
          channel.timer = null;
        }
      };
    },
    [channel, enabled]
  );

  const getSnapshot = useCallback(() => (enabled ? channel.state : DISABLED_STATE), [channel, enabled]);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return enabled ? state : { feed: initial, stale: false };
}
