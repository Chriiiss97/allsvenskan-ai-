# Insight Engine — 50 analysdimensioner

**Status:** Backlog, INTE påbörjad. Sparas här 2026-08-20 så den inte glöms bort.

**När:** Efter att hela 10-stegsplanen ("Allsvenskan Datalager") är klar och
datalagret står stabilt — inte innan. Se planen (publicerad Artifact,
`Allsvenskan Datalager`, länk i chatthistoriken) för status på stegen.

**Vad det här är:** ett NYTT lager ovanpå analysmotorn i 10-stegsplanens
steg 8–9 (Player/Team/Match DNA), inte en ersättning för den. Player DNA
svarar "vem är den här spelaren". Insight Engine ska svara på RIKTADE frågor
om VAD som hände, VARFÖR, och vad det BETYDER — och kombinationer av dem.

**Regel, samma som resten av projektet:** varje dimension nedan ska kunna
bli en egen, verklig analysmotor byggd på data vi faktiskt har — inte bara
en AI-text som låter smart. När det här arbetet väl påbörjas ska varje
punkt märkas:

- 🟢 Byggbart med vår data nu
- 🟡 Byggbart men kräver mer data (eller en tydligare definition)
- 🔴 Inte möjligt med nuvarande API (och då sägs det rakt ut, inget hittas på)

...och sedan prioriteras efter två axlar: **"wow-faktor för fans"** och
**"betalningsvärde för klubbar/premium"**.

---

## Grundfrågorna

1. **VAD** — Vad hände i matchen, laget eller spelarens prestation? Identifiera de viktigaste händelserna och förändringarna.
2. **VARFÖR** — Varför uppstod resultatet? Koppla ihop händelser, prestationer och statistik för att hitta orsaker.
3. **HUR** — Hur uppstod resultatet? Identifiera spelmönster, situationer och sekvenser som ledde fram till det.
4. **NÄR** — När uppstår något? Identifiera minuter, perioder och matchfaser där ett beteende är vanligast.
5. **VAR** — Var på planen händer saker? Använd tillgänglig positionsdata där sådan finns och var tydlig med begränsningar (se steg 1:s fynd: ingen spatial/koordinatdata finns i events — den här punkten är sannolikt 🔴 eller starkt begränsad redan innan vi ens börjar).

## Förändring & utveckling

6. **FÖRE** — Vad kännetecknade laget/spelaren innan en viss händelse?
7. **EFTER** — Vad förändrades efter en händelse – mål, kort, byte, skada eller annan matchhändelse?
8. **SKILLNAD** — Vad skiljer två lag, spelare, matcher eller perioder åt?
9. **FÖRÄNDRING** — Hur har prestationen förändrats över tid?
10. **TREND** — Vilka beteenden blir bättre eller sämre över flera matcher?
11. **TRENDBROTT** — När börjar ett tidigare stabilt mönster plötsligt förändras?
12. **UTVECKLING** — Hur har en spelare eller ett lag utvecklats under säsongen?
13. **FORM** — Hur ser den aktuella prestationen ut jämfört med spelarens/lagets normala nivå?
14. **TOPP** — När presterar laget eller spelaren som bäst?
15. **BOTTEN** — När presterar laget eller spelaren som sämst?

## Orsak & konsekvens

16. **KONSEKVENS** — Vad brukar hända efter en viss händelse?
17. **PÅVERKAN** — Hur mycket påverkar en spelare, händelse eller förändring resultatet?
18. **EFFEKT** — Vilken mätbar effekt får exempelvis ett byte, mål eller taktisk förändring?
19. **REAKTION** — Hur reagerar laget efter exempelvis ett insläppt mål, ett mål framåt eller ett rött kort?
20. **ÅTERHÄMTNING** — Hur bra återhämtar sig laget efter negativa händelser?
21. **RESILIENS** — Hur ofta lyckas laget komma tillbaka efter motgång?
22. **KOLLAPS** — Vilka situationer leder till att prestationen faller kraftigt?
23. **VÄNDNING** — Vilka händelser eller förändringar sammanfaller med att matchbilden vänder?
24. **TRIGGER** — Vilka händelser verkar starta en tydlig förändring i matchen?
25. **KEDJA** — Vilka händelser tenderar att följa efter varandra? (Exempel: bollvinst → passning → chans → skott → mål.)

## Matchens struktur

26. **FAS** — Hur ser matchen ut i olika faser – början, mitten, slutet och andra viktiga perioder?
27. **MOMENTUM** — Vilket lag har övertaget just nu och hur förändras det?
28. **KONTROLL** — Vilket lag kontrollerar matchen och på vilket sätt?
29. **TEMPO** — Hur snabbt eller långsamt förändras matchens spelbild?
30. **INTENSITET** — När är matchen som mest intensiv?
31. **BALANS** — Hur jämn eller ojämn är matchen?
32. **DOMINANS** — När och hur dominerar ett lag motståndaren?
33. **KAOS** — Vilka matcher eller perioder präglas av många snabba förändringar och händelser?
34. **MÖNSTER** — Vilka återkommande beteenden finns i datan?
35. **AVVIKELSE** — Vad är ovanligt jämfört med lagets eller spelarens normala beteende?

