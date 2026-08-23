import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/session";
import { Sidebar } from "@/components/nav/Sidebar";

/**
 * Delad layout för de inloggade "Fotboll"-huvudsidorna (/, /chat, /matcher,
 * /lag, /spelare, /tabell, /settings — se (content)-undergruppen för
 * bredd-wrappern på de sistnämnda). Permanent mörkt tema (inte kopplat till
 * systemets ljus/mörkt) — hela appen ska kännas som ett sammanhängande,
 * "nördigt" analysverktyg.
 *
 * /login, /onboarding, /auth/callback ligger utanför den här route-gruppen.
 * (scout)-route-gruppen (Fas 14.1) har sin EGEN layout/shell — Scout ska
 * kännas som en egen produkt, inte ännu en flik i den här Sidebar:n.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getCurrentProfile();
  const isAdmin = profile?.role === "admin";

  return (
    <div className="flex min-h-screen flex-col bg-[#0d0d0d] text-white sm:flex-row">
      <Sidebar isAdmin={isAdmin} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
