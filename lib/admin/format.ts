/**
 * Delade formatteringshjälpare för adminpanelen (app/(app)/admin/**).
 */

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just nu";
  if (minutes < 60) return `${minutes} min sedan`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} tim sedan`;
  const days = Math.floor(hours / 24);
  return `${days} dygn sedan`;
}

// Prissättning för modellen chatten använder (claude-haiku-4-5, se
// CHAT_MODEL i app/api/chat/route.ts), $ per 1M tokens. Om modellen byts
// eller priset ändras är det här enda stället att uppdatera.
const INPUT_PRICE_PER_MILLION_USD = 1.0;
const OUTPUT_PRICE_PER_MILLION_USD = 5.0;

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * INPUT_PRICE_PER_MILLION_USD +
    (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_MILLION_USD
  );
}

export function formatUsd(amountUsd: number): string {
  if (amountUsd === 0) return "$0.00";
  if (amountUsd < 0.01) return "<$0.01";
  return `$${amountUsd.toFixed(2)}`;
}

export function startOfUtcDay(daysAgo = 0): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date;
}
