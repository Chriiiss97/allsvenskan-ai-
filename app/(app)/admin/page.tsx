import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUnansweredQuestion, toggleFeatureFlag } from "./actions";
import { timeAgo, estimateCostUsd, formatUsd, startOfUtcDay } from "@/lib/admin/format";
import { TOPICS, classifyTopics } from "@/lib/admin/topics";

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

interface ToolCallRow {
  tool_name: string;
  team: string | null;
}

interface UsageRow {
  input_tokens: number;
  output_tokens: number;
  latency_ms: number | null;
  created_at: string;
}

interface FeatureFlagRow {
  key: string;
  label: string;
  enabled: boolean;
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="mt-0.5 text-xs text-[#898781]">{label}</p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">{children}</p>;
}

function RankBar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#c3c2b7]">{label}</span>
        <span className="font-medium text-white">{count}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-white/5">
        <div className="h-1.5 rounded-full bg-[#3987e5]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
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

  const todayStart = startOfUtcDay().toISOString();
  const sevenDaysAgo = startOfUtcDay(6).toISOString(); // inkl. idag = 7 dagar

  const [
    { count: userCount },
    { count: conversationCount },
    { count: messagesTodayCount },
    { count: fixtureCount },
    { count: fixtureSyncedCount },
    { count: teamCount },
    { count: playerCount },
    { count: seasonCount },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("conversation").select("id", { count: "exact", head: true }),
    supabase.from("message").select("id", { count: "exact", head: true }).gte("created_at", todayStart),
    supabase.from("fixture").select("id", { count: "exact", head: true }),
    supabase.from("fixture").select("id", { count: "exact", head: true }).not("events_synced_at", "is", null),
    supabase.from("team").select("id", { count: "exact", head: true }),
    supabase.from("player").select("id", { count: "exact", head: true }),
    supabase.from("season").select("id", { count: "exact", head: true }),
  ]);

  // Aktiva idag: distinkta användare som skickat minst ett meddelande idag.
  const { data: todaysUserMessages } = await supabase
    .from("message")
    .select("conversation:conversation_id(user_id)")
    .eq("role", "user")
    .gte("created_at", todayStart)
    .returns<{ conversation: { user_id: string } | null }[]>();
  const activeTodayCount = new Set(
    (todaysUserMessages ?? []).map((m) => m.conversation?.user_id).filter(Boolean)
  ).size;

  // Nya användare senaste 7 dagarna, bucketat per dag för en enkel stapelrad.
  const { data: recentProfiles } = await supabase
    .from("profiles")
    .select("created_at")
    .gte("created_at", sevenDaysAgo)
    .returns<{ created_at: string }[]>();
  const dayBuckets = Array.from({ length: 7 }, (_, i) => {
    const dayStart = startOfUtcDay(6 - i);
    const dayEnd = startOfUtcDay(5 - i);
    const count = (recentProfiles ?? []).filter((p) => {
      const t = new Date(p.created_at);
      return t >= dayStart && (i === 6 ? true : t < dayEnd);
    }).length;
    return { label: dayStart.toLocaleDateString("sv-SE", { weekday: "short" }), count };
  });
  const maxDayCount = Math.max(1, ...dayBuckets.map((d) => d.count));

  // Steg 10: senaste kända dygnskvot-avläsning från API-Football (skriven av
  // cron-routes efter varje körning, se lib/cron/rate-limit-snapshot.ts) —
  // riktig data från API:ts egna headrar, aldrig en uppskattning. null tills
  // minst ett cron-jobb faktiskt kört (kräver deploy).
  //
  // OBS: ingestion_log har medvetet INGEN publik RLS-läspolicy (den vanliga
  // `supabase`-klienten ovan skulle alltid ge null här, tyst) — måste läsas
  // med service-role-klienten. Säkert att göra HÄR eftersom sidan redan har
  // verifierat profile.role === 'admin' ovanför.
  const { data: rateLimitRow } = await createAdminClient()
    .from("ingestion_log")
    .select("params, finished_at")
    .eq("endpoint", "rate-limit-snapshot")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<{ params: { remaining?: number; limit?: number } | null; finished_at: string | null }>();
  const apiCallsUsedToday =
    rateLimitRow?.params?.limit !== undefined && rateLimitRow.params.remaining !== undefined
      ? rateLimitRow.params.limit - rateLimitRow.params.remaining
      : null;
  const apiCallsLimitToday = rateLimitRow?.params?.limit ?? null;

  // Vad frågar användarna om — verktygsanrop, inte gissad fritext.
  const { data: toolCallsData } = await supabase
    .from("message_tool_call")
    .select("tool_name, team")
    .returns<ToolCallRow[]>();
  const toolCalls = toolCallsData ?? [];
  const toolCounts = new Map<string, number>();
  const teamCounts = new Map<string, number>();
  for (const call of toolCalls) {
    toolCounts.set(call.tool_name, (toolCounts.get(call.tool_name) ?? 0) + 1);
    if (call.team) teamCounts.set(call.team, (teamCounts.get(call.team) ?? 0) + 1);
  }
  const topTools = [...toolCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topTeams = [...teamCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxToolCount = Math.max(1, ...topTools.map(([, c]) => c));
  const maxTeamCount = Math.max(1, ...topTeams.map(([, c]) => c));

  const TOOL_LABELS: Record<string, string> = {
    get_top_scorers: "Målskyttar",
    get_cards: "Kort",
    get_team_facts: "Klubbfakta",
    get_fixtures: "Matcher/resultat",
    get_league_facts: "Ligafakta",
    log_unanswered_question: "Okänd fråga",
  };

  // Ämnen — kategoriserar den RÅA frågetexten (inte vilket verktyg som
  // råkade anropas), se lib/admin/topics.ts. Det här är den siffra som
  // faktiskt svarar på "vad vill användarna veta", till skillnad från
  // verktygsanvändningen ovan som är en teknisk/utvecklarsiffra.
  const { data: userMessagesData } = await supabase
    .from("message")
    .select("content")
    .eq("role", "user")
    .returns<{ content: string }[]>();
  const userMessages = userMessagesData ?? [];
  const topicCounts = new Map<string, number>();
  for (const msg of userMessages) {
    for (const key of classifyTopics(msg.content)) {
      topicCounts.set(key, (topicCounts.get(key) ?? 0) + 1);
    }
  }
  const topTopics = TOPICS.map((t) => ({ ...t, count: topicCounts.get(t.key) ?? 0 }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxTopicCount = Math.max(1, ...topTopics.map((t) => t.count));

  // AI-status: token- och kostnadsförbrukning, från riktiga loggade anrop.
  const { data: usageData } = await supabase
    .from("message_usage")
    .select("input_tokens, output_tokens, latency_ms, created_at")
    .returns<UsageRow[]>();
  const usage = usageData ?? [];
  const usageToday = usage.filter((u) => u.created_at >= todayStart);
  const sumTokens = (rows: UsageRow[]) => ({
    input: rows.reduce((s, r) => s + r.input_tokens, 0),
    output: rows.reduce((s, r) => s + r.output_tokens, 0),
  });
  const totalUsage = sumTokens(usage);
  const todayUsage = sumTokens(usageToday);
  const latencies = usage.map((u) => u.latency_ms).filter((v): v is number => v !== null);
  const avgLatencyMs =
    latencies.length > 0 ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length) : null;

  // Senaste importerade match — hur färsk är datan vi visar, oavsett dagens
  // datum (vi har ingen live-synk, se PROJEKT_BRIEF.md).
  const { data: latestFixture } = await supabase
    .from("fixture")
    .select("kickoff_at")
    .order("kickoff_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ kickoff_at: string }>();

  // Obesvarade frågor — grupperar på normaliserad text för att kunna visa
  // "efterfrågad X gånger" utan att gissa på semantiskt lika frågor.
  const { data: questionsData } = await supabase
    .from("unanswered_questions")
    .select("id, user_id, question_text, context, resolved, admin_notes, created_at")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<UnansweredQuestion[]>();
  const questions = questionsData ?? [];
  const normalize = (s: string) => s.trim().toLowerCase();
  const questionGroupCounts = new Map<string, number>();
  for (const q of questions) {
    const key = normalize(q.question_text);
    questionGroupCounts.set(key, (questionGroupCounts.get(key) ?? 0) + 1);
  }

  const userIds = [...new Set(questions.map((q) => q.user_id).filter((id): id is string => !!id))];
  const { data: questionUsersData } =
    userIds.length > 0
      ? await supabase.from("profiles").select("id, email").in("id", userIds)
      : { data: [] as { id: string; email: string }[] };
  const emailById = new Map((questionUsersData ?? []).map((p) => [p.id, p.email]));

  const unresolved = questions
    .filter((q) => !q.resolved)
    .sort((a, b) => (questionGroupCounts.get(normalize(b.question_text)) ?? 0) - (questionGroupCounts.get(normalize(a.question_text)) ?? 0));
  const resolved = questions.filter((q) => q.resolved);

  // Feature flags.
  const { data: flagsData } = await supabase
    .from("feature_flag")
    .select("key, label, enabled")
    .order("key")
    .returns<FeatureFlagRow[]>();
  const flags = flagsData ?? [];

  const { data: usersData } = await supabase
    .from("profiles")
    .select("id, email, role, daily_message_count, quota_date, created_at, favorite_team:favorite_team_id(name)")
    .order("created_at", { ascending: false })
    .returns<ProfileRow[]>();
  const users = usersData ?? [];

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

      {/* Fas 13 (Sportmonks-integrationen): rent beslutsunderlag, ingen live-ändring. */}
      <Link
        href="/admin/ovr-proposal"
        className="mt-4 flex items-center justify-between rounded-xl border border-[#d9a526]/30 bg-[#d9a526]/5 p-4 text-sm hover:bg-[#d9a526]/10"
      >
        <span>
          <span className="font-medium text-white">Player Rating — jämförelseförslag</span>
          <span className="ml-2 text-xs text-[#898781]">Sportmonks-mått vs. nuvarande OVR-formel (inte live)</span>
        </span>
        <span className="text-[#d9a526]">→</span>
      </Link>

      {/* Analytics */}
      <div className="mt-6">
        <SectionLabel>Översikt</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Användare" value={userCount ?? 0} />
          <StatTile label="Aktiva idag" value={activeTodayCount} />
          <StatTile label="Meddelanden idag" value={messagesTodayCount ?? 0} />
          <StatTile label="Konversationer" value={conversationCount ?? 0} />
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-[#141418] p-4">
          <p className="text-xs text-[#898781]">Nya användare, senaste 7 dagarna</p>
          <div className="mt-3 flex items-end gap-2">
            {dayBuckets.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-16 w-full items-end">
                  <div
                    className="w-full rounded-t bg-[#3987e5]"
                    style={{ height: `${Math.max(4, (d.count / maxDayCount) * 100)}%` }}
                    title={`${d.count} st`}
                  />
                </div>
                <span className="text-[10px] text-[#898781]">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Vad frågar användarna om — ämne (frågetext), inte verktygsval.
          "Mest efterfrågade lag" är fortfarande verktygsbaserat, men det
          är korrekt där (team-parametern är exakt det verktyget fick in). */}
      <div className="mt-8">
        <SectionLabel>Vad frågar användarna om</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
            <p className="mb-1 text-xs font-medium text-white">Ämnen</p>
            <p className="mb-3 text-[10px] text-[#7d7c76]">
              Nyckelordsmatchning på frågetexten, inte AI-klassificering.
            </p>
            {topTopics.length === 0 ? (
              <p className="text-xs text-[#898781]">Inga kategoriserbara frågor loggade än.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {topTopics.map((t) => (
                  <RankBar key={t.key} label={`${t.icon} ${t.label}`} count={t.count} max={maxTopicCount} />
                ))}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
            <p className="mb-3 text-xs font-medium text-white">Mest efterfrågade lag</p>
            {topTeams.length === 0 ? (
              <p className="text-xs text-[#898781]">Inga lag-specifika frågor loggade än.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {topTeams.map(([team, count]) => (
                  <RankBar key={team} label={team} count={count} max={maxTeamCount} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI-status */}
      <div className="mt-8">
        <SectionLabel>AI-status (Claude)</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Tokens idag" value={(todayUsage.input + todayUsage.output).toLocaleString("sv-SE")} />
          <StatTile label="Kostnad idag" value={formatUsd(estimateCostUsd(todayUsage.input, todayUsage.output))} />
          <StatTile label="Kostnad totalt" value={formatUsd(estimateCostUsd(totalUsage.input, totalUsage.output))} />
          <StatTile label="Snittsvarstid" value={avgLatencyMs ? `${(avgLatencyMs / 1000).toFixed(1)}s` : "—"} />
        </div>
        <p className="mt-2 text-[11px] text-[#7d7c76]">
          Kostnad är uppskattad från riktiga loggade tokens ({usage.length} loggade svar) till listpris
          för claude-haiku-4-5 — inte ett fabricerat exempel.
        </p>
        {toolCalls.length > 0 && (
          <div className="mt-3 rounded-xl border border-white/10 bg-[#141418] p-4">
            <p className="mb-1 text-xs font-medium text-white">Verktygsanvändning</p>
            <p className="mb-3 text-[10px] text-[#7d7c76]">
              Teknisk siffra — vilken funktion Claude anropade, inte vad frågan handlade om (se Ämnen
              ovan).
            </p>
            <div className="flex flex-col gap-2.5">
              {topTools.map(([tool, count]) => (
                <RankBar key={tool} label={TOOL_LABELS[tool] ?? tool} count={count} max={maxToolCount} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Datastatus */}
      <div className="mt-8">
        <SectionLabel>Datastatus</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Lag" value={teamCount ?? 0} />
          <StatTile label="Spelare" value={playerCount ?? 0} />
          <StatTile label="Säsonger" value={seasonCount ?? 0} />
          <StatTile label="Matcher m. händelser" value={`${fixtureSyncedCount ?? 0} / ${fixtureCount ?? 0}`} />
        </div>
        {latestFixture && (
          <p className="mt-2 text-[11px] text-[#7d7c76]">
            Senaste importerade match: {new Date(latestFixture.kickoff_at).toLocaleDateString("sv-SE")}.
            Schemalagd synk (pre-match/live/post-match) är byggd (steg 10) men aktiveras först när
            appen är deployad till Vercel — fram tills dess uppdateras datan via manuell{" "}
            <span className="font-mono">npm run import</span>.
          </p>
        )}
      </div>

      {/* API-budget (steg 10) */}
      <div className="mt-8">
        <SectionLabel>API-Football-budget</SectionLabel>
        <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
          {apiCallsUsedToday !== null && apiCallsLimitToday !== null ? (
            <>
              <div className="flex items-baseline justify-between">
                <p className="text-2xl font-bold text-white">
                  {apiCallsUsedToday.toLocaleString("sv-SE")}{" "}
                  <span className="text-sm font-normal text-[#898781]">/ {apiCallsLimitToday.toLocaleString("sv-SE")} anrop idag</span>
                </p>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-white/5">
                <div
                  className="h-1.5 rounded-full bg-[#3987e5]"
                  style={{ width: `${Math.min(100, (apiCallsUsedToday / apiCallsLimitToday) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-[#7d7c76]">
                Senaste avläsning från API-Football:s egna dygnskvot-header
                {rateLimitRow?.finished_at && `, ${timeAgo(rateLimitRow.finished_at)}`} — ingen egen uppskattning.
              </p>
            </>
          ) : (
            <p className="text-sm text-[#898781]">
              Ingen avläsning än — skrivs av cron-jobben (steg 10) efter första körningen, kräver deploy.
            </p>
          )}
        </div>
      </div>

      {/* Funktioner (feature flags) */}
      <div className="mt-8">
        <SectionLabel>Funktioner</SectionLabel>
        {flags.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-[#141418] p-4 text-sm text-[#898781]">
            Inga feature flags hittades (kräver att migration 0013 är körd).
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {flags.map((flag) => (
              <div
                key={flag.key}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-[#141418] px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${flag.enabled ? "bg-[#4ade80]" : "bg-[#7d7c76]"}`}
                    aria-hidden
                  />
                  <span className="text-sm text-white">{flag.label}</span>
                </div>
                <form action={toggleFeatureFlag}>
                  <input type="hidden" name="key" value={flag.key} />
                  <input type="hidden" name="enabled" value={(!flag.enabled).toString()} />
                  <button
                    type="submit"
                    className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                      flag.enabled
                        ? "border-white/10 text-[#c3c2b7] hover:border-white/20 hover:bg-white/10 hover:text-white"
                        : "border-[#3987e5]/40 bg-[#3987e5]/15 text-white hover:bg-[#3987e5]/25"
                    }`}
                  >
                    {flag.enabled ? "Stäng av" : "Slå på"}
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Obesvarade frågor */}
      <div className="mt-8">
        <SectionLabel>Obesvarade frågor ({unresolved.length} olösta)</SectionLabel>
        {questions.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-[#141418] p-4 text-sm text-[#898781]">
            Inga loggade frågor än — dyker upp här när chatten inte hittar ett svar med tillgängliga
            verktyg.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {[...unresolved, ...resolved].map((q) => {
              const groupCount = questionGroupCounts.get(normalize(q.question_text)) ?? 1;
              return (
                <div
                  key={q.id}
                  className={`rounded-xl border p-4 ${
                    q.resolved ? "border-white/5 bg-white/[0.015] opacity-60" : "border-white/10 bg-[#141418]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-white">{q.question_text}</p>
                        {groupCount > 1 && (
                          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                            frågad {groupCount}×
                          </span>
                        )}
                      </div>
                      {q.context && <p className="mt-1 text-xs text-[#898781]">{q.context}</p>}
                      <p className="mt-1.5 text-[11px] text-[#7d7c76]">
                        {q.user_id ? emailById.get(q.user_id) ?? "okänd användare" : "okänd användare"} ·{" "}
                        {timeAgo(q.created_at)}
                      </p>
                      {q.resolved && q.admin_notes && (
                        <p className="mt-1.5 text-xs text-[#c3c2b7]">📝 {q.admin_notes}</p>
                      )}
                    </div>
                    {q.resolved ? (
                      <span className="shrink-0 rounded-full bg-[#0ca30c]/10 px-2.5 py-1 text-[11px] font-medium text-[#4ade80]">
                        Löst
                      </span>
                    ) : (
                      <form action={resolveUnansweredQuestion} className="flex shrink-0 items-center gap-1.5">
                        <input type="hidden" name="id" value={q.id} />
                        <input
                          type="text"
                          name="admin_notes"
                          placeholder="Anteckning (valfritt)"
                          className="w-32 rounded-full border border-white/10 bg-transparent px-2.5 py-1 text-[11px] text-white outline-none placeholder:text-[#7d7c76] sm:w-40"
                        />
                        <button
                          type="submit"
                          className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-medium text-[#c3c2b7] transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
                        >
                          Markera som löst
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Användare */}
      <div className="mt-8 mb-8">
        <SectionLabel>Användare ({users.length})</SectionLabel>
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
                <tr key={u.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/users/${u.id}`} className="text-white underline-offset-2 hover:underline">
                      {u.email}
                    </Link>
                  </td>
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
