import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { runLiveTick, type LiveTickResult } from "@/scripts/import/live-pipeline";
import { logRateLimitSnapshot } from "@/lib/cron/rate-limit-snapshot";

export const dynamic = "force-dynamic";
/**
 * Vercel Hobby (se DEPLOYMENT.md — uttryckligt beslut att vänta med Pro)
 * tillåter 60 sekunders körtid per funktion. Budgeten nedan håller sig med
 * marginal under taket och avbryter SJÄLV innan plattformen hinner klippa
 * anropet mitt i en skrivning.
 */
export const maxDuration = 60;

/** Hur länge en enskild körning får loopa innan den lämnar tillbaka svaret. */
const RUN_BUDGET_MS = 45_000;
/** Marginal så vi aldrig somnar in i en paus vi inte hinner vakna ur. */
const SAFETY_MARGIN_MS = 8_000;

/**
 * Pollningstakt per läge. Grunden för hela Fas 20: en match som pågår ska
 * läsas av på sekundnivå, en match som inte har startat ska inte läsas av
 * alls. Kvoten är INTE begränsningen — mätt 2026-08-23 använde hela
 * projektet 177 av 75 000 tillåtna anrop per dygn (0,2 %), och 30-sekunders
 * polling under ett tretimmars matchfönster med fyra samtidiga matcher
 * landar på ~2,3 %. Det som saknades var takten, inte utrymmet.
 */
const INTERVAL_SECONDS = {
  /** Spelet rullar. */
  inPlay: 30,
  /** Avspark mycket nära — fånga övergången NS → 1H direkt. */
  imminentKickoff: 60,
  /** Match inom ett par timmar: håll ett öga, men lugnt. */
  approachingKickoff: 300,
} as const;

/** Minuter till avspark då vi växlar upp till `imminentKickoff`-takten. */
const IMMINENT_KICKOFF_MINUTES = 10;

/**
 * Nästa pollningsintervall i sekunder — eller 0 för "sluta polla, det finns
 * inget att följa". Returneras i svaret så att den anropande loopen
 * (.github/workflows/live-poll.yml) kan pacea sig efter verkligheten utan
 * att logiken dubbleras i bash.
 */
function nextPollSeconds(result: LiveTickResult): number {
  if (result.inPlay > 0) return INTERVAL_SECONDS.inPlay;
  if (result.minutesToNextKickoff === null) return 0;
  if (result.minutesToNextKickoff <= IMMINENT_KICKOFF_MINUTES) return INTERVAL_SECONDS.imminentKickoff;
  return INTERVAL_SECONDS.approachingKickoff;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Steg 10 / Fas 20 — cron-triggerbar live-pipeline.
 *
 * Var tidigare exakt EN tick per anrop, helt utlämnad åt schemaläggaren.
 * Mätningen inför matchdagen 2026-08-23 visade att den premissen inte höll:
 * GitHub Actions `2-59/5 * * * *` ska ge 288 körningar/dygn men levererade
 * 52 (mediangap 22,6 min, max 91,5 min) — GitHubs egen dokumentation varnar
 * för att schemalagda körningar droppas vid belastning, och det är precis
 * vad som hände. Resultatet: Örgryte–Halmstad fick fyra avläsningar under
 * hela matchen, och produkten låg i snitt 20 minuter efter verkligheten.
 *
 * Routen loopar därför SJÄLV inom sin tillåtna körtid istället för att lita
 * på att väckarklockan kommer tillbaka i tid. Ett enda anrop täcker då ett
 * helt fönster med 30-sekunderstakt. Svaret talar dessutom om när den vill
 * bli anropad härnäst (`nextPollSeconds`), så en långkörande loop kan följa
 * matchens faktiska rytm och lägga sig helt vilande när ingenting pågår.
 *
 * Bakåtkompatibelt: `?loops=1` ger exakt det gamla beteendet (en tick, svara
 * direkt), vilket är vad den gamla 5-minuterscronen fortsätter göra.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const maxLoops = Math.max(1, Math.min(20, Number(request.nextUrl.searchParams.get("loops") ?? 20)));

  try {
    const supabase = createAdminClient();
    let ticks = 0;
    let apiCalls = 0;
    let last: LiveTickResult | null = null;

    while (ticks < maxLoops) {
      last = await runLiveTick(supabase);
      ticks++;
      apiCalls += last.apiCalls;

      const waitMs = nextPollSeconds(last) * 1000;
      // 0 = inget att följa. Annars: sov bara om vi hinner både sova OCH
      // köra ännu en tick innan budgeten är slut — annars lämna tillbaka
      // svaret och låt anroparen bestämma om den vill komma tillbaka.
      if (waitMs === 0 || ticks >= maxLoops) break;
      const elapsed = Date.now() - startedAt;
      if (elapsed + waitMs + SAFETY_MARGIN_MS >= RUN_BUDGET_MS) break;
      await sleep(waitMs);
    }

    await logRateLimitSnapshot(supabase, "cron-live");

    return NextResponse.json({
      ok: true,
      ticks,
      apiCalls,
      inPlay: last?.inPlay ?? 0,
      justFinished: last?.justFinished ?? 0,
      minutesToNextKickoff: last?.minutesToNextKickoff ?? null,
      nextPollSeconds: last ? nextPollSeconds(last) : 0,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("[cron/live] misslyckades:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
