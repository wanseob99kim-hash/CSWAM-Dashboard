// What the MDMP means for purchasing: lead times per PO line, when we pick
// goods up, when vendors invoice and get paid, whether arrivals cover
// production, and which lines still need a PO or a confirmation.
import { defaultTransitWeeks, findLeadTime, type LeadTimeTable } from "../leadtime/parse";
import type { MaterialPlanSettings } from "../mpp/order-plan";
import { addWeeksTo, isoWeekMonday, weekIndex, weeksBetween, type IsoWeek } from "../mpp/weeks";
import { parsePaymentTerms, paymentDueDate } from "../payment-terms";
import type { PurchasePoLine } from "../types";
import type { CellStatus, MdmpLine, MdmpProcess, MdmpProject } from "./parse";

/** Incoterms where we collect at the vendor, so the vendor invoices at pickup. */
const PICKUP_TERMS = /^(EXW|FCA|FOB)/;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Ordered within this share of the requirement counts as the same quantity basis. */
const BASIS_TOLERANCE = 0.15;
/** Groups bought one per section, so ordering less than the requirement is a real gap. */
const ONE_PER_SECTION = new Set(["Steel plate", "Flange"]);

export type LineLeadTime = { ddpWeeks: number; exwWeeks: number | null; transitWeeks: number | null; source: string };

/** CSWAM DDP lead time by item category (lead time file, Sheet1), matched on words in the group name. */
const CATEGORY_KEYWORDS: Array<[RegExp, string]> = [
  [/fall arrest/i, "Fall Arrest"],
  [/ladder/i, "Climb Ladders"],
  [/lift|hoist/i, "Service Lift"],
  [/tarp/i, "Tarpaulins"],
  [/tray/i, "cable ladder/tray"],
  [/door/i, "Door"],
  [/bolt/i, "Flange bolts"],
  [/led|light/i, "LED Lights"],
  [/clamp/i, "Cable Clamps"],
  [/cable|foc|interlock/i, "Cables"],
  [/platform|gallery|gate|magnet|support|kitset|damper|wb|otp|eti/i, "Mechanical Parts"],
];

export function lineLeadTime(table: LeadTimeTable | null, line: MdmpLine, settings: MaterialPlanSettings): LineLeadTime {
  const match = table ? findLeadTime(table, line.manufacturer, line.group, line.shippingBy) : null;
  if (match) return { ddpWeeks: match.ddpWeeks, exwWeeks: match.exwWeeks, transitWeeks: match.transitWeeks, source: match.source };
  if (line.group === "Steel plate" || line.group === "Flange") {
    return { ddpWeeks: settings.leadTimeWeeks[line.group], exwWeeks: null, transitWeeks: null, source: `Material Plan ${line.group} setting` };
  }
  if (table) {
    const category = CATEGORY_KEYWORDS.find(([pattern]) => pattern.test(line.group))?.[1] ?? "Small & Others";
    const weeks = table.categories[category];
    if (weeks) return { ddpWeeks: weeks, exwWeeks: null, transitWeeks: null, source: `Lead time file: CSWAM ${category}` };
  }
  const internal = settings.leadTimeWeeks.Internal;
  return { ddpWeeks: internal, exwWeeks: null, transitWeeks: null, source: "Material Plan Internal setting" };
}

export const isPickupTerm = (incoterms: string) => PICKUP_TERMS.test(incoterms.trim().toUpperCase());

export type Shipment = {
  /** Week we collect at the vendor (pickup incoterms only). */
  pickupWeek: IsoWeek | null;
  arrivalWeek: IsoWeek;
  qty: number;
  /** True when the pickup week was not marked in the MDMP and is arrival minus transit. */
  pickupInferred: boolean;
  pickupStatus: CellStatus;
  arrivalStatus: CellStatus;
};

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};

/**
 * Pairs each arrival with its pickup marker in order (a marker pairs with the
 * first arrival at or after it). Arrivals without a marker get pickup = arrival
 * minus the transit seen on paired shipments, else the lead-time transit, else
 * a default by shipping mode.
 */
