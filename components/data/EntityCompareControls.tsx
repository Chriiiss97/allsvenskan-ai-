"use client";

import { useRouter } from "next/navigation";
import { EntityPicker, type EntityOption } from "./EntityPicker";

/**
 * Fas 14.2 (plans/humble-giggling-biscuit.md) — EN delad "två väljare styr
 * ?a=&b=" -controller istället för PlayerCompareControls.tsx/
 * TeamCompareControls.tsx, som var strukturellt identiska (TeamCompareControls
 * egen kommentar sa uttryckligen "samma mönster som PlayerCompareControls").
 * Bygger på EntityPicker (se den filens Fas 14.4-fix — samma normaliserade
 * EntityOption[]-dataformat här, av samma anledning: options kommer från en
 * Server Component och får aldrig vara accessor-funktioner).
 */
export function EntityCompareControls({
  options,
  idA,
  idB,
  basePath,
  labelA,
  labelB,
  className = "grid gap-4 sm:grid-cols-2",
}: {
  options: EntityOption[];
  idA: number | null;
  idB: number | null;
  /** Sidan vars ?a=&b= uppdateras vid val, t.ex. "/scout/compare?mode=spelare". */
  basePath: string;
  labelA: string;
  labelB: string;
  className?: string;
}) {
  const router = useRouter();

  function updateParam(key: "a" | "b", id: number) {
    const params = new URLSearchParams(basePath.includes("?") ? basePath.split("?")[1] : "");
    params.set("a", key === "a" ? String(id) : idA ? String(idA) : "");
    params.set("b", key === "b" ? String(id) : idB ? String(idB) : "");
    const path = basePath.split("?")[0];
    router.push(`${path}?${params.toString()}`);
  }

  return (
    <div className={className}>
      <EntityPicker options={options} label={labelA} selectedId={idA} onSelect={(id) => updateParam("a", id)} />
      <EntityPicker options={options} label={labelB} selectedId={idB} onSelect={(id) => updateParam("b", id)} />
    </div>
  );
}
