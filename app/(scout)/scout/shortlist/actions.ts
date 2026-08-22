"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Fas 14.4 (plans/humble-giggling-biscuit.md) — Scout Shortlist. Samma
 * mönster som app/onboarding/actions.ts: server action, formulär utan
 * klient-JS, createClient() (INTE admin-klienten — RLS på auth.uid() gör
 * jobbet, se migration 20260822120000_scout_shortlist.sql).
 */

export async function addToShortlist(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const playerId = Number(formData.get("playerId"));
  const returnTo = String(formData.get("returnTo") ?? "/scout/shortlist");
  if (!playerId) return;

  // onConflict: stjärnmärk en redan stjärnmärkt spelare = no-op, inte ett fel.
  const { error } = await supabase
    .from("scout_shortlist_player")
    .upsert({ user_id: user.id, player_id: playerId }, { onConflict: "user_id,player_id" });
  if (error) throw error;

  revalidatePath("/scout/shortlist");
  revalidatePath(returnTo);
}

export async function removeFromShortlist(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const playerId = Number(formData.get("playerId"));
  const returnTo = String(formData.get("returnTo") ?? "/scout/shortlist");
  if (!playerId) return;

  const { error } = await supabase.from("scout_shortlist_player").delete().eq("user_id", user.id).eq("player_id", playerId);
  if (error) throw error;

  revalidatePath("/scout/shortlist");
  revalidatePath(returnTo);
}