export function lineShipments(line: MdmpLine, lead: LineLeadTime): Shipment[] {
  const arrivals = line.events.filter((event) => event.kind === "arrival");
  if (!isPickupTerm(line.incoterms)) {
    return arrivals.map((arrival) => ({
      pickupWeek: null,
      arrivalWeek: arrival.week,
      qty: arrival.qty,
      pickupInferred: false,
      pickupStatus: null,
      arrivalStatus: arrival.status,
    }));
  }
  const markers = line.events.filter((event) => event.kind === "pickup");
  const paired: Array<{ marker: (typeof markers)[number] | null; arrival: (typeof arrivals)[number] }> = [];
  let next = 0;
  for (const arrival of arrivals) {
    const marker = markers[next];
    if (marker && weeksBetween(marker.week, arrival.week) >= 0) {
      paired.push({ marker, arrival });
      next += 1;
    } else {
      paired.push({ marker: null, arrival });
    }
  }
  const observed = median(paired.flatMap((pair) => (pair.marker ? [weeksBetween(pair.marker.week, pair.arrival.week)] : [])));
  const transit = observed ?? lead.transitWeeks ?? defaultTransitWeeks(line.shippingBy);
  return paired.map(({ marker, arrival }) => ({
    pickupWeek: marker ? marker.week : addWeeksTo(arrival.week, -transit),
    arrivalWeek: arrival.week,
    qty: arrival.qty,
    pickupInferred: !marker,
    pickupStatus: marker ? marker.status : null,
    arrivalStatus: arrival.status,
  }));
}

export type CashEvent = {
  key: string;
  project: MdmpProject;
  line: MdmpLine;
  /** "pickup": EXW/FCA/FOB, the vendor invoices when we collect; "arrival": DAP/DDP and others. */
  basis: "pickup" | "arrival";
  invoiceWeek: IsoWeek;
  invoiceDate: Date;
  dueDate: Date | null;
  qty: number;
  /** USD, when the SAP PO detail gives the PO's value. */
  amount: number | null;
  /** Pickup or receipt already done (green in the MDMP). */
  done: boolean;
};

/** PO value per MDMP line from SAP PO detail lines, split by quantity when lines share a PO. */
export function poValueByLine(projects: MdmpProject[], poLines: readonly PurchasePoLine[]): Map<MdmpLine, number> {
  const amountByPo = new Map<string, number>();
  for (const line of poLines) amountByPo.set(line.po, (amountByPo.get(line.po) ?? 0) + line.amount);
  const linesByPo = new Map<string, MdmpLine[]>();
  for (const project of projects) for (const line of project.lines) for (const po of line.poNumbers) linesByPo.set(po, [...(linesByPo.get(po) ?? []), line]);

  const values = new Map<MdmpLine, number>();
  for (const [po, lines] of linesByPo) {
    const amount = amountByPo.get(po);
    if (!amount) continue;
    const quantity = lines.reduce((sum, line) => sum + line.subtotal, 0);
    for (const line of lines) {
      const share = quantity > 0 ? line.subtotal / quantity : 1 / lines.length;
      values.set(line, (values.get(line) ?? 0) + amount * share);
    }
  }
  return values;
}

const midweek = (week: IsoWeek) => new Date(isoWeekMonday(week).getTime() + 2 * DAY_MS);

export function cashEvents(
  projects: MdmpProject[],
  leadTimeFor: (line: MdmpLine) => LineLeadTime,
  lineValues: Map<MdmpLine, number>,
): CashEvent[] {
  return projects.flatMap((project) =>
    project.lines.flatMap((line) => {
      const terms = parsePaymentTerms(line.paymentTerms);
      const value = lineValues.get(line);
      const unitPrice = value !== undefined && line.subtotal > 0 ? value / line.subtotal : null;
      return lineShipments(line, leadTimeFor(line)).map((shipment, index): CashEvent => {
        const basis = shipment.pickupWeek ? "pickup" : "arrival";
        const invoiceWeek = shipment.pickupWeek ?? shipment.arrivalWeek;
        const invoiceDate = midweek(invoiceWeek);
        return {
          key: `${project.sheet}-${line.row}-${index}`,
          project,
          line,
          basis,
          invoiceWeek,
          invoiceDate,
          dueDate: terms ? paymentDueDate(invoiceDate, terms) : null,
          qty: shipment.qty,
          amount: unitPrice === null ? null : unitPrice * shipment.qty,
          done: (basis === "pickup" ? shipment.pickupStatus : shipment.arrivalStatus) === "done" || shipment.arrivalStatus === "done",
        };
      });
    }),
  );
}

