"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { strings } from "@/lib/i18n/sv";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    setLoading(false);
  };

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-4 py-2 text-sm font-medium text-[#c3c2b7] transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
        <path d="M9 5H6a2 2 0 00-2 2v10a2 2 0 002 2h3M15 8l4 4-4 4M19 12H9" />
      </svg>
      {strings.auth.logout}
    </button>
  );
}
