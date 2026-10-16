// Reads the "Overall Lead time" workbook:
// - "US only": customer · supplier · product · target · EXW lead time ·
//   ocean/truck transit · DDP total, in weeks (the CSWAM route table);
// - a "Supplier · Abbr. · Product · Lead time" sheet (EXW weeks, global suppliers);
// - a category × plant sheet of DDP weeks (the CSWAM column is used).

export type LeadTimeRoute = {
  customer: string;
  supplier: string;
  product: string;
  targetWeeks: number | null;
  exwWeeks: number | null;
  transitWeeks: number | null;
  ddpWeeks: number | null;
};

export type SupplierLeadTime = { supplier: string; abbreviation: string; product: string; exwWeeks: number };

export type LeadTimeTable = {
  routes: LeadTimeRoute[];
  suppliers: SupplierLeadTime[];
  /** DDP weeks per item category for CSWAM ("Mechanical Parts" -> 22). */
  categories: Record<string, number>;
};

export type LeadTimeMatch = {
  exwWeeks: number | null;
  transitWeeks: number | null;
  ddpWeeks: number;
  /** Which table the numbers came from, for showing the user. */
  source: string;
};

type Rows = unknown[][];

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).replace(/\s+/g, " ").trim());
const numeric = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(text(value));
  return text(value) !== "" && Number.isFinite(number) ? number : null;
};

function findHeader(rows: Rows, test: (cells: string[]) => boolean) {
  return rows.findIndex((row) => test((row ?? []).map((cell) => text(cell).toLowerCase())));
}

function readRoutes(rows: Rows): LeadTimeRoute[] {
  const header = findHeader(rows, (cells) => cells.includes("supplier") && cells.some((cell) => cell.includes("ddp")));
  if (header < 0) return [];
  const cells = (rows[header] ?? []).map((cell) => text(cell).toLowerCase());
  const column = (test: (cell: string) => boolean) => cells.findIndex(test);
  const columns = {
    customer: column((cell) => cell === "customer"),
    supplier: column((cell) => cell === "supplier"),
    product: column((cell) => cell === "product"),
    target: column((cell) => cell.includes("target")),
    exw: column((cell) => cell.includes("exw")),
    transit: column((cell) => cell.includes("ocean") || cell.includes("truck") || cell.includes("transit")),
    ddp: column((cell) => cell.includes("ddp")),
  };
  const routes: LeadTimeRoute[] = [];
  let customer = "";
  let supplier = "";
  for (const row of rows.slice(header + 1)) {
    customer = text(row?.[columns.customer]) || customer;
    // A blank supplier continues the one above (one supplier, several products).
    supplier = text(row?.[columns.supplier]) || supplier;
    const product = text(row?.[columns.product]);
    const ddp = numeric(row?.[columns.ddp]);
    if (!supplier || !product || ddp === null) continue;
    routes.push({
      customer,
      supplier,
      product,
      targetWeeks: numeric(row?.[columns.target]),
      exwWeeks: numeric(row?.[columns.exw]),
      transitWeeks: numeric(row?.[columns.transit]),
      ddpWeeks: ddp,
    });
  }
  return routes;
}

function readSuppliers(rows: Rows): SupplierLeadTime[] {
  const header = findHeader(rows, (cells) => cells.includes("supplier") && cells.some((cell) => cell.startsWith("abbr")));
  if (header < 0) return [];
  const cells = (rows[header] ?? []).map((cell) => text(cell).toLowerCase());
  const at = (row: unknown[], name: string) => row?.[cells.findIndex((cell) => cell.startsWith(name))];
  return rows.slice(header + 1).flatMap((row) => {
    const exw = numeric(at(row, "lead"));
    const supplier = text(at(row, "supplier"));
    return supplier && exw !== null ? [{ supplier, abbreviation: text(at(row, "abbr")), product: text(at(row, "product")), exwWeeks: exw }] : [];
  });
}

function readCategories(rows: Rows): Record<string, number> {
  const header = findHeader(rows, (cells) => cells.includes("cswam"));
  if (header < 0) return {};
  const column = (rows[header] ?? []).findIndex((cell) => text(cell).toLowerCase() === "cswam");
  const categories: Record<string, number> = {};
  for (const row of rows.slice(header + 1)) {
    // The category label is the first filled cell left of the plant columns.
    const label = (row ?? []).slice(0, column).map(text).find((cell) => cell && numeric(cell) === null) ?? "";
    const weeks = numeric(row?.[column]);
    if (label && weeks !== null) categories[label] = weeks;
  }
  return categories;
}

export function parseLeadTimeSheets(sheets: Array<{ name: string; rows: Rows }>): LeadTimeTable {
  const table: LeadTimeTable = { routes: [], suppliers: [], categories: {} };
  for (const { rows } of sheets) {
    if (!table.routes.length) table.routes = readRoutes(rows);
    if (!table.suppliers.length) table.suppliers = readSuppliers(rows);
    if (!Object.keys(table.categories).length) table.categories = readCategories(rows);
  }
  return table;
}

const STOP_WORDS = new Set(["inc", "co", "ltd", "gmbh", "usa", "group", "technology", "technologies", "industry", "the", "and", "corp", "corporation", "leeco", "steel", "wind", "systems", "electric", "industrial", "india", "china", "poland", "belgium", "denmark"]);
function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
}
const sharesToken = (left: string, right: string) => {
  const rightTokens = new Set(tokens(right));
  return tokens(left).some((token) => (token.length >= 4 || rightTokens.size === 1) && rightTokens.has(token));
};

/** Transit assumed when only an EXW lead time is known, by shipping mode. */
export function defaultTransitWeeks(shippingBy: string): number {
  const mode = shippingBy.toLowerCase();
  if (mode.includes("ocean")) return 10;
  if (mode.includes("rail")) return 4;
  if (mode.includes("air")) return 1;
  return 1; // truck
}

/**
 * Lead time for an MDMP line: the US route table first (by supplier, then the
 * product closest to the line's group), then the supplier EXW list plus transit
 * by shipping mode. Null when the supplier is in neither table.
 */
export function findLeadTime(table: LeadTimeTable, manufacturer: string, group: string, shippingBy: string): LeadTimeMatch | null {
  const routes = table.routes.filter((route) => sharesToken(manufacturer, route.supplier) || sharesToken(route.supplier, manufacturer));
  if (routes.length) {
    const route = routes.find((item) => sharesToken(group, item.product) || sharesToken(item.product, group)) ?? routes.reduce((longest, item) =>
      (item.ddpWeeks ?? 0) > (longest.ddpWeeks ?? 0) ? item : longest,
    );
    return {
      exwWeeks: route.exwWeeks,
      transitWeeks: route.transitWeeks,
      ddpWeeks: route.ddpWeeks ?? 0,
      source: `Lead time file: ${route.supplier.trim()} ${route.product}`,
    };
  }
  const supplier = table.suppliers.find(
    (item) =>
      item.abbreviation.toLowerCase() === manufacturer.toLowerCase().trim() ||
      sharesToken(manufacturer, item.supplier) ||
      sharesToken(manufacturer, item.abbreviation),
  );
  if (supplier) {
    const transit = defaultTransitWeeks(shippingBy);
    return {
      exwWeeks: supplier.exwWeeks,
      transitWeeks: transit,
      ddpWeeks: supplier.exwWeeks + transit,
      source: `Lead time file: ${supplier.abbreviation || supplier.supplier} EXW + ${transit} wk ${shippingBy || "transit"}`,
    };
  }
  return null;
}
