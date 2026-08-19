import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/nav/Sidebar";

/**
 * Delad layout för de inloggade huvudsidorna (/, /chat, /data/**, /settings).
 * Permanent mörkt tema (inte kopplat till systemets ljus/mörkt) — hela appen
 * ska kännas som ett sammanhängande, "nördigt" analysverktyg, inte bara
 * Data-sektionen (som tidigare hade sin egen, separata layout).
 *
 * /login, /onboarding, /auth/callback och /stats ligger utanför den här
 * route-gruppen och påverkas inte.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = profile?.role === "admin";

  return (
    <div className="flex min-h-screen flex-col bg-[#0d0d0d] text-white sm:flex-row">
      <Sidebar isAdmin={isAdmin} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
