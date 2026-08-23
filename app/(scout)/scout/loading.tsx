/**
 * PRESTANDA (2026-08-23) — Scout-sektionen saknade helt en laddningsvy;
 * app/(app)/(content)/loading.tsx täcker bara "Fotboll"-sidorna, och
 * (scout) är en egen route-grupp med egen shell.
 *
 * Utan den här filen finns ingen Suspense-gräns mellan Scout-shellen och
 * sidan under: klickar man "Efter Allsvenskan" står den GAMLA sidan kvar
 * orörd tills nästa sida är helt färdig, utan minsta kvittens på att något
 * händer. Det är den enskilt största anledningen till att appen KÄNDES
 * frusen snarare än långsam — även en sida som svarar på ett par hundra
 * millisekunder ser död ut om ingenting rör sig under tiden.
 *
 * Skelettet härmar Scout-sidornas faktiska form (etikett → rubrik →
 * ingress → filterrad → lista) så att omslaget till riktigt innehåll inte
 * hoppar.
 */
export default function ScoutSectionLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-3 w-28 rounded bg-[#a78bfa]/20" />
      <div className="mt-2 h-9 w-64 rounded-lg bg-white/5" />
      <div className="mt-2 h-4 w-full max-w-xl rounded bg-white/5" />

      <div className="mt-6 flex flex-wrap gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-white/5" />
        ))}
      </div>

      <div className="mt-4 space-y-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[68px] rounded-xl bg-white/5" />
        ))}
      </div>
    </div>
  );
}
