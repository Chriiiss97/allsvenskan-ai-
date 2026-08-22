import { colors } from "@/lib/design/tokens";
import { translateTransferType } from "@/lib/i18n/sv";

/**
 * Fas 17b (2026-08-22) — flaggar spelare vars registrerade Allsvenska lag
 * (player.current_team_id, bara uppdaterat av den periodiska trupp-
 * importen) inte längre stämmer, eftersom vi via api-football /transfers
 * (se scripts/import/import-player-career.ts) vet att spelaren gjort ett
 * senare klubbyte. Verkligt fall som motiverade det här: en spelare vars
 * profil fortfarande visade ett Allsvenskt lag trots att han redan spelar
 * för en klubb i Spanien. Visas BARA när vi faktiskt har transferdata som
 * motsäger current_team_id — aldrig en gissning.
 */
export function TransferFlagBanner({
  previousTeamName,
  teamName,
  teamLogoUrl,
  transferDate,
  transferType,
}: {
  previousTeamName: string | null;
  teamName: string | null;
  teamLogoUrl: string | null;
  transferDate: string | null;
  transferType?: string | null;
}) {
  if (!teamName) return null;
  const typeLabel = translateTransferType(transferType ?? null);

  return (
    <div
      className="mt-3 flex items-center gap-2.5 rounded-lg border p-3 text-xs"
      style={{ borderColor: `${colors.status.confidence.medium}40`, backgroundColor: `${colors.status.confidence.medium}0d` }}
    >
      <span aria-hidden>⚠️</span>
      <span className="text-[#c3c2b7]">
        {previousTeamName ? `Lämnade ${previousTeamName} — spelar nu för ` : "Spelar nu för "}
        {teamLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- extern lagtröjbild
          <img src={teamLogoUrl} alt="" className="mx-1 inline-block h-4 w-4 align-text-bottom object-contain" />
        )}
        <span className="font-semibold text-white">{teamName}</span>
        {transferDate && <span className="text-[#898781]"> (sedan {new Date(transferDate).toLocaleDateString("sv-SE")})</span>}
        {typeLabel && <span className="text-[#898781]"> · {typeLabel}</span>}
        {" — statistiken nedan avser fortfarande tiden i Allsvenskan."}
      </span>
    </div>
  );
}
