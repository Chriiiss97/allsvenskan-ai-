"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { strings } from "@/lib/i18n/sv";

export function LoginButton() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    // Webbläsaren navigerar iväg till Google, så loading-state behöver
    // inte återställas här.
  };

  return (
    <button
      onClick={handleLogin}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {strings.auth.loginWithGoogle}
    </button>
  );
}
