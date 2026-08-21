"use client";

import { useRouter } from "next/navigation";
import { EntityPicker } from "./EntityPicker";

/**
 * Fas 14.2 (plans/humble-giggling-biscuit.md) — EN delad "två väljare styr
 * ?a=&b=" -controller istället för PlayerCompareControls.tsx/
 * TeamCompareControls.tsx, som var strukturellt identiska (TeamCompareControls
 * egen kommentar sa uttryckligen "samma mönster som PlayerCompareControls").
 * Bygger på den nya generiska EntityPicker istället för PlayerPicker/TeamPicker.
 *
 * NY fil, INTE ännu inkopplad — de två gamla ersätts EN i taget när
 * /spelare/compare respektive /lag/compare ändå byggs om (Scout Compare,
 * Fas 14.4), inte i en bakåtkompatibel omgång nu.
 */
export function EntityCompareControls<T>({
  options,
  idA,
  idB,
  basePath,
  labelA,
  labelB,
  getId,
  getLabel,
  getSubLabel,
  getLogoUrl,
  className = "grid gap-4 sm:grid-cols-2",
}: {
  options: T[];
  idA: number | null;
  idB: number | null;
  /** Sidan vars ?a=&b= uppdateras vid val, t.ex. "/spelare/compare". */
  basePath: string;
  labelA: string;
  labelB: string;
  getId: (option: T) => number;
  getLabel: (option: T) => string;
  getSubLabel?: (option: T) => string | null | undefined;
  getLogoUrl?: (option: T) => string | null | undefined;
  className?: string;
}) {
  const router = useRouter();

  function updateParam(key: "a" | "b", id: number) {
    const params = new URLSearchParams();
    params.set("a", key === "a" ? String(id) : idA ? String(idA) : "");
    params.set("b", key === "b" ? String(id) : idB ? String(idB) : "");
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <div className={className}>
      <EntityPicker
        options={options}
        label={labelA}
        selectedId={idA}
        onSelect={(id) => updateParam("a", id)}
        getId={getId}
        getLabel={getLabel}
        getSubLabel={getSubLabel}
        getLogoUrl={getLogoUrl}
      />
      <EntityPicker
        options={options}
        label={labelB}
        selectedId={idB}
        onSelect={(id) => updateParam("b", id)}
        getId={getId}
        getLabel={getLabel}
        getSubLabel={getSubLabel}
        getLogoUrl={getLogoUrl}
      />
    </div>
  );
}
