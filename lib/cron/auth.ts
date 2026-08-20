import type { NextRequest } from "next/server";

/**
 * Steg 10 (skalning & drift). Vercel skickar automatiskt en
 * `Authorization: Bearer $CRON_SECRET`-header på varje cron-anrop, om
 * miljövariabeln CRON_SECRET är satt i Vercel-projektet — dokumenterat
 * mönster, verifierat mot Vercels egen dokumentation 2026-08-20
 * (vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs), inte gissat.
 *
 * Blockerar även om CRON_SECRET SAKNAS helt — annars vore en route utan
 * miljövariabel satt helt öppen för vem som helst.
 */
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  return Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;
}
