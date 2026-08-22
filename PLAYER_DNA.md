# Player DNA

Den enda färdigbyggda "PRODUCT"-analysmotorn i projektet (se
[ANALYSIS_ENGINE.md](ANALYSIS_ENGINE.md) för hur den passar in i helheten).
Implementation: `lib/football/player-dna.ts` (beräkning) +
`components/data/PlayerDNA.tsx` (UI). Status: 🟢 byggd och i produktion för
spelare i IFK Göteborg/AIK (utespelare, tillräcklig speltid).

## Vad den svarar på

Inte "hur bra är spelaren" (ett enda tal) utan "vilken TYP av spelare är
detta, statistiskt sett, jämfört med andra på samma position" — en
spårbar profil, inte ett påhittat betyg. Produktens signaturprincip
("visa min beräkning") betyder att varje siffra går att spåra till en
konkret peer-grupp och konkreta underliggande tal.

## De sex kategorierna

| Kategori | Nyckel | Underliggande mått (per 90 om inget annat anges) |
|---|---|---|
| Avslutningsfarlighet | `avslutning` | Mål, Skott, Skott på mål |
| Kreativitet | `kreativitet` | Assist, Nyckelpassningar |
| Bollinvolvering | `bollinvolvering` | Passningar (volym — se nedan) |
| Dribbling & progression | `dribbling` | Dribbelförsök, Lyckade dribblingar, Fällda fouls |
| Duellspel | `duellspel` | Vunna dueller, Vinstprocent (%) |
| Defensivt arbete | `forsvar` | Tacklingar, Interceptions, Fouls begångna |

Varje kategoris `score` är medlet av dess underliggande måtts percentiler
(0–100, "andel peers med lägre-eller-lika värde" — robust mot skeva små
samples, medvetet INTE en z-score/normalfördelningsantagande).

### Bollinvolvering, inte "Passningsspel"

