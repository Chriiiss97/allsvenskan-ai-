/**
 * Fas 14.5 (plans/humble-giggling-biscuit.md) — EN regel för "har den här
 * användaren Scout-åtkomst", återanvänd överallt gating behövs (Scout-
 * shellen nu, Match Preview i Fas 14.6). Admins ser ALLTID Scout — de
 * bygger/supportar produkten, oavsett om profiles.scout_access är satt.
 */
export function hasScoutAccess(profile: { role: string; scout_access: boolean } | null | undefined): boolean {
  if (!profile) return false;
  return profile.role === "admin" || profile.scout_access === true;
}
