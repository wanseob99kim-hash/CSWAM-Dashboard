// SAP BOMs collected from WINSYS (Basic > Master Data(SAP) > BOM), exploded
// to purchased parts per tower and priced from WINSYS PO lines.
//
// A project's BOMs carry its WINSYS project ID in the material code
// ("1029460056-1590AM1" is project 1590). Each section of a tower has a root
// assembly ("…AM1": internal parts plus the BS body), the body holds the cans
// ("…S1".."…S7"), and each can holds its steel plate. Roots are the project's
// BOM materials that are no other BOM's component; each root is one section of
// one tower, so a part's quantity per tower is its exploded quantity summed
// over the roots. Codes without a BOM of their own are purchased parts.
import type { WinsysPoLine } from "./parse";

export type WinsysBomHeader = { itemCd: string; itemNm: string; bomCd: string; qty: number; unit: string };
export type WinsysBomComponent = { child: string; qty: number; unit: string };

/** The file the WINSYS BOM collection writes to WINSYS/BOM/. */
export type WinsysBomFile = {
  collectedAt: string;
  headers: WinsysBomHeader[];
  /** Components per BOM material code. */
  details: Record<string, WinsysBomComponent[]>;
};

export type SapBomItem = {
  material: string;
  description: string;
  itemGroup: string;
  vendor: string;
  qtyPerTower: number;
  unit: string;
  /** USD per unit from the latest WINSYS PO line for this material (this project's first), null when never ordered. */
  unitPriceUsd: number | null;
  po: string | null;
  incoterms: string;
};

export type SapProjectBom = {
  projectId: string;
  projectName: string;
  /** Section root descriptions ("Vestas Four Horizons 210T M3,AM"). */
  sections: string[];
  items: SapBomItem[];
};

/** Assemblies nested deeper than this are treated as a data loop and cut off. */
const MAX_DEPTH = 8;

export function bomProjectId(material: string): string | null {
  return /-(\d{3,5})(?=[A-Z]|$)/.exec(material)?.[1] ?? null;
}

/** Purchased-part quantities under one assembly, multiplied down the levels. */
function explode(code: string, qty: number, details: WinsysBomFile["details"], into: Map<string, number>, depth: number, units: Map<string, string>) {
  const components = details[code];
  if (!components || depth > MAX_DEPTH) {
    into.set(code, (into.get(code) ?? 0) + qty);
    return;
  }
  for (const component of components) {
    units.set(component.child, component.unit);
    explode(component.child, qty * component.qty, details, into, depth + 1, units);
  }
}

function pricedLine(lines: WinsysPoLine[], projectId: string): WinsysPoLine | null {
  const live = lines.filter((line) => line.workStatus.toLowerCase() !== "cancel" && line.poQty > 0);
  const latest = (pool: WinsysPoLine[]) => [...pool].sort((left, right) => right.po.localeCompare(left.po) || right.line - left.line)[0] ?? null;
  return latest(live.filter((line) => line.projectId === projectId)) ?? latest(live);
}

export function explodeProjectBoms(bom: WinsysBomFile, poLines: WinsysPoLine[]): SapProjectBom[] {
  const byMaterial = new Map<string, WinsysPoLine[]>();
  for (const line of poLines) {
    if (!line.material) continue;
    byMaterial.set(line.material, [...(byMaterial.get(line.material) ?? []), line]);
  }
  const projectNames = new Map<string, string>();
  for (const line of poLines) if (line.projectId && !projectNames.has(line.projectId)) projectNames.set(line.projectId, line.projectName);

  const components = new Set(Object.values(bom.details).flatMap((list) => list.map((component) => component.child)));
  const rootsByProject = new Map<string, WinsysBomHeader[]>();
  for (const header of bom.headers) {
    const projectId = bomProjectId(header.itemCd);
    if (!projectId || components.has(header.itemCd) || !bom.details[header.itemCd]) continue;
    rootsByProject.set(projectId, [...(rootsByProject.get(projectId) ?? []), header]);
  }

  return [...rootsByProject.entries()]
    .map(([projectId, roots]) => {
      const quantities = new Map<string, number>();
      const units = new Map<string, string>();
      for (const root of roots) explode(root.itemCd, 1, bom.details, quantities, 0, units);
      const items: SapBomItem[] = [...quantities.entries()].map(([material, qtyPerTower]) => {
        const line = pricedLine(byMaterial.get(material) ?? [], projectId);
        return {
          material,
          description: line?.materialDesc ?? "",
          itemGroup: line?.itemGroup ?? "",
          vendor: line?.vendor ?? "",
          qtyPerTower: Math.round(qtyPerTower * 1000) / 1000,
          unit: line?.unit || units.get(material) || "",
          unitPriceUsd: line ? Math.round((line.usdAmount / line.poQty) * 100) / 100 : null,
          po: line?.po ?? null,
          incoterms: line?.incoterms ?? "",
        };
      });
      items.sort((left, right) => left.itemGroup.localeCompare(right.itemGroup) || left.material.localeCompare(right.material));
      return {
        projectId,
        projectName: projectNames.get(projectId) ?? roots[0].itemNm,
        sections: roots.map((root) => root.itemNm).sort(),
        items,
      };
    })
    .sort((left, right) => left.projectName.localeCompare(right.projectName));
}

/** Rejects a file that is not a WINSYS BOM collection. */
export function readWinsysBomFile(text: string): WinsysBomFile {
  const data = JSON.parse(text) as Partial<WinsysBomFile>;
  if (!Array.isArray(data.headers) || !data.details || typeof data.details !== "object") throw new Error("Not a WINSYS BOM collection (headers and details expected).");
  return data as WinsysBomFile;
}