Namnet är medvetet valt: `passes_accuracy` saknas för 83–90 % av spelarna
(se [DATA_CATALOG.md](DATA_CATALOG.md#säsongsaggregerad-spelarstatistik)),
så kategorin mäter bara passningsVOLYM. Att kalla den "Passningsspel" hade
antytt att den mäter kvalitet, vilket den inte gör — samma "beskriv
verkligheten, inte visionen"-princip som resten av dokumentationen.

## Primär/sekundär-viktning per position

```ts
attacker:    ["avslutning", "kreativitet", "dribbling"]
midfielder:  ["duellspel", "bollinvolvering", "kreativitet"]
defender:    ["duellspel", "forsvar"]
goalkeeper:  []  // se "Målvakter" nedan
```

Primära kategorier väger tyngre visuellt; en HÖG SEKUNDÄR kategori räknas
som ett "aha"-fynd (oväntat för positionen), en hög primär kategori är bara
förväntat och triggar inget "aha".

## Konfidensmodell

Tvådimensionell — det SVAGASTE av de två avgör:

| Dimension | Tröskel hög | Tröskel medel | Källa |
|---|---|---|---|
| Egen speltid (`ownTier`) | ≥900 min | ≥450 min | Spelarens minuter DEN säsongen |
| Peer-antal (`peerTier`) | ≥12 peers | ≥6 peers | `peers.length` efter positions-/minutfilter |

`confidence.tier = worseTier(ownTier, peerTier)`. På `tier === "låg"`
genereras VARKEN sammanfattningsparagrafen, insiktslistan ELLER spelartypen
— för mycket brus för att skriva ut som om det vore säkert. Kategorierna
(percentiler/score) visas fortfarande, bara utan text-slutsatser ovanpå.

## Peer-poolen — poolad över säsonger

Till skillnad från den vanliga spelarprofilens säsongsvisa benchmarking
(se [ANALYSIS_ENGINE.md](ANALYSIS_ENGINE.md#gemensam-infrastruktur-peer-jämförelse-libfootballposition-groupts))
poolas Player DNA:s peer-grupp över ALLA importerade säsonger i samma liga
— eftersom IFK/AIK-bara-poolen annars ger för få jämförelsepunkter per
position (13–28 spelare per säsong). `confidence.pooledSeasons` visar exakt
vilka säsonger som faktiskt bidrog.

## Målvakter — explicit "ej tillgänglig", inte en fejkad profil

```ts
if (positionGroupInfo.group === "goalkeeper") {
  return unavailable("Vi har inte tillräcklig målvaktsspecifik data ...");
}
```
Ingen målvaktsspecifik data importeras i `statistics`-flödet (räddningar,
insläppta mål, clean sheets — även om `fixture_player_stats` faktiskt HAR
`saves`/`goals_conceded`, se [DATA_CATALOG.md](DATA_CATALOG.md), den datan
används bara inte av Player DNA idag). Att bygga en DNA-profil av
utespelarmått för en målvakt hade varit att låtsas att datan finns — istället
returneras `available: false` med en läsbar `unavailableReason`.

## Spelartyp — regelbaserade, positionsspecifika trösklar

`inferPlayerType()` matchar mot en ordnad lista regler per positionsgrupp
(t.ex. attacker: "Målfarlig avslutare" om avslutning≥70 OCH kreativitet<60;
"Progressiv dribblare" om dribbling≥75). Detta är statistiska
STILTENDENSER, inte taktiska roller — projektet har ingen
formation/heatmap-data att basera en riktig taktisk rollklassificering på.
Varje etikett har en spårbar `reason`-sträng (vilka score som triggade den).

## Insiktsmotorn — vad den faktiskt genererar

1. **Sammanfattningsparagraf** (`buildSummary`) — 2–4 sammanhängande
   meningar (inte en punktlista): spelartyp + starkaste kategori, ev. mest
   oväntade sekundära kategori, ev. svagaste kategori. Ren templating på
   samma underliggande data som resten av motorn — `identifyKeyCategories()`
   är den DELADE källan för både paragrafen och insiktslistan, så de två
   aldrig kan komma fram till olika svar på samma fråga.
2. **Insiktslista** (`buildInsights`, max 3 poster) — bara det paragrafen
   INTE redan säger: volym-vs-utdelning-mönster (t.ex. "många skott, få mål"
   inom Avslutning; samma mönster testas för Kreativitet:
   Nyckelpassningar-vs-Assist), och det enskilda måttet med störst avvikelse
   från 50:e percentilen (tröskel: minst 35 percentilenheter, annars ingen
   insikt).

Allt uttryckligen regelbaserat — ingen fri text, ingen AI-genererad
tolkning. Se [ANALYSIS_ENGINE.md](ANALYSIS_ENGINE.md#regelbaserat-aldrig-mlai-genererat).

## Kända, medvetna begränsningar (öppna, inte "buggar att fixa i förbifarten")

- All-noll-kategori (t.ex. en fältspelares 0 mål i en säsong med få minuter)
  ger percentil 100 ("tie for best") — matematiskt korrekt men kan läsas
  konstigt. Känd kvirk, inte åtgärdad.
- Radar-visualiseringen (`PlayerRadarChart`/`PlayerDNA.tsx`) skiljer inte
  visuellt mellan primära och sekundära axlar (punktat pga
  recharts-tick-styling-komplexitet).
- Ingen utveckling-över-tid-vy trots poolad data — poolningen används bara
  för STORLEK på jämförelsegruppen, inte för att visa en trendlinje.

## Planerat, inte byggt (P1/P2 i den godkända produktplanen)

🔴 AI-tolkningslager (fri, sammanhangsberikad text ovanpå de redan
regelbaserade slutsatserna) · Similar Players · sub-positionsklustring ·
`dribbles.past`-import till DNA-motorn (finns i `fixture_player_stats`,
oanvänd där) · en verklig visuell/typografisk redesign (spelartyp-rubriken
är just nu mindre än spelarnamnet ovanför — inverterad hierarki, känt,
oåtgärdat) · synlig affordance på "visa min beräkning"-disclosures.
