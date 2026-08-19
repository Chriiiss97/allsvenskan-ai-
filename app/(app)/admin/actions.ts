"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Markerar en obesvarad fråga som löst (t.ex. efter att man lagt till ett
 * nytt verktyg eller mer data för att kunna svara på den).
 *
 * RLS-policyn "Admins can update unanswered questions" (migration 0003)
 * skulle ändå blockera en icke-admin, men vi dubbelkollar rollen explicit
 * här också — samma mönster som /api/chat använder för adminundantaget.
 */
export async function resolveUnansweredQuestion(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return;

  await supabase.from("unanswered_questions").update({ resolved: true }).eq("id", id);
  revalidatePath("/admin");
}
