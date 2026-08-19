import Link from "next/link";

/**
 * Synlig "tillbaka"-knapp för sidor man klickar sig in på (spelarprofil,
 * matchrapport, jämförelse) — ersätter tidigare tunna, lättmissade
 * textlänkar ("← Alla spelare") med en riktig knapp i samma pill-stil som
 * övriga knappar i appen (se t.ex. LogoutButton).
 */
export function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-3.5 py-1.5 text-xs font-medium text-[#c3c2b7] transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
        aria-hidden
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
      {label}
    </Link>
  );
}
