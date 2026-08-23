/**
 * Fas 14.2 (plans/humble-giggling-biscuit.md) — designsystemets grund.
 *
 * NY fil, INTE ännu använd av någon sida (medvetet — planen är uttrycklig:
 * "aldrig en stor find-replace i befintlig kod som inte ändå byggs om samma
 * fas"). Konsoliderar den de facto-palett som audit-agenterna hittade i
 * Fas 14-planeringen (327+ råa hex-literaler i app/, ingen delad fil sen
 * tidigare — bara lib/data/team-colors.ts, som bara mappar lag→accentfärg)
 * till EN dokumenterad källa. Sidor migreras till den här filen STEGVIS när
 * de ändå byggs om (Fas 14.3+), inte i en bakåtkompatibel omgång nu.
 *
 * ⚠️ VIKTIGT — Tailwind-fallgropen: Tailwind känner bara igen STATISKA
 * class-strängar i källkoden (t.ex. `bg-[#1a1a19]`) via sin egen
 * textskanning vid byggtiden. En importerad/interpolerad variabel
 * (`bg-[${colors.surface.raised}]`) ser likadan ut i JSX men Tailwind ser
 * ALDRIG den färdiga strängen — klassen genereras tystnat INTE, och
 * elementet blir helt ostylat utan något fel i konsolen. Använd alltså
 * dessa tokens på ETT av två sätt:
 *   1) Kopiera hex-värdet in i en STATISK Tailwind-klass i JSX
 *      (`className="bg-[#1a1a19]"`), tokenvärdet här är då bara
 *      referensen/sanningen att kopiera från, ELLER
 *   2) Använd värdet direkt i `style={{ ... }}` för RUNTIME-beräknade
 *      färger (lagfärger, diagramserier, dynamiska accenter) — det är den
 *      enda situationen där en importerad variabel är säker att använda.
 * Bygg ALDRIG en Tailwind-klass dynamiskt av en tokenvariabel.
 */

export const colors = {
  /** Bakgrundsytor, ljusast först. Tre nivåer räcker — de fyra udda
   * varianterna (#15171c/#181b22/#131519/#0b0c0f) som auditen hittade i
   * enstaka sidor var omotiverad drift, inte en avsedd fjärde nivå, och
   * stryks här. */
  surface: {
    base: "#0d0d0d", // app-bakgrund (App-skalet, body)
    raised: "#1a1a19", // kort, paneler, rader
    sunken: "#141418", // pill-nav, alternativa/inbäddade ytor
  },

  /** Textskala, ljusast/starkast först — redan konsekvent använd genom hela
   * appen, bara formaliserad här. */
  text: {
    primary: "#ffffff",
    secondary: "#c3c2b7",
    muted: "#898781",
    dim: "#7d7c76",
    faint: "#5f5e59",
  },

  /** Kantlinjer — `border-white/10` / `border-white/25` är redan Tailwinds
   * egna opacitetsklasser (fungerar fint statiskt), rgba-formen här är bara
   * för de sällsynta style={{ borderColor: ... }}-fallen. */
  border: {
    subtle: "rgba(255,255,255,0.1)",
    hover: "rgba(255,255,255,0.25)",
    grid: "#2c2c2a", // diagramrutnät/axlar (Recharts stroke)
  },

  /** Produktzonernas identitetsfärger — VARJE zon har sin egen, aldrig
   * blandade. Blå = Fotboll (den ursprungliga, oförändrade rating-/DNA-
   * ytan), violett = Scout (Sportmonks-lagret, redan etablerad konvention
   * från AdvancedDNA/AdvancedDevelopment), amber = Admin. */
  accent: {
    football: "#3987e5",
    scout: "#a78bfa",
    admin: "#d9a526",
    // Fas 14.6 — Match Preview är EN egen premium-yta, medvetet skild från
    // Scout (planen: "Match Facts ska vara premium men ska inte ligga
    // under Scout... eget visuellt märke, inte 'Scout'"). En fjärde,
    // distinkt accentfärg (teal) så den aldrig läses som en Scout-yta.
    // OBS: det här är en varumärkes-/zonfärg (en logga/rubrik i taget, ALDRIG
    // visad som angränsande diagram-serier mot de andra tre accenterna) —
    // dataviz-validatorns kategoriska ΔE-koll gäller inte samma sätt här som
    // för en riktig flerserie-diagrampalett. Kontrast mot ytan och kroma-
    // golvet PASSAR (körd: validate_palette.js "#3987e5,#a78bfa,#d9a526,
    // #2dd4bf" --mode dark) — bara ΔE-avstånd-till-grannen (som antar att
    // alla fyra visas sida vid sida i EN legend) faller, vilket de aldrig gör.
    matchPreview: "#2dd4bf",
  },

  /** Två-entitets-jämförelser (spelare A/B, lag A/B) — samma par som redan
   * används i PlayerCompareRadar/CompareStatRows/RecordBar:s "teams"-läge.
   * Validerad: node scripts/validate_palette.js "#3987e5,#d95926"
   * --mode dark (dataviz-skillet) → ALLA kontroller PASS (CVD ΔE 26.8
   * protan / 32.4 tritan, långt över 8-golvet). */
  compare: {
    a: "#3987e5",
    b: "#d95926",
  },

  /**
   * Statusfärger — TVÅ separata familjer, inte en enda sammanslagen
   * "success/danger", eftersom de faktiskt betyder olika saker i UI:t
   * (bekräftat via användning, inte antaget):
   *   - confidence: statistisk tillförlitlighet (litet stickprov-varningar
   *     på ratings/DNA — PlayerRating, PlayerDNA, AdvancedDNA m.fl.)
   *   - result: matchutfall (vinst/oavgjort/förlust — RecordBar, FormBadges,
   *     matchlistan)
   * Auditen hittade två snarlika men olika gröna/röda par för dessa
   * (#22c55e vs #0ca30c, #e66767 vs #d03b3b) — de var INTE av misstag
   * dubblerade, de kodar två olika saker som råkar dela samma gröna/röda
   * polaritet. Att slå ihop dem till en enda färg hade gjort tokens mindre
   * sanningsenliga mot hur koden faktiskt använder dem, så båda behålls som
   * separata, namngivna par (ingen ny färg uppfunnen, bara de två redan
   * existerande paren dokumenterade var för sig).
   *
   * ⚠️ VALIDERAT (dataviz-skillet): confidence-tripletten
   * (#22c55e/#d9a526/#e66767) FAILAR CVD-separationen som en kategorisk
   * palett (protan ΔE 5.6, under 8-golvet) — se
   * node scripts/validate_palette.js "#22c55e,#d9a526,#e66767" --mode dark.
   * Redan existerande värden byts INTE ut här (planen: välj bland
   * befintliga, hitta inte på nya) — men regeln är därför HÅRD:
   * confidence-färgerna får ALDRIG bära betydelse ensamma, alltid
   * tillsammans med text/ikon (redan hur koden gör det idag, t.ex.
   * "⚠ Litet jämförelseunderlag" bredvid den gula färgen i
   * PlayerRadarChart) — aldrig en ren färgprick utan etikett.
   */
  status: {
    confidence: {
      high: "#22c55e",
      medium: "#d9a526",
      low: "#e66767",
    },
    result: {
      win: "#0ca30c",
      draw: "#7d7c76",
      loss: "#d03b3b",
    },
  },
} as const;

export type Colors = typeof colors;
