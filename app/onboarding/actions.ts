"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Sätter (eller nollställer) inloggad användares favoritlag via RPC:n
 * set_favorite_team (se migration 0006) — den enda skrivvägen till profiles
 * för klienten, medvetet begränsad till just det fältet.
 */
export async function setFavoriteTeam(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const raw = formData.get("teamId");
  const teamId = typeof raw === "string" && raw !== "" ? Number(raw) : null;

  const { error } = await supabase.rpc("set_favorite_team", { p_team_id: teamId });
  if (error) throw error;

  redirect("/");
}
