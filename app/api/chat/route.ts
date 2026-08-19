import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { FOOTBALL_TOOLS } from "@/lib/football/tool-definitions";
import { dispatchTool } from "@/lib/football/tool-dispatch";
import { CHAT_SYSTEM_PROMPT, strings } from "@/lib/i18n/sv";

/**
 * POST /api/chat — steg 6.
 *
 * Body: { conversationId?: number, message: string }
 * Svar: { conversationId: number, reply: string }
 *
 * Flöde (se PROJEKT_BRIEF.md "Generellt flöde"):
 *   1. Kolla/räkna dagskvoten atomärt via increment_message_quota-RPC:n
 *   2. Hämta/skapa konversation, spara användarens meddelande
 *   3. Skicka historik + systemprompt + verktyg till Claude
 *   4. Loopa tool-calling tills Claude ger ett slutgiltigt textsvar
 *   5. Spara svaret, returnera det
 */

const DAILY_MESSAGE_LIMIT = 3;
const MAX_TOOL_ITERATIONS = 5; // säkerhetsspärr mot en oändlig verktygsloop
const CHAT_MODEL = "claude-haiku-4-5"; // billig, snabb, mer än kapabel för tool-calling + korta faktasvar

const anthropic = new Anthropic(); // läser ANTHROPIC_API_KEY från miljövariablerna

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: strings.auth.loginRequired }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.role === "admin";

  let body: { conversationId?: number; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig request" }, { status: 400 });
  }

  const userMessage = body.message?.trim();
  if (!userMessage) {
    return NextResponse.json({ error: "Meddelande saknas" }, { status: 400 });
  }

  // 1. Kvot — atomär räknare i databasen, admin undantagen (migration 0009).
  const { data: quota, error: quotaError } = await supabase.rpc("increment_message_quota", {
    p_daily_limit: DAILY_MESSAGE_LIMIT,
  });
  if (quotaError) {
    console.error("Kvotfel:", quotaError);
    return NextResponse.json({ error: strings.errors.generic }, { status: 500 });
  }
  if (!quota?.[0]?.allowed) {
    return NextResponse.json({ error: strings.errors.quotaExceeded }, { status: 429 });
  }
  const messagesUsedToday = quota[0].message_count;

  // 2. Konversation: återanvänd om den finns och är användarens egen, annars ny.
  let conversationId: number | null =
    body.conversationId && Number.isFinite(Number(body.conversationId))
      ? Number(body.conversationId)
      : null;

  if (conversationId) {
    const { data: existing } = await supabase
      .from("conversation")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!existing) conversationId = null;
  }

  if (!conversationId) {
    const { data: created, error: createError } = await supabase
      .from("conversation")
      .insert({ user_id: user.id, title: userMessage.slice(0, 80) })
      .select("id")
      .single();
    if (createError || !created) {
      console.error("Kunde inte skapa konversation:", createError);
      return NextResponse.json({ error: strings.errors.generic }, { status: 500 });
    }
    conversationId = created.id;
  }

  // 3. Historik (för kontext inom konversationen) + spara det nya meddelandet.
  const { data: history } = await supabase
    .from("message")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(20);

  await supabase
    .from("message")
    .insert({ conversation_id: conversationId, role: "user", content: userMessage });

  const messages: Anthropic.MessageParam[] = [
    ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  // 4. Tool-calling-loopen.
  let finalText = "";
  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await anthropic.messages.create({
        model: CHAT_MODEL,
        max_tokens: 1024,
        // Lägre temperatur = mer förutsägbart verktygsval. Vi vill ha
        // konsekvent beteende (alltid försöka ett verktyg innan den ger upp)
        // snarare än kreativ variation i en databunden assistent.
        temperature: 0.3,
        system: CHAT_SYSTEM_PROMPT,
        tools: FOOTBALL_TOOLS,
        messages,
      });

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      if (toolUses.length === 0 || response.stop_reason !== "tool_use") {
        finalText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        break;
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        const { content, isError } = await dispatchTool(toolUse, { supabase, userId: user.id });
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content,
          is_error: isError,
        });
      }
      messages.push({ role: "user", content: toolResults });
    }
  } catch (err) {
    console.error("Chat-fel:", err);
    return NextResponse.json({ error: strings.errors.generic }, { status: 500 });
  }

  if (!finalText) {
    finalText = strings.errors.generic;
  }

  await supabase
    .from("message")
    .insert({ conversation_id: conversationId, role: "assistant", content: finalText });

  return NextResponse.json({
    conversationId,
    reply: finalText,
    messagesUsedToday,
    dailyMessageLimit: DAILY_MESSAGE_LIMIT,
    unlimited: isAdmin,
  });
}
