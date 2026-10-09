import { getMaterialCost, getProjectedTotalCost } from "@/lib/delivery";
import { formatMoney, formatNumber } from "@/lib/format";
import type { Workbench } from "@/hooks/useWorkbench";

type BomPanelProps = {
  wb: Workbench;
};

export function BomPanel({ wb }: BomPanelProps) {
  const { bomItems, bomManufacturerFilter, setBomManufacturerFilter, bomCategoryFilter, setBomCategoryFilter, bomSearch, setBomSearch, activeWorkspace, projectRows, projectTowerQty, projectPurchasingBomItems, projectInternalBomItems, bomManufacturers, bomCategories, visiblePurchasingBomItems, getBomLineQty, getBomLineAmount, bomVisibleTotalQty, bomVisibleTotalAmount, importBomFile, clearProjectBom } = wb;

  return (
    <>
      <section className="zone-title bom-zone-title" aria-label="BOM section" hidden={activeWorkspace !== "bom"}>
        <h2>BOM</h2>
      </section>
      <section className="bom-panel bom-purchasing-panel" hidden={activeWorkspace !== "bom"}>
        <div className="panel-header">
          <div>
            <h2>BOM for Purchasing</h2>
            <p>Upload purchasing BOM and review supplier, quantity, unit price, and amount by project.</p>
          </div>
          <div className="filters smart-filters">
            <select aria-label="BOM supplier filter" value={bomManufacturerFilter} onChange={(event) => setBomManufacturerFilter(event.target.value)}>
              {bomManufacturers.map((manufacturer) => (
                <option key={manufacturer} value={manufacturer}>{manufacturer === "All" ? "All suppliers" : manufacturer}</option>
              ))}
            </select>
            <select aria-label="BOM category filter" value={bomCategoryFilter} onChange={(event) => setBomCategoryFilter(event.target.value)}>
              {bomCategories.map((categoryName) => (
                <option key={categoryName} value={categoryName}>{categoryName === "All" ? "All categories" : categoryName}</option>
              ))}
            </select>
            <input
              aria-label="Search BOM"
              placeholder="Search component / supplier"
              value={bomSearch}
              onChange={(event) => setBomSearch(event.target.value)}
            />
          </div>
        </div>
        <div className="bom-toolbar">
          <article>
            <span>Visible lines</span>
            <strong>{visiblePurchasingBomItems.length.toLocaleString()}</strong>
            <small>{projectPurchasingBomItems.length.toLocaleString()} total BOM lines</small>
          </article>
          <article>
            <span>Visible quantity</span>
            <strong>{formatNumber(bomVisibleTotalQty)}</strong>
            <small>PO qty or tower qty basis</small>
          </article>
          <article>
            <span>Visible amount</span>
            <strong>{formatMoney(bomVisibleTotalAmount)}</strong>
            <small>Amount/5TW or qty x unit price</small>
          </article>
          <div className="bom-toolbar-actions">
            <label className="file-action">
              Upload BOM
              <input accept=".xlsx,.xls,.csv,text/csv" aria-label="Upload BOM for purchasing" onChange={(event) => importBomFile(event, "purchasing")} type="file" />
            </label>
            <button className="secondary-action" onClick={() => clearProjectBom("purchasing")} disabled={!projectPurchasingBomItems.length}>Clear BOM</button>
          </div>
        </div>
        <div className="bom-table">
          <div className="bom-row bom-purchasing-row bom-head">
            <span>Component / Material</span>
            <span>Supplier</span>
            <span>Category</span>
            <span>Qty / tower</span>
            <span>PO qty</span>
            <span>Unit price</span>
            <span>Amount</span>
          </div>
          {visiblePurchasingBomItems.length ? (
            visiblePurchasingBomItems.map((item) => (
              <div className="bom-row bom-purchasing-row" key={item.id}>
                <span>
                  <strong>{item.componentNumber || item.material}</strong>
                  <small>{item.material}</small>
                </span>
                <span>
                  <strong>{item.manufacturer || "-"}</strong>
                  <small>{item.vendorCode || "No vendor code"}</small>
                </span>
                <span>
                  <strong>{item.category || "-"}</strong>
                  <small>{[item.currency, item.incoterms].filter(Boolean).join(" | ") || "No terms"}</small>
                </span>
                <span>{formatNumber(item.qtyPerTower)}</span>
                <span>{formatNumber(getBomLineQty(item))}</span>
                <span>{formatMoney(item.unitCost)}</span>
                <span>
                  <strong>{formatMoney(getBomLineAmount(item))}</strong>
                  <small>{item.amountTotal ? "BOM amount" : "Calculated"}</small>
                </span>
              </div>
            ))
          ) : (
            <div className="empty-state bom-empty">Upload BOM for purchasing, or adjust supplier/category/search filters.</div>
          )}
        </div>
      </section>
      <section className="bom-panel" hidden>
        <div className="panel-header">
          <div>
            <h2>BOM</h2>
            <p>Upload BOM for purchasing and Internal BOM independently for this project.</p>
          </div>
        </div>
        <div className="bom-layout">
          <div className="bom-upload-grid">
            <article className="bom-upload-card">
              <span>BOM for purchasing</span>
              <strong>{projectPurchasingBomItems.length.toLocaleString()} lines</strong>
              <small>Feeds material cost calculation.</small>
              <div className="bom-upload-actions">
                <label className="file-action">
                  Upload
                  <input accept=".xlsx,.xls,.csv,text/csv" aria-label="Upload BOM for purchasing" onChange={(event) => importBomFile(event, "purchasing")} type="file" />
                </label>
                <button className="secondary-action" onClick={() => clearProjectBom("purchasing")} disabled={!projectPurchasingBomItems.length}>Clear</button>
              </div>
            </article>
            <article className="bom-upload-card">
              <span>Internal BOM</span>
              <strong>{projectInternalBomItems.length.toLocaleString()} lines</strong>
              <small>Separate reference list, not included in cost.</small>
              <div className="bom-upload-actions">
                <label className="file-action">
                  Upload
                  <input accept=".xlsx,.xls,.csv,text/csv" aria-label="Upload Internal BOM" onChange={(event) => importBomFile(event, "internal")} type="file" />
                </label>
                <button className="secondary-action" onClick={() => clearProjectBom("internal")} disabled={!projectInternalBomItems.length}>Clear</button>
              </div>
            </article>
          </div>
          <div className="bom-card">
            <div className="section-title compact-title">
              <h2>Batch Material Totals</h2>
            </div>
            <div className="bom-table">
              <div className="bom-row bom-head">
                <span>Batch</span>
                <span>Tower qty</span>
                <span>Material total</span>
                <span>Total incl. freight/tariff</span>
              </div>
              {projectRows.length ? (
                projectRows.map((row) => (
                  <div className="bom-row" key={`bom-batch-${row.id}`}>
                    <span>
                      <strong>{row.batch}</strong>
                      <small>{row.po}</small>
                    </span>
                    <span>{row.qty.toLocaleString()}</span>
                    <span>{formatMoney(getMaterialCost(row, bomItems))}</span>
                    <span>{formatMoney(getProjectedTotalCost(row, bomItems, projectRows))}</span>
                  </div>
                ))
              ) : (
                <div className="empty-state">Add a delivery batch first and enter the tower count in Qty.</div>
              )}
            </div>
          </div>
          <div className="bom-card">
            <div className="section-title compact-title">
              <h2>BOM for Purchasing Detail</h2>
            </div>
            <div className="bom-table">
              <div className="bom-row bom-material-row bom-head">
                <span>Component / Material</span>
                <span>Vendor</span>
                <span>Qty / tower</span>
                <span>Project total</span>
              </div>
              {projectPurchasingBomItems.length ? (
                projectPurchasingBomItems.map((item) => (
                  <div className="bom-row bom-material-row" key={item.id}>
                    <span>
                      <strong>{item.componentNumber || item.material}</strong>
                      <small>{item.material}</small>
                    </span>
                    <span>
                      <strong>{item.manufacturer || "-"}</strong>
                      <small>{[item.vendorCode, item.currency, item.incoterms].filter(Boolean).join(" · ") || "No vendor code"}</small>
                    </span>
                    <span>{formatNumber(item.qtyPerTower)}</span>
                    <span>
                      <strong>{formatMoney(projectTowerQty * item.qtyPerTower * item.unitCost)}</strong>
                      <small>{formatNumber(projectTowerQty * item.qtyPerTower)} pcs · {formatMoney(item.unitCost)} / unit</small>
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty-state">Upload a BOM CSV to see usage, unit price, and project total for each category and material.</div>
              )}
            </div>
          </div>
          <div className="bom-card">
            <div className="section-title compact-title">
              <h2>Internal BOM Detail</h2>
            </div>
            <div className="bom-table">
              <div className="bom-row internal-bom-row bom-head">
                <span>Section</span>
                <span>Component</span>
                <span>Supplier</span>
                <span>Qty / tower</span>
                <span>Old code</span>
              </div>
              {projectInternalBomItems.length ? (
                projectInternalBomItems.map((item) => (
                  <div className="bom-row internal-bom-row" key={item.id}>
                    <span>
                      <strong>{item.sectionInfo || "-"}</strong>
                      <small>{item.sectionCode || "No section code"}</small>
                    </span>
                    <span>
                      <strong>{item.componentNumber || "-"}</strong>
                      <small>{item.material}</small>
                    </span>
                    <span>{item.manufacturer || "-"}</span>
                    <span>{formatNumber(item.qtyPerTower)}</span>
                    <span>{item.oldCode || "-"}</span>
                  </div>
                ))
              ) : (
                <div className="empty-state">Upload Internal BOM to preview sections, components, suppliers, and internal quantities.</div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
