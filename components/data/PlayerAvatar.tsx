"use client";

import { useState } from "react";

// Kategorisk slot 1 (blå) / slot 2 (orange) från dataviz-skillens palett —
// samma konvention som PlayerCompareRadar/RecordBar, inte hårdkodade
// klubbfärger, så komponenten håller om fler lag läggs till senare.
const ACCENTS = ["#3987e5", "#d95926"] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Spelaravatar: visar riktigt foto (API-Football har en photo_url för alla
 * importerade spelare) om det finns och faktiskt går att ladda, annars en
 * initial-baserad avatar med lagfärgad bakgrund. `onError` fångar trasiga
 * bild-URL:er och byter tyst till fallbacken istället för att visa en
 * trasig bild-ikon.
 */
export function PlayerAvatar({
  name,
  teamIndex = 0,
  size = 40,
  photoUrl,
}: {
  name: string;
  teamIndex?: 0 | 1;
  size?: number;
  photoUrl?: string | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  if (photoUrl && !imageFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- extern spelarbild, ingen lokal optimering krävs
      <img
        src={photoUrl}
        alt=""
        onError={() => setImageFailed(true)}
        className="shrink-0 rounded-full bg-white/5 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: ACCENTS[teamIndex],
        fontSize: size * 0.36,
      }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
