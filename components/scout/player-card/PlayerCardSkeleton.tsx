/**
 * Fas 15-prestandafix, del 3 (2026-08-22) — Suspense-fallback för
 * PlayerCardHeavySections. Ren visuell platshållare (pulserande block i
 * samma form/mängd som de riktiga sektionerna) — ingen data, ingen logik.
 */
function SkeletonBox({ className = "h-24" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl border border-white/10 bg-[#1a1a19] ${className}`} />;
}

export function PlayerCardSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <SkeletonBox className="h-40" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SkeletonBox />
        <SkeletonBox />
        <SkeletonBox />
        <SkeletonBox />
      </div>
      <SkeletonBox className="h-32" />
      <SkeletonBox className="h-24" />
    </div>
  );
}
