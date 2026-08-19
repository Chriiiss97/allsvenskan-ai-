import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveUnansweredQuestion } from "./actions";

interface UnansweredQuestion {
  id: number;
  user_id: string | null;
  question_text: string;
  context: string | null;
  resolved: boolean;
  admin_notes: string | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  email: string;
  role: string;
  daily_message_count: number;
  quota_date: string;
  created_at: string;
  favorite_team: { name: string } | null;
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="mt-0.5 text-xs text-[#898781]">{label}</p>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just nu";
  if (minutes < 60) return `${minutes} min sedan`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} tim sedan`;
  const days = Math.floor(hours / 24);
  return `${days} dygn sedan`;
}

// Auth-koll sker delvis redan i app/(app)/layout.tsx (redirect till /login
// om ej inloggad) — den här sidan lägger till admin-kravet ovanpå det.
export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const [
    { count: userCount },
    { count: conversationCount },
    { count: messageCount },
    { count: unresolvedCount },
    { count: fixtureCount },
    { count: fixtureSyncedCount },
    { count: teamCount },
    { count: playerCount },
    { count: seasonCount },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("conversation").select("id", { count: "exact", head: true }),
    supabase.from("message").select("id", { count: "exact", head: true }),
    supabase.from("unanswered_questions").select("id", { count: "exact", head: true }).eq("resolved", false),
    supabase.from("fixture").select("id", { count: "exact", head: true }),
    supabase.from("fixture").select("id", { count: "exact", head: true }).not("events_synced_at", "is", null),
    supabase.from("team").select("id", { count: "exact", head: true }),
    supabase.from("player").select("id", { count: "exact", head: true }),
    supabase.from("season").select("id", { count: "exact", head: true }),
  ]);

  const { data: questionsData } = await supabase
    .from("unanswered_questions")
    .select("id, user_id, question_text, context, resolved, admin_notes, created_at")
    .order("created_at", { ascending: false })
    .limit(30)
    .returns<UnansweredQuestion[]>();
  const questions = questionsData ?? [];

  // unanswered_questions.user_id refererar auth.users, inte public.profiles
  // direkt — ingen FK att embedda på, så vi slår upp e-post separat och
  // mappar i minnet istället.
  const userIds = [...new Set(questions.map((q) => q.user_id).filter((id): id is string => !!id))];
  const { data: questionUsersData } =
    userIds.length > 0
      ? await supabase.from("profiles").select("id, email").in("id", userIds)
      : { data: [] as { id: string; email: string }[] };
  const emailById = new Map((questionUsersData ?? []).map((p) => [p.id, p.email]));

  const { data: usersData } = await supabase
    .from("profiles")
    .select("id, email, role, daily_message_count, quota_date, created_at, favorite_team:favorite_team_id(name)")
    .order("created_at", { ascending: false })
    .returns<ProfileRow[]>();
  const users = usersData ?? [];

  const unresolved = questions.filter((q) => !q.resolved);
  const resolved = questions.filter((q) => q.resolved);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-400/15 text-amber-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
            <circle cx="12" cy="12" r="2.6" />
          </svg>
        </span>
        <div>
          <h1 className="text-xl font-bold">Admin</h1>
          <p className="text-xs text-[#898781]">Bakom kulisserna — bara synligt för adminkonton.</p>
        </div>
      </div>

      {/* Snabbstatistik */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Användare" value={userCount ?? 0} />
        <StatTile label="Konversationer" value={conversationCount ?? 0} />
        <StatTile label="Meddelanden" value={messageCount ?? 0} />
        <StatTile label="Obesvarade frågor" value={unresolvedCount ?? 0} />
      </div>

      {/* Datatäckning */}
      <div className="mt-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">Datatäckning</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Lag" value={teamCount ?? 0} />
          <StatTile label="Spelare" value={playerCount ?? 0} />
          <StatTile label="Säsonger" value={seasonCount ?? 0} />
          <StatTile
            label="Matcher m. händelser"
            value={`${fixtureSyncedCount ?? 0} / ${fixtureCount ?? 0}`}
          />
        </div>
      </div>

      {/* Obesvarade frågor */}
      <div className="mt-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">
          Obesvarade frågor ({unresolved.length} olösta)
        </p>
        {questions.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-[#141418] p-4 text-sm text-[#898781]">
            Inga loggade frågor än — dyker upp här när chatten inte hittar ett svar med tillgängliga
            verktyg.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {[...unresolved, ...resolved].map((q) => (
              <div
                key={q.id}
                className={`rounded-xl border p-4 ${
                  q.resolved ? "border-white/5 bg-white/[0.015] opacity-60" : "border-white/10 bg-[#141418]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{q.question_text}</p>
                    {q.context && <p className="mt-1 text-xs text-[#898781]">{q.context}</p>}
                    <p className="mt-1.5 text-[11px] text-[#7d7c76]">
                      {q.user_id ? emailById.get(q.user_id) ?? "okänd användare" : "okänd användare"} ·{" "}
                      {timeAgo(q.created_at)}
                    </p>
                  </div>
                  {q.resolved ? (
                    <span className="shrink-0 rounded-full bg-[#0ca30c]/10 px-2.5 py-1 text-[11px] font-medium text-[#4ade80]">
                      Löst
                    </span>
                  ) : (
                    <form action={resolveUnansweredQuestion}>
                      <input type="hidden" name="id" value={q.id} />
                      <button
                        type="submit"
                        className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-[11px] font-medium text-[#c3c2b7] transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
                      >
                        Markera som löst
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Användare */}
      <div className="mt-8 mb-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">
          Användare ({users.length})
        </p>
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141418]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-[#898781]">
                <th className="px-4 py-2.5 font-medium">E-post</th>
                <th className="px-4 py-2.5 font-medium">Roll</th>
                <th className="px-4 py-2.5 font-medium">Favoritlag</th>
                <th className="px-4 py-2.5 font-medium">Kvot idag</th>
                <th className="px-4 py-2.5 font-medium">Registrerad</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-2.5 text-white">{u.email}</td>
                  <td className="px-4 py-2.5">
                    {u.role === "admin" ? (
                      <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-400">
                        admin
                      </span>
                    ) : (
                      <span className="text-[#898781]">user</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[#c3c2b7]">{u.favorite_team?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[#c3c2b7]">
                    {u.role === "admin" ? "Obegränsat" : `${u.daily_message_count}/3`}
                  </td>
                  <td className="px-4 py-2.5 text-[#898781]">
                    {new Date(u.created_at).toLocaleDateString("sv-SE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
