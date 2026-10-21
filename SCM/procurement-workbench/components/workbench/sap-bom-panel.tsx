import { useMemo, useState } from "react";
import type { Workbench } from "@/hooks/useWorkbench";
import { formatMoney, formatNumber } from "@/lib/format";
import { projectQuantity } from "@/lib/mpp/match";
import { winsysProjectMatcher } from "@/lib/winsys/analysis";

type SapBomPanelProps = {
  wb: Workbench;
};

/** SAP BOM of the selected project from WINSYS: purchased parts per tower, priced from WINSYS PO lines. */
export function SapBomPanel({ wb }: SapBomPanelProps) {
  const { activeWorkspace, activeProject, projectList, projectTowerQty: deliveryTowerQty, mdmp } = wb;
  // Towers from the project name ("Panther Grove Phase 2 - 5T"), else the delivery records.
  const projectTowerQty = projectQuantity(activeProject) ?? deliveryTowerQty;
  const [group, setGroup] = useState("All");
  const [search, setSearch] = useState("");
  const extract = mdmp.winsys.kind === "ready" ? mdmp.winsys.data : null;

  const bom = useMemo(() => {
    const boms = extract?.bom ?? [];
    const byCode = boms.find((item) => item.projectId === activeProject.code.trim());
    if (byCode) return byCode;
    const projectFor = winsysProjectMatcher(projectList);
    return boms.find((item) => projectFor(item.projectName) === activeProject.id) ?? null;
  }, [extract, activeProject, projectList]);

  const groups = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of bom?.items ?? []) totals.set(item.itemGroup || "Other", (totals.get(item.itemGroup || "Other") ?? 0) + (item.unitPriceUsd ?? 0) * item.qtyPerTower);
    return [...totals.entries()].sort((left, right) => right[1] - left[1]);
  }, [bom]);

  const needle = search.trim().toLowerCase();
  const visible = (bom?.items ?? []).filter(
    (item) =>
      (group === "All" || (item.itemGroup || "Other") === group) &&
      (!needle || [item.material, item.description, item.vendor, item.po ?? ""].some((value) => value.toLowerCase().includes(needle))),
  );
  const perTower = (bom?.items ?? []).reduce((sum, item) => sum + (item.unitPriceUsd ?? 0) * item.qtyPerTower, 0);
  const unpriced = (bom?.items ?? []).filter((item) => item.unitPriceUsd === null).length;
  const hidden = activeWorkspace !== "bom";

  if (!extract) return null;
  if (!bom) {
    return (
      <section className="bom-panel" hidden={hidden}>
        <div className="panel-header">
          <div>
            <h2>SAP BOM (WINSYS)</h2>
            <p>
              No SAP BOM was collected for {activeProject.name}
              {extract.bomCollectedAt ? ` (collection of ${extract.bomCollectedAt.slice(0, 10)})` : ""}. WINSYS has no BOM under its project ID yet, or it was not collected.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bom-panel" hidden={hidden} aria-labelledby="sap-bom-title">
      <div className="panel-header">
        <div>
          <h2 id="sap-bom-title">SAP BOM (WINSYS)</h2>
          <p>
            Purchased parts per tower from the SAP BOMs of WINSYS project {bom.projectId} ({bom.sections.length} section BOMs, collected{" "}
            {extract.bomCollectedAt?.slice(0, 10) ?? "-"}). Unit price: latest WINSYS PO line for the part, converted to USD.
          </p>
        </div>
        <div className="filters smart-filters">
          <select aria-label="SAP BOM material group" value={group} onChange={(event) => setGroup(event.target.value)}>
            <option value="All">All material groups</option>
            {groups.map(([name]) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <input aria-label="Search SAP BOM" placeholder="Search part / supplier / PO" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
      </div>
      <div className="bom-toolbar">
        <article>
          <span>Parts</span>
          <strong>{bom.items.length.toLocaleString()}</strong>
          <small>{unpriced ? `${unpriced} never ordered (no price)` : "all priced from WINSYS POs"}</small>
        </article>
        <article>
          <span>Material per tower</span>
          <strong>{formatMoney(perTower)}</strong>
          <small>{groups.slice(0, 3).map(([name, value]) => `${name} ${Math.round((value / (perTower || 1)) * 100)}%`).join(" · ")}</small>
        </article>
        <article>
          <span>Project material ({projectTowerQty.toLocaleString()} towers)</span>
          <strong>{formatMoney(perTower * projectTowerQty)}</strong>
          <small>per tower × towers in the project</small>
        </article>
      </div>
      <div className="plan-table-wrap">
        <table className="plan-table">
          <thead>
            <tr>
              <th>Material group</th>
              <th>Part</th>
              <th>Supplier · PO</th>
              <th className="numeric">Qty / tower</th>
              <th className="numeric">Unit price (USD)</th>
              <th className="numeric">Per tower</th>
              <th className="numeric">Project ({projectTowerQty} TW)</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
              const amount = item.unitPriceUsd === null ? null : item.unitPriceUsd * item.qtyPerTower;
              return (
                <tr key={item.material}>
                  <td>{item.itemGroup || "Other"}</td>
                  <td>
                    <strong>{item.description || item.material}</strong>
                    <small>{item.material}</small>
                  </td>
                  <td>
                    {item.vendor || "-"}
                    <small>
                      {item.po ? `PO ${item.po}` : "not ordered"}
                      {item.incoterms ? ` · ${item.incoterms}` : ""}
                    </small>
                  </td>
                  <td className="numeric">
                    {formatNumber(item.qtyPerTower)} {item.unit}
                  </td>
                  <td className="numeric">{item.unitPriceUsd === null ? "-" : formatMoney(item.unitPriceUsd)}</td>
                  <td className="numeric">{amount === null ? "-" : formatMoney(amount)}</td>
                  <td className="numeric">{amount === null ? "-" : formatMoney(amount * projectTowerQty)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length ? <p className="empty-state table-empty">No parts match the filters.</p> : null}
      </div>
    </section>
  );
}
