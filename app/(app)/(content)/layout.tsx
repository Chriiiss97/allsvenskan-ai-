import type { ReactNode } from "react";

/**
 * Ren innehålls-bredd/padding för "Fotboll"-sidorna (matcher/lag/spelare +
 * deras undersidor). Auth-koll och mörkt tema sköts av den överordnade
 * app/(app)/layout.tsx — den här layouten (ett route-grupp-mellanlager,
 * (content), utan egen URL-del — Fas 14.1) gör bara det den gamla
 * app/(app)/data/layout.tsx gjorde utöver det.
 */
export default function DataSectionLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>;
}
