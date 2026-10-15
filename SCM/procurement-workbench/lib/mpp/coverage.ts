// What the workbench already tracks for an MPP material. The workbench records
// internal-mounting purchases (deliveries), so only door frames and internals
// can be checked; steel plate and flanges are bought outside it.
import type { Delivery } from "../types";
import type { MppMaterial } from "./parse";

export type WorkbenchCoverage = {
  deliveries: number;
  pos: number;
};

const isDoorFrame = (delivery: Pick<Delivery, "category" | "material">) =>
  /door\s*frame/i.test(`${delivery.category} ${delivery.material}`);

export function workbenchCoverage(projectId: string, material: MppMaterial, deliveries: readonly Delivery[]): WorkbenchCoverage | null {
  if (material !== "Door frame" && material !== "Internal") return null;
  const relevant = deliveries.filter(
    (delivery) => delivery.projectId === projectId && (material === "Door frame" ? isDoorFrame(delivery) : !isDoorFrame(delivery)),
  );
  return {
    deliveries: relevant.length,
    pos: new Set(relevant.map((delivery) => delivery.po).filter(Boolean)).size,
  };
}