export type CoverageCheck = {
  project: MdmpProject;
  section: MdmpLine["section"];
  group: string;
  process: MdmpProcess;
  basis: "sections" | "towers";
  required: number;
  ordered: number;
  received: number;
  /** "short": arrivals fall behind production from `shortWeek`; "under-ordered": total ordered below need. */
  status: "covered" | "short" | "under-ordered";
  shortWeek: IsoWeek | null;
  shortQty: number;
};

const PROCESS_FOR_SECTION: Record<MdmpLine["section"], MdmpProcess> = { main: "Cutting", internal: "IM Release", shipping: "Shipping" };

/**
 * Compares cumulative arrivals with cumulative production need, per material
 * group. Only groups whose ordered quantity is on the same basis as the
 * production plan (within 15%, in sections or towers) are time-phased; steel
 * plate and flanges ordered well below the need are reported as under-ordered.
 */
export function coverageChecks(project: MdmpProject, current: IsoWeek): CoverageCheck[] {
  const groups = new Map<string, MdmpLine[]>();
  for (const line of project.lines) {
    if (line.subtotal <= 0 && !ONE_PER_SECTION.has(line.group)) continue;
    const key = `${line.section}|${line.group}`;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }

  const checks: CoverageCheck[] = [];
  for (const lines of groups.values()) {
    const { section, group } = lines[0];
    const process = PROCESS_FOR_SECTION[section];
    const need = project.processes[process] ?? [];
    const sectionsNeeded = need.reduce((sum, point) => sum + point.qty, 0);
    if (!sectionsNeeded) continue;
    const ordered = lines.reduce((sum, line) => sum + line.subtotal, 0);
    const perTower = project.sectionsPerTower ?? 1;
    const near = (target: number) => target > 0 && Math.abs(ordered - target) / target <= BASIS_TOLERANCE;
    const basis: CoverageCheck["basis"] | null = near(sectionsNeeded) ? "sections" : near(sectionsNeeded / perTower) ? "towers" : null;
    const arrivals = lines.flatMap((line) => line.events.filter((event) => event.kind === "arrival"));
    const received = arrivals.filter((event) => event.status === "done").reduce((sum, event) => sum + event.qty, 0);

    if (!basis) {
      if (ONE_PER_SECTION.has(group) && ordered < sectionsNeeded * (1 - BASIS_TOLERANCE)) {
        checks.push({ project, section, group, process, basis: "sections", required: sectionsNeeded, ordered, received, status: "under-ordered", shortWeek: null, shortQty: sectionsNeeded - ordered });
      }
      continue;
    }

    const divisor = basis === "towers" ? perTower : 1;
    const weeks = [...new Set([...need.map((point) => weekIndex(point.week)), ...arrivals.map((event) => weekIndex(event.week))])].sort((a, b) => a - b);
    let cumulativeNeed = 0;
    let cumulativeArrived = 0;
    let shortWeek: number | null = null;
    let shortQty = 0;
    for (const index of weeks) {
      cumulativeNeed += need.filter((point) => weekIndex(point.week) === index).reduce((sum, point) => sum + point.qty, 0) / divisor;
      cumulativeArrived += arrivals.filter((event) => weekIndex(event.week) === index).reduce((sum, event) => sum + event.qty, 0);
      const gap = cumulativeNeed - cumulativeArrived;
      // Shortages already behind us were absorbed by production; report the next one.
      if (index >= weekIndex(current) && gap > 0.5 && shortWeek === null) {
        shortWeek = index;
        shortQty = Math.round(gap);
      }
    }
    checks.push({
      project,
      section,
      group,
      process,
      basis,
      required: Math.round(sectionsNeeded / divisor),
      ordered,
      received,
      status: shortWeek === null ? "covered" : "short",
      shortWeek: shortWeek === null ? null : weekFromIndexSafe(shortWeek, need, arrivals),
      shortQty,
    });
  }
  return checks;
}

