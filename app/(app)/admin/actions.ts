"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return null;

  return supabase;
}

/**
 * Markerar en obesvarad fråga som löst, med en valfri admin-anteckning
 * (redan ett fält i schemat, admin_notes, se migration 0003 — bara aldrig
 * använt förrän nu).
 *
 * RLS-policyn "Admins can update unanswered questions" skulle ändå
 * blockera en icke-admin, men vi dubbelkollar rollen explicit här också —
 * samma mönster som /api/chat använder för adminundantaget.
 */
export async function resolveUnansweredQuestion(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;

  const supabase = await requireAdmin();
  if (!supabase) return;

  const notes = String(formData.get("admin_notes") ?? "").trim();
  await supabase
    .from("unanswered_questions")
    .update({ resolved: true, admin_notes: notes || null })
    .eq("id", id);
  revalidatePath("/admin");
}

/**
 * Slår på/av en feature flag (migration 0013). `enabled` är målvärdet,
 * beräknat server-side i sidan (utifrån nuvarande state) och skickat som
 * ett dolt formulärfält.
 */
export async function toggleFeatureFlag(formData: FormData) {
  const key = String(formData.get("key") ?? "");
  const enabled = formData.get("enabled") === "true";
  if (!key) return;

  const supabase = await requireAdmin();
  if (!supabase) return;

  await supabase.from("feature_flag").update({ enabled }).eq("key", key);
  revalidatePath("/admin");
}

/**
 * Fas 14.5 (redesign) — sätter/nollställer profiles.scout_access för EN
 * användare. Enda skrivvägen tills riktig betalning finns (beslutat med
 * användaren) — en admin ger manuellt åtkomst, ingen självbetjäning.
 * profiles har medvetet inga UPDATE-policys (se migration 0001) — skriver
 * därför via set_scout_access-RPC:n (SECURITY DEFINER + egen is_admin()-
 * koll), samma smala mönster som set_favorite_team, INTE en bred
 * "admin kan uppdatera profiles"-policy.
 */
export async function toggleScoutAccess(formData: FormData) {
  const targetId = String(formData.get("userId") ?? "");
  const enabled = formData.get("enabled") === "true";
  if (!targetId) return;

  const supabase = await requireAdmin();
  if (!supabase) return;

  const { error } = await supabase.rpc("set_scout_access", { p_user_id: targetId, p_enabled: enabled });
  if (error) throw error;
  revalidatePath(`/admin/users/${targetId}`);
}
