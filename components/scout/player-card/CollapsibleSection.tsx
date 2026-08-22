import type { ReactNode } from "react";

/**
 * Fas 15 (Complete Scout Player Card) — delad sektionsram med inbyggd
 * ackordeon-funktionalitet via nativ `<details>` (ingen ny UI-lib, ingen
 * client-JS behövs) — samma mönster som PlayerDNA.tsx:s "visa min
 * beräkning"-detaljer redan använder. Fungerar identiskt på mobil och
 * desktop (kravet var "kollapsas/expanderas smart på mobil" — <details>
 * löser det utan en separat mobil-gren).
 */
export function CollapsibleSection({
  title,
  icon,
  subtitle,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon?: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-white/10 bg-[#1a1a19] p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:content-none">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
            {icon && <span aria-hidden>{icon}</span>}
            {title}
          </span>
          {subtitle && <span className="mt-0.5 block text-xs text-[#898781]">{subtitle}</span>}
        </span>
        <span className="shrink-0 text-[#5f5e59] transition-transform group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