## Situationer

36. **KONTEXT** — Hur förändras en statistik beroende på situationen? (Exempel: spelaren när laget leder vs när laget ligger under.)
37. **GAME STATE** — Hur spelar laget vid 0–0, ledning, underläge eller oavgjort?
38. **OMSTÄLLNING** — Hur fungerar laget efter bollvinst eller bollförlust?
39. **FAST SITUATION** — Hur fungerar laget vid hörnor, frisparkar och straffar?
40. **DISCIPLIN** — Hur påverkar kort, regelbrott och disciplin matchbilden?
41. **BYTEN** — Vad händer när spelare kommer in eller lämnar planen?
42. **MOTSTÅND** — Hur förändras prestationen beroende på motståndare och motståndartyp?
43. **HEMMA/BORTA** — Finns det tydliga skillnader mellan hemma- och bortamatcher?

## Relationer & spelare

44. **BEROENDE** — Hur beroende är laget av en viss spelare eller spelartyp?
45. **KEMI** — Vilka spelare fungerar ovanligt bra tillsammans?
46. **KOMPATIBILITET** — Vilka spelare eller profiler passar bäst ihop?
47. **ERSÄTTBARHET** — Vem kan fylla samma funktion om en spelare försvinner?
48. **ROLL** — Vilken faktisk funktion har spelaren i laget baserat på prestationen?
49. **ROLLFÖRÄNDRING** — Har spelarens funktion förändrats under säsongen?
50. **VÄRDE** — Vilka spelare eller prestationer ger mer värde än de vanliga siffrorna antyder?

---

## Andra nivån: kombinationer

De 50 dimensionerna ovan kombineras parvis (eller fler) för de riktigt
vassa frågorna. Det är HÄR Insight Engine blir kraftfull, inte i någon
enskild dimension för sig:

- **VARFÖR + NÄR** — Varför tappar AIK ofta kontrollen efter minut 70?
- **HUR + EFTER** — Hur förändras Hammarby efter att de gör första målet?
- **FÖRE + EFTER + BYTEN** — Vad förändrades efter tränarens byte i minut 62?
- **GAME STATE + MOTSTÅND** — Hur presterar Malmö när de ligger under mot topplag?
- **KEMI + VÄRDE** — Vilket spelpar skapar mest offensivt värde tillsammans?
- **TREND + AVVIKELSE** — Vilken spelare har förbättrats mest jämfört med sin normala nivå?
- **TRIGGER + KONSEKVENS** — Vilka händelser brukar leda till mål inom de kommande 10 minuterna?
- **ROLL + ERSÄTTBARHET** — Vilken spelare i Allsvenskan kan bäst ersätta den här spelarens funktion?

## Den verkliga visionen — UX, inte en meny

**Inte** 50 menyval där användaren väljer en analystyp ("Vill du analysera
TREND?") — det blir för tekniskt och exponerar mekaniken istället för
värdet. Användaren ska aldrig behöva veta vilken analysmotor som ligger
bakom en insikt.

Istället visas bara resultatet, som en lista av upptäckter:

```
🧠 INSIGHTS — Matchen berättar:

🔥 Vändpunkt
Matchbilden förändrades efter minut 61.

⚠️ Mönster
Hammarby tappar ofta offensiv kontroll efter att ha tagit ledningen.

📈 Trend
AIK:s chansskapande har ökat 34 % under de senaste fem matcherna.

🧬 Beroende
31 % av lagets skapade chanser kommer från en och samma spelare.

🕵️ Avvikelse
GAIS hade betydligt högre xG än normalt trots lägre bollinnehav.

🎯 Matchens nyckel
Skillnaden var inte bollinnehavet – utan kvaliteten på chanserna.
```

Systemet kör internt: **WHAT → WHY → HOW → WHEN → CONSEQUENCE → PATTERN →
CONTEXT → INSIGHT**, och presenterar bara det som faktiskt är intressant
(samma "hellre 8 riktigt bra analyser än 30 påhittade"-princip som redan
gäller för Player DNA — se `lib/football/player-dna.ts`).

## Process när det här arbetet påbörjas

1. Gå igenom alla 50 punkter en efter en mot den DÅ faktiska databasen
   (samma "verifiera, gissa inte"-princip som resten av projektet) — märk
   varje punkt 🟢 / 🟡 / 🔴.
2. Prioritera de 🟢-märkta efter "wow-faktor för fans" respektive
   "betalningsvärde för klubbar/premium".
3. Bygg regelbaserat (deterministisk analys på rådata), samma mönster som
   Player DNA:s insiktsmotor — AI-lagret (om det används) formulerar bara
   om en redan färdig, verifierad slutsats till text, hittar aldrig på en
   egen.
4. Design: en lista av upptäckter, inte en meny av analystyper (se
   "Den verkliga visionen" ovan).
