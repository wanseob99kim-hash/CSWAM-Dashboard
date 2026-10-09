import { dateInputToMidweekDate, formatInputMidweekDate, formatScheduleWeek } from "@/lib/dates";
import { getEstimatedArrival, getIncotermMode } from "@/lib/delivery";
import { createBulkDeliveryBatch } from "@/lib/drafts";
import type { Workbench } from "@/hooks/useWorkbench";

type DeliveryEditorProps = {
  wb: Workbench;
};

export function DeliveryEditor({ wb }: DeliveryEditorProps) {
  const { projectList, activeWorkspace, showDeliveryForm, setShowDeliveryForm, deliveryEntryMode, editingDeliveryId, deliveryDraft, setDeliveryDraft, bulkDeliveryBatches, setBulkDeliveryBatches, deliveryDraftUsesSupplierEta, deliveryDraftIsDdp, bulkBatchRowClassName, saveDelivery, saveBulkDeliveries, changeDeliveryEntryMode } = wb;

  return (
    <>
      <section className="zone-title delivery-zone-title" aria-label="Delivery section" hidden={activeWorkspace !== "delivery"}>
        <h2>Delivery</h2>
      </section>
      {showDeliveryForm && activeWorkspace === "delivery" ? (
        <section className="editor-panel delivery-editor-panel" aria-label="Add or edit delivery">
          <div className="section-title">
            <h2>{editingDeliveryId ? "Edit Delivery" : "Add Delivery"}</h2>
          </div>
          <div className="form-grid delivery-form">
            {!editingDeliveryId ? (
              <div className="entry-mode-toggle" aria-label="Delivery entry mode">
                <button
                  className={deliveryEntryMode === "single" ? "active" : ""}
                  onClick={() => changeDeliveryEntryMode("single")}
                >
                  Single batch
                </button>
                <button
                  className={deliveryEntryMode === "bulk" ? "active" : ""}
                  onClick={() => changeDeliveryEntryMode("bulk")}
                >
                  PO batches
                </button>
                <span>{deliveryEntryMode === "bulk" ? "Use one PO header, then add as many batch rows as needed." : "Use this for one PO batch only."}</span>
              </div>
            ) : null}
            <div className="form-section-label">PO & Category</div>
            <label>
              Project
              <select value={deliveryDraft.projectId} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, projectId: event.target.value })}>
                {projectList.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>
            <label>
              Category
              <input value={deliveryDraft.category} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, category: event.target.value })} />
            </label>
            {deliveryEntryMode === "single" ? (
              <label>
                Batch
                <input value={deliveryDraft.batch} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, batch: event.target.value })} />
              </label>
            ) : null}
            <label>
              PO
              <input value={deliveryDraft.po} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, po: event.target.value })} />
            </label>
            <label>
              Vendor code
              <input value={deliveryDraft.vendorCode} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, vendorCode: event.target.value })} />
            </label>
            <label>
              Manufacturer
              <input value={deliveryDraft.manufacturer} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, manufacturer: event.target.value })} />
            </label>
            <label>
              Manufacturer location
              <input placeholder="Shenzhen, China" value={deliveryDraft.manufacturerLocation ?? ""} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, manufacturerLocation: event.target.value })} />
            </label>
            <label>
              Payment terms
              <input value={deliveryDraft.paymentTerms} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, paymentTerms: event.target.value })} />
            </label>
            <div className="form-section-label">Logistics, freight & tariff</div>
            {deliveryEntryMode === "single" ? (
              <>
                <label>
                  Delivery way
                  <select value={deliveryDraft.deliveryWay} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, deliveryWay: event.target.value })}>
                    <option>Air</option>
                    <option>Sea</option>
                    <option>Truck</option>
                    <option>Rail</option>
                  </select>
                </label>
                {!deliveryDraftUsesSupplierEta ? (
                  <label>
                    Forwarder
                    <input value={deliveryDraft.forwarder} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, forwarder: event.target.value })} />
                  </label>
                ) : null}
              </>
            ) : null}
            {!deliveryDraftUsesSupplierEta && deliveryEntryMode === "single" ? (
              <>
                <label>
                  Freight fee
                  <input type="number" value={deliveryDraft.freightFee} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, freightFee: Number(event.target.value) })} />
                </label>
                <label>
                  Freight invoice number
                  <input value={deliveryDraft.freightInvoiceNumber ?? ""} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, freightInvoiceNumber: event.target.value })} />
                </label>
                <label className="toggle-label">
                  <input checked={deliveryDraft.freightFeeReceived} type="checkbox" onChange={(event) => setDeliveryDraft({ ...deliveryDraft, freightFeeReceived: event.target.checked })} />
                  Freight invoice received
                </label>
              </>
            ) : null}
            {deliveryEntryMode === "single" && !deliveryDraftIsDdp ? (
              <>
                <label>
                  Tariff
                  <input type="number" value={deliveryDraft.tariff} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, tariff: Number(event.target.value) })} />
                </label>
                <label>
                  Tariff invoice number
                  <input value={deliveryDraft.tariffInvoiceNumber ?? ""} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, tariffInvoiceNumber: event.target.value })} />
                </label>
                <label className="toggle-label">
                  <input checked={!!deliveryDraft.tariffInvoiceReceived} type="checkbox" onChange={(event) => setDeliveryDraft({ ...deliveryDraft, tariffInvoiceReceived: event.target.checked })} />
                  Tariff invoice received
                </label>
              </>
            ) : null}
            <label>
              Incoterms
              <select
                value={getIncotermMode(deliveryDraft)}
                onChange={(event) => {
                  const incoterms = event.target.value;
                  const isSupplierManaged = ["DAP", "DDP"].includes(incoterms);
                  const isDdp = incoterms === "DDP";
                  setDeliveryDraft({
                    ...deliveryDraft,
                    incoterms,
                    forwarder: isSupplierManaged ? "" : deliveryDraft.forwarder,
                    freightFee: isSupplierManaged ? 0 : deliveryDraft.freightFee,
                    freightFeeReceived: isSupplierManaged ? true : deliveryDraft.freightFeeReceived,
                    freightInvoiceNumber: isSupplierManaged ? "" : deliveryDraft.freightInvoiceNumber,
                    tariff: isDdp ? 0 : deliveryDraft.tariff,
                    tariffInvoiceReceived: isDdp ? true : deliveryDraft.tariffInvoiceReceived,
                    tariffInvoiceNumber: isDdp ? "" : deliveryDraft.tariffInvoiceNumber,
                  });
                }}
              >
                <option>DAP</option>
                <option>DDP</option>
                <option>EXW</option>
                <option>FCA</option>
                <option>Other</option>
              </select>
            </label>
            {!deliveryDraftUsesSupplierEta ? (
              <label>
                Transit lead time weeks
                <input type="number" value={deliveryDraft.leadTimeWeeks} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, leadTimeWeeks: Number(event.target.value) })} />
              </label>
            ) : null}
            <div className="form-section-label">Schedule</div>
            <label>
              PO week
              <input type="date" value={formatInputMidweekDate(deliveryDraft.poDate)} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, poDate: dateInputToMidweekDate(event.target.value, deliveryDraft.poDate) })} />
            </label>
            <label>
              OC week
              <input type="date" value={formatInputMidweekDate(deliveryDraft.orderConfirmation)} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, orderConfirmation: dateInputToMidweekDate(event.target.value, deliveryDraft.orderConfirmation) })} />
            </label>
            {deliveryEntryMode === "single" ? (
              <label>
                {deliveryDraftUsesSupplierEta ? "Supplier ETA week" : "Pickup week"}
                <input type="date" value={formatInputMidweekDate(deliveryDraft.supplierSchedule)} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, supplierSchedule: dateInputToMidweekDate(event.target.value, deliveryDraft.supplierSchedule) })} />
              </label>
            ) : null}
            {!deliveryDraftUsesSupplierEta && deliveryEntryMode === "single" ? (
              <label>
                Estimated arrival week
                <input readOnly value={formatScheduleWeek(getEstimatedArrival(deliveryDraft))} />
              </label>
            ) : null}
            {deliveryEntryMode === "single" ? (
              <>
                <label>
                  Actual ETA week
                  <input type="date" value={formatInputMidweekDate(deliveryDraft.actualEta)} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, actualEta: dateInputToMidweekDate(event.target.value) || null })} />
                </label>
                <label>
                  Production need week
                  <input type="date" value={formatInputMidweekDate(deliveryDraft.productionNeed)} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, productionNeed: dateInputToMidweekDate(event.target.value, deliveryDraft.productionNeed) })} />
                </label>
                <label>
                  Actual receive date
                  <input type="date" value={deliveryDraft.actualArrival ?? ""} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, actualArrival: event.target.value || null })} />
                </label>
                <label>
                  Actual receive week
                  <input readOnly value={deliveryDraft.actualArrival ? formatScheduleWeek(deliveryDraft.actualArrival) : ""} />
                </label>
              </>
            ) : null}
            {deliveryEntryMode === "single" ? (
              <label>
                Tower qty
                <input type="number" value={deliveryDraft.qty} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, qty: Number(event.target.value) })} />
              </label>
            ) : null}
            <label>
              Material cost
              <input type="number" value={deliveryDraft.materialCost} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, materialCost: Number(event.target.value) })} />
            </label>
            <div className="form-section-label">Status</div>
            {deliveryEntryMode === "single" ? (
              <>
                <label className="toggle-label">
                  <input checked={deliveryDraft.manufacturerInvoiceReceived} type="checkbox" onChange={(event) => setDeliveryDraft({ ...deliveryDraft, manufacturerInvoiceReceived: event.target.checked })} />
                  Vendor invoice received
                </label>
                <label className="toggle-label">
                  <input checked={deliveryDraft.goodsReceived} type="checkbox" onChange={(event) => setDeliveryDraft({ ...deliveryDraft, goodsReceived: event.target.checked })} />
                  Goods received
                </label>
                <label className="toggle-label">
                  <input checked={!!deliveryDraft.customsCleared} type="checkbox" onChange={(event) => setDeliveryDraft({ ...deliveryDraft, customsCleared: event.target.checked })} />
                  Customs cleared
                </label>
                <label className="toggle-label">
                  <input checked={!!deliveryDraft.arrivedPueblo} type="checkbox" onChange={(event) => setDeliveryDraft({ ...deliveryDraft, arrivedPueblo: event.target.checked })} />
                  Arrived Pueblo
                </label>
              </>
            ) : null}
            {deliveryEntryMode === "bulk" ? (
              <div className="bulk-batch-editor">
                <div className="bulk-batch-header">
                  <strong>Batch deliveries</strong>
                  <button
                    className="secondary-action"
                    onClick={() => setBulkDeliveryBatches((current) => [...current, createBulkDeliveryBatch(current.length, deliveryDraft)])}
                  >
                    Add batch row
                  </button>
                </div>
                <div className="bulk-batch-table">
                  <div className={`${bulkBatchRowClassName} bulk-batch-head`}>
                    <span>Batch</span>
                    <span>Tower qty</span>
                    <span>Delivery way</span>
                    {!deliveryDraftUsesSupplierEta ? <span>Forwarder</span> : null}
                    <span>{deliveryDraftUsesSupplierEta ? "Supplier ETA week" : "Pickup week"}</span>
                    <span>Actual ETA week</span>
                    <span>Production need week</span>
                    <span>Actual receive date</span>
                    <span>Actual receive week</span>
                    {!deliveryDraftUsesSupplierEta ? (
                      <>
                        <span>Freight fee</span>
                        <span>Freight invoice #</span>
                      </>
                    ) : null}
                    {!deliveryDraftIsDdp ? (
                      <>
                        <span>Tariff</span>
                        <span>Tariff invoice #</span>
                      </>
                    ) : null}
                    {!deliveryDraftUsesSupplierEta ? <span>Freight invoice</span> : null}
                    {!deliveryDraftIsDdp ? <span>Tariff invoice</span> : null}
                    <span>Vendor invoice</span>
                    <span>Goods</span>
                    <span>Actions</span>
                  </div>
                  {bulkDeliveryBatches.map((batch) => (
                    <div className={bulkBatchRowClassName} key={batch.id}>
                      <input value={batch.batch} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, batch: event.target.value } : item)))} />
                      <input type="number" value={batch.qty} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, qty: Number(event.target.value) } : item)))} />
                      <select value={batch.deliveryWay} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, deliveryWay: event.target.value } : item)))}>
                        <option>Air</option>
                        <option>Sea</option>
                        <option>Truck</option>
                        <option>Rail</option>
                      </select>
                      {!deliveryDraftUsesSupplierEta ? <input value={batch.forwarder} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, forwarder: event.target.value } : item)))} /> : null}
                      <input type="date" value={formatInputMidweekDate(batch.supplierSchedule)} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, supplierSchedule: dateInputToMidweekDate(event.target.value, item.supplierSchedule) } : item)))} />
                      <input type="date" value={formatInputMidweekDate(batch.actualEta)} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, actualEta: dateInputToMidweekDate(event.target.value) || null } : item)))} />
                      <input type="date" value={formatInputMidweekDate(batch.productionNeed)} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, productionNeed: dateInputToMidweekDate(event.target.value, item.productionNeed) } : item)))} />
                      <input type="date" value={batch.actualArrival ?? ""} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, actualArrival: event.target.value || null } : item)))} />
                      <span className="bulk-batch-week">{batch.actualArrival ? formatScheduleWeek(batch.actualArrival) : "-"}</span>
                      {!deliveryDraftUsesSupplierEta ? (
                        <>
                          <input type="number" value={batch.freightFee} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, freightFee: Number(event.target.value) } : item)))} />
                          <input value={batch.freightInvoiceNumber} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, freightInvoiceNumber: event.target.value } : item)))} />
                        </>
                      ) : null}
                      {!deliveryDraftIsDdp ? (
                        <>
                          <input type="number" value={batch.tariff} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, tariff: Number(event.target.value) } : item)))} />
                          <input value={batch.tariffInvoiceNumber} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, tariffInvoiceNumber: event.target.value } : item)))} />
                        </>
                      ) : null}
                      {!deliveryDraftUsesSupplierEta ? (
                        <label className="mini-toggle">
                          <input checked={batch.freightFeeReceived} type="checkbox" onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, freightFeeReceived: event.target.checked } : item)))} />
                        </label>
                      ) : null}
                      {!deliveryDraftIsDdp ? (
                        <label className="mini-toggle">
                          <input checked={batch.tariffInvoiceReceived} type="checkbox" onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, tariffInvoiceReceived: event.target.checked } : item)))} />
                        </label>
                      ) : null}
                      <label className="mini-toggle">
                        <input checked={batch.manufacturerInvoiceReceived} type="checkbox" onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, manufacturerInvoiceReceived: event.target.checked } : item)))} />
                      </label>
                      <label className="mini-toggle">
                        <input checked={batch.goodsReceived} type="checkbox" onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, goodsReceived: event.target.checked, arrivedPueblo: event.target.checked ? true : item.arrivedPueblo } : item)))} />
                      </label>
                      <span className="row-actions">
                        <button
                          disabled={bulkDeliveryBatches.length <= 1}
                          onClick={() => setBulkDeliveryBatches((current) => current.filter((item) => item.id !== batch.id))}
                        >
                          Delete
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="form-actions">
              <button className="secondary-action" onClick={() => setShowDeliveryForm(false)}>Cancel</button>
              <button className="primary-action" onClick={deliveryEntryMode === "bulk" ? saveBulkDeliveries : saveDelivery}>{deliveryEntryMode === "bulk" ? "Save PO batches" : editingDeliveryId ? "Save changes" : "Save delivery"}</button>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