function weekFromIndexSafe(index: number, need: Array<{ week: IsoWeek }>, arrivals: Array<{ week: IsoWeek }>): IsoWeek {
  return [...need, ...arrivals].find((item) => weekIndex(item.week) === index)!.week;
}

export type PurchaseAction = {
  key: string;
  project: MdmpProject;
  line: MdmpLine;
  kind: "place-po" | "confirm-oc";
  /** Place-po: the order-by week. Confirm-oc: the PO week. */
  week: IsoWeek;
  weeksFromNow: number;
  firstArrival: IsoWeek | null;
  lead: LineLeadTime;
};

/**
 * PO lines that need a buyer: no PO yet (order-by = first planned arrival minus
 * DDP lead time minus safety weeks), or a PO placed a week or more ago with no
 * order confirmation.
 */
export function purchaseActions(
  projects: MdmpProject[],
  leadTimeFor: (line: MdmpLine) => LineLeadTime,
  current: IsoWeek,
  safetyWeeks: number,
): PurchaseAction[] {
  const actions: PurchaseAction[] = [];
  for (const project of projects) {
    for (const line of project.lines) {
      if (line.subtotal <= 0) continue;
      const po = line.events.find((event) => event.kind === "po");
      const oc = line.events.find((event) => event.kind === "oc");
      const firstArrival = line.events.find((event) => event.kind === "arrival")?.week ?? null;
      const lead = leadTimeFor(line);
      const poDone = po?.status === "done" || line.events.some((event) => event.kind === "arrival" && event.status === "done");
      if (!poDone && firstArrival) {
        const orderBy = addWeeksTo(firstArrival, -(lead.ddpWeeks + safetyWeeks));
        actions.push({ key: `${project.sheet}-${line.row}-po`, project, line, kind: "place-po", week: orderBy, weeksFromNow: weeksBetween(current, orderBy), firstArrival, lead });
      } else if (po && poDone && oc?.status !== "done" && weeksBetween(po.week, current) >= 1 && firstArrival && weeksBetween(current, firstArrival) >= 0) {
        actions.push({ key: `${project.sheet}-${line.row}-oc`, project, line, kind: "confirm-oc", week: po.week, weeksFromNow: weeksBetween(current, po.week), firstArrival, lead });
      }
    }
  }
  return actions.sort((left, right) => weekIndex(left.week) - weekIndex(right.week));
}

export type UpcomingShipment = Shipment & { key: string; project: MdmpProject; line: MdmpLine; kind: "pickup" | "arrival"; week: IsoWeek; weeksFromNow: number };

/** Pickups to arrange and arrivals to expect in a window around `current`; overdue ones (not done) included. */
export function upcomingShipments(
  projects: MdmpProject[],
  leadTimeFor: (line: MdmpLine) => LineLeadTime,
  current: IsoWeek,
  aheadWeeks: number,
): UpcomingShipment[] {
  const items: UpcomingShipment[] = [];
  for (const project of projects) {
    for (const line of project.lines) {
      lineShipments(line, leadTimeFor(line)).forEach((shipment, index) => {
        const add = (kind: "pickup" | "arrival", week: IsoWeek, done: boolean) => {
          const weeksFromNow = weeksBetween(current, week);
          if (done || weeksFromNow > aheadWeeks || weeksFromNow < -4) return;
          items.push({ ...shipment, key: `${project.sheet}-${line.row}-${index}-${kind}`, project, line, kind, week, weeksFromNow });
        };
        if (shipment.pickupWeek) add("pickup", shipment.pickupWeek, shipment.pickupStatus === "done" || shipment.arrivalStatus === "done");
        add("arrival", shipment.arrivalWeek, shipment.arrivalStatus === "done");
      });
    }
  }
  return items.sort((left, right) => left.weeksFromNow - right.weeksFromNow);
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
