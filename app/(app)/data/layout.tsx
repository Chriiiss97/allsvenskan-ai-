import type { ReactNode } from "react";

/**
 * Ren innehålls-bredd/padding för Data-sidorna. Auth-koll och mörkt tema
 * sköts nu av den överordnade app/(app)/layout.tsx — den här layouten gör
 * bara det den gamla app/data/layout.tsx gjorde utöver det.
 */
export default function DataSectionLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>;
}
