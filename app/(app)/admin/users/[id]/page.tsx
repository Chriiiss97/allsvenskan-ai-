import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BackButton } from "@/components/nav/BackButton";
import { timeAgo } from "@/lib/admin/format";

interface TargetProfile {
  id: string;
  email: string;
  role: string;
  daily_message_count: number;
  quota_date: string;
  created_at: string;
  favorite_team: { name: string } | null;
}

interface ConversationRow {
  id: number;
  title: string | null;
  created_at: string;
}

interface MessageRow {
  id: number;
  conversation_id: number;
  role: "user" | "assistant";
  created_at: string;
}

interface ToolCallRow {
  message_id: number;
  tool_name: string;
}

const TOOL_LABELS: Record<string, string> = {
  get_top_scorers: "Målskyttar",
  get_cards: "Kort",
  get_team_facts: "Klubbfakta",
  get_fixtures: "Matcher/resultat",
  get_league_facts: "Ligafakta",
  log_unanswered_question: "Okänd fråga",
};

// Bara admin ska kunna se en annan användares kontodetaljer — inte för
// övervakning, utan för support/produktadministration (se PROJEKT_BRIEF.md
// "rimliga integritetsregler"). Visar konversationsöversikt (titel, antal
// meddelanden, datum), inte fulla meddelandetranskript.
export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: targetId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: viewerProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (viewerProfile?.role !== "admin") redirect("/");

  const { data: target } = await supabase
    .from("profiles")
    .select("id, email, role, daily_message_count, quota_date, created_at, favorite_team:favorite_team_id(name)")
    .eq("id", targetId)
    .maybeSingle<TargetProfile>();
  if (!target) notFound();

  const { data: conversationsData } = await supabase
    .from("conversation")
    .select("id, title, created_at")
    .eq("user_id", targetId)
    .order("created_at", { ascending: false })
    .returns<ConversationRow[]>();
  const conversations = conversationsData ?? [];
  const conversationIds = conversations.map((c) => c.id);

  const { data: messagesData } =
    conversationIds.length > 0
      ? await supabase
          .from("message")
          .select("id, conversation_id, role, created_at")
          .in("conversation_id", conversationIds)
          .returns<MessageRow[]>()
      : { data: [] as MessageRow[] };
  const messages = messagesData ?? [];
  const messageCountByConversation = new Map<number, number>();
  for (const m of messages) {
    messageCountByConversation.set(m.conversation_id, (messageCountByConversation.get(m.conversation_id) ?? 0) + 1);
  }

  const messageIds = messages.map((m) => m.id);
  const { data: toolCallsData } =
    messageIds.length > 0
      ? await supabase.from("message_tool_call").select("message_id, tool_name").in("message_id", messageIds).returns<ToolCallRow[]>()
      : { data: [] as ToolCallRow[] };
  const toolCounts = new Map<string, number>();
  for (const t of toolCallsData ?? []) {
    toolCounts.set(t.tool_name, (toolCounts.get(t.tool_name) ?? 0) + 1);
  }
  const topTools = [...toolCounts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <BackButton href="/admin" label="Admin" />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-white">{target.email}</h1>
        {target.role === "admin" && (
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-400">
            admin
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
          <p className="text-2xl font-bold text-white">{conversations.length}</p>
          <p className="mt-0.5 text-xs text-[#898781]">Konversationer</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
          <p className="text-2xl font-bold text-white">{messages.length}</p>
          <p className="mt-0.5 text-xs text-[#898781]">Meddelanden</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
          <p className="text-2xl font-bold text-white">{target.favorite_team?.name ?? "—"}</p>
          <p className="mt-0.5 text-xs text-[#898781]">Favoritlag</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
          <p className="text-2xl font-bold text-white">
            {target.role === "admin" ? "∞" : `${target.daily_message_count}/3`}
          </p>
          <p className="mt-0.5 text-xs text-[#898781]">Kvot idag</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-[#898781]">Registrerad {new Date(target.created_at).toLocaleDateString("sv-SE")}</p>

      {topTools.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">Vanligaste frågetyper</p>
          <div className="flex flex-wrap gap-2">
            {topTools.map(([tool, count]) => (
              <span key={tool} className="rounded-full border border-white/10 bg-[#141418] px-3 py-1 text-xs text-[#c3c2b7]">
                {TOOL_LABELS[tool] ?? tool} <span className="font-medium text-white">×{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 mb-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">Konversationer</p>
        {conversations.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-[#141418] p-4 text-sm text-[#898781]">
            Inga konversationer än.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {conversations.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-[#141418] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">{c.title || "(namnlös konversation)"}</p>
                  <p className="mt-0.5 text-[11px] text-[#7d7c76]">{timeAgo(c.created_at)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-[#c3c2b7]">
                  {messageCountByConversation.get(c.id) ?? 0} meddelanden
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
