"use client";

import { useRouter } from "next/navigation";
import { TeamPicker } from "./TeamPicker";

interface TeamOption {
  externalId: number;
  name: string;
  logoUrl: string | null;
}

/** Två lagväljare som styr sidans ?a=&b=-querystring vid val — samma mönster som PlayerCompareControls. */
export function TeamCompareControls({
  teams,
  externalIdA,
  externalIdB,
}: {
  teams: TeamOption[];
  externalIdA: number | null;
  externalIdB: number | null;
}) {
  const router = useRouter();

  function updateParam(key: "a" | "b", externalId: number) {
    const params = new URLSearchParams();
    params.set("a", key === "a" ? String(externalId) : externalIdA ? String(externalIdA) : "");
    params.set("b", key === "b" ? String(externalId) : externalIdB ? String(externalIdB) : "");
    router.push(`/lag/compare?${params.toString()}`);
  }

  return (
    <div className="mx-auto grid max-w-lg gap-4 sm:grid-cols-2">
      <TeamPicker teams={teams} label="Lag A" selectedExternalId={externalIdA} onSelect={(id) => updateParam("a", id)} />
      <TeamPicker teams={teams} label="Lag B" selectedExternalId={externalIdB} onSelect={(id) => updateParam("b", id)} />
    </div>
  );
}
