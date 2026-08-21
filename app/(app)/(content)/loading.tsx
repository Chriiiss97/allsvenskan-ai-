/**
 * Delad laddningsvy för hela "Fotboll"-sektionen (matcher/lag/spelare).
 * Next.js visar den här
 * automatiskt (Suspense-gräns) medan en ny sidas server-komponent hämtar
 * sin data vid navigering — utan den kan en långsammare sida (t.ex. den
 * nya lagprofilen, som gör fem parallella frågor) i vissa lägen kännas
 * som att den gamla sidan "hänger kvar" innan den nya hunnit bli klar,
 * särskilt vid snabba/flera klick efter varandra.
 */
export default function DataSectionLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-40 rounded-lg bg-white/5" />
      <div className="mt-3 h-10 w-64 rounded-lg bg-white/5" />
      <div className="mt-2 h-4 w-80 rounded bg-white/5" />
      <div className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-white/5" />
        ))}
      </div>
    </div>
  );
}
