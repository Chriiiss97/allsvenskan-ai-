/**
 * Ämneskategorisering av användarnas RÅA frågetext — separat från
 * verktygsanvändning (message_tool_call, se app/(app)/admin/page.tsx).
 *
 * Skillnaden spelar roll: ett verktygsanrop (t.ex. get_cards) säger bara
 * vilken funktion Claude råkade välja för EN fråga, inte vad användarna
 * faktiskt frågar om i stort — särskilt inte vid låg volym, där en enda
 * logga rad kan se ut som "vanligaste frågetypen" trots att den bara hände
 * en gång. Den här filen kategoriserar istället själva frågetexten med
 * enkel nyckelordsmatchning. Inte AI-klassificering — bara transparent,
 * deterministisk mönstermatchning, tydligt märkt som sådan i UI:t.
 *
 * En fråga kan matcha flera ämnen (t.ex. "jämför AIK och IFK:s målskyttar"
 * -> både "Jämförelser" och "Mål") — det är korrekt, inte en bugg.
 */
export interface TopicDefinition {
  key: string;
  label: string;
  icon: string;
  patterns: RegExp[];
}

export const TOPICS: TopicDefinition[] = [
  { key: "goals", label: "Mål", icon: "⚽", patterns: [/\bmål(en|et|skytt\w*)?\b/i] },
  { key: "assists", label: "Assist", icon: "🎯", patterns: [/\bassist/i] },
  { key: "cards", label: "Kort", icon: "🟨", patterns: [/\bkort\b/i, /\bgul[at]?\b/i, /\bröd[at]?\b/i] },
  {
    key: "compare_derby",
    label: "Derby / jämförelser",
    icon: "🆚",
    patterns: [/derby/i, /jämför/i, /mot varandra/i, /\bvs\.?\b/i],
  },
  { key: "history", label: "Historia", icon: "📜", patterns: [/histori/i, /grundad/i, /legend/i, /troféer?/i] },
  {
    key: "fixtures",
    label: "Matcher / resultat",
    icon: "🏟️",
    patterns: [/\bmatch(en|er|erna)?\b/i, /resultat/i, /senaste\b.*(match|möte)/i, /spelar (mot|nästa)/i],
  },
  { key: "standings", label: "Tabell", icon: "🏆", patterns: [/tabell/i, /placering/i, /poäng/i] },
  {
    key: "player_stats",
    label: "Spelarstatistik",
    icon: "👤",
    patterns: [/spelare/i, /statistik/i, /betyg/i, /minuter/i],
  },
];

export function classifyTopics(questionText: string): string[] {
  const matches: string[] = [];
  for (const topic of TOPICS) {
    if (topic.patterns.some((p) => p.test(questionText))) {
      matches.push(topic.key);
    }
  }
  return matches;
}
