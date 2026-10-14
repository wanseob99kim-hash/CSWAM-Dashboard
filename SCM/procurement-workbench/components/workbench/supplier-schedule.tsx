import { FileAttachments } from "@/components/workbench/file-attachments";
import { dateInputToMidweekDate, formatInputMidweekDate, formatScheduleWeek } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { getMaterialAllocationQty } from "@/lib/supplier-plan";
import type { SupplierBatchStatus } from "@/lib/types";
import type { Workbench } from "@/hooks/useWorkbench";

type SupplierScheduleProps = {
  wb: Workbench;
};

export function SupplierSchedule({ wb }: SupplierScheduleProps) {
  const { setSupplierPoFilter, activeWorkspace, supplierPoOptions, activeSupplierPo, supplierPoLines, supplierPlan, supplierEmailText, pickupReminderText, forwarderNoticeText, supplierPlanApprovedCount, supplierPlanDocsReadyCount, supplierSplitTotal, supplierPoLineTotalQty, supplierPoLineTotalAmount, updateSupplierPlan, updateSupplierBatch, updateSupplierMaterialAllocation, resetSupplierMaterialAllocations, exportSupplierMaterialAllocations, applyCswindSupplierTemplate, addSupplierBatch, deleteSupplierBatch, syncSupplierPlanFromDelivery, copyText, importPoDetailFile, openSupplierMailDraft } = wb;

  return (
    <>
      <section className="zone-title supplier-zone-title" aria-label="Supplier schedule section" hidden={activeWorkspace !== "supplier"}>
        <h2>Supplier Schedule</h2>
      </section>
      <section className="supplier-panel" hidden={activeWorkspace !== "supplier"}>
        <div className="panel-header">
          <div>
            <h2>PO split and supplier request</h2>
            <p>Prepare vendor schedule emails, approve supplier requests, then track PL / CI and forwarder pickup.</p>
          </div>
          <div className="filters smart-filters">
            <select aria-label="Supplier PO" value={activeSupplierPo} onChange={(event) => setSupplierPoFilter(event.target.value)}>
              {supplierPoOptions.length ? supplierPoOptions.map((po) => (
                <option key={po} value={po}>PO {po}</option>
              )) : <option value="">No PO available</option>}
            </select>
            <label className="secondary-action file-action">
              Import PO Detail
              <input accept=".xlsx,.xls" aria-label="Import PO Detail" onChange={importPoDetailFile} type="file" />
            </label>
            <button className="secondary-action" disabled={!activeSupplierPo} onClick={syncSupplierPlanFromDelivery}>Sync from delivery</button>
          </div>
        </div>

        {activeSupplierPo ? (
          <>
            <div className="supplier-kpis">
              <article><span>PO</span><strong>{supplierPlan.po}</strong><small>{supplierPlan.manufacturer || "Manufacturer TBD"}</small></article>
              <article><span>Batch split</span><strong>{supplierPlan.batches.length}</strong><small>{supplierPlanApprovedCount} approved / {supplierSplitTotal.toFixed(1)}%</small></article>
              <article><span>PO material</span><strong>{supplierPoLines.length}</strong><small>{supplierPoLineTotalQty.toLocaleString()} qty</small></article>
              <article><span>PO amount</span><strong>{formatMoney(supplierPoLineTotalAmount)}</strong><small>{supplierPoLines[0]?.currency || "USD"}</small></article>
              <article><span>Documents</span><strong>{supplierPlanDocsReadyCount}/{supplierPlan.batches.length}</strong><small>PL / CI ready</small></article>
            </div>

            <div className="supplier-grid">
              <section className="supplier-card supplier-email-card">
                <div className="section-title compact-title">
                  <h2>Email template</h2>
                  <button className="secondary-action" onClick={applyCswindSupplierTemplate}>Use CSWind template</button>
                </div>
                <div className="supplier-email-form">
                  <label>
                    To
                    <input value={supplierPlan.to} onChange={(event) => updateSupplierPlan((plan) => ({ ...plan, to: event.target.value }))} />
                  </label>
                  <label>
                    CC
                    <input value={supplierPlan.cc} onChange={(event) => updateSupplierPlan((plan) => ({ ...plan, cc: event.target.value }))} />
                  </label>
                  <label className="wide-field">
                    Subject
                    <input value={supplierPlan.subject} onChange={(event) => updateSupplierPlan((plan) => ({ ...plan, subject: event.target.value }))} />
                  </label>
                  <label className="wide-field">
                    Template body
                    <textarea value={supplierPlan.body} onChange={(event) => updateSupplierPlan((plan) => ({ ...plan, body: event.target.value }))} />
                  </label>
                  <div className="wide-field">
                    <FileAttachments
                      label="Attachments"
                      owner={{ projectId: supplierPlan.projectId, ownerType: "supplier_plan", ownerId: supplierPlan.id, kind: "attachment" }}
                      names={supplierPlan.attachments}
                      onNamesChange={(attachments) => updateSupplierPlan((plan) => ({ ...plan, attachments }))}
                      emptyText="No files yet. Uploaded files are shared with the team; attach them to the email from your mail client."
                    />
                  </div>
                </div>
                <div className="supplier-email-preview">
                  <div className="email-preview-head">
                    <span>Generated email</span>
                    <strong>{supplierPlan.subject}</strong>
                  </div>
                  <pre>{supplierEmailText}</pre>
                </div>
                <div className="form-actions">
                  <button className="secondary-action" onClick={() => copyText(supplierEmailText)}>Copy email</button>
                  <button className="secondary-action" onClick={() => updateSupplierPlan((plan) => ({ ...plan, requestSent: true, batches: plan.batches.map((batch) => ({ ...batch, status: batch.status === "Draft" ? "Request sent" : batch.status })) }))}>Mark sent</button>
                  <button className="primary-action" onClick={openSupplierMailDraft}>Open mail draft</button>
                </div>
              </section>

              <section className="supplier-card supplier-batch-card">
                <div className="section-title compact-title">
                  <h2>Batch schedule approval</h2>
                  <button className="secondary-action" onClick={addSupplierBatch}>Add batch</button>
                </div>
                <div className="supplier-batch-list">
                  <div className="supplier-batch-row supplier-batch-head">
                    <span>Batch</span>
                    <span>Qty / %</span>
                    <span>PU week</span>
                    <span>Need week</span>
                    <span>Supplier request</span>
                    <span>Status</span>
                    <span>Note</span>
                    <span></span>
                  </div>
                  {supplierPlan.batches.map((batch) => (
                    <div className="supplier-batch-row" key={batch.id}>
                      <span>
                        <strong>{batch.batch}</strong>
                        <small>{supplierPlan.category}</small>
                      </span>
                      <span className="split-inputs">
                        <input type="number" value={batch.qty} onChange={(event) => updateSupplierBatch(batch.id, { qty: Number(event.target.value) })} />
                        <input type="number" value={batch.percentage} onChange={(event) => updateSupplierBatch(batch.id, { percentage: Number(event.target.value) })} />
                      </span>
                      <input type="date" value={formatInputMidweekDate(batch.puWeek)} onChange={(event) => updateSupplierBatch(batch.id, { puWeek: dateInputToMidweekDate(event.target.value, batch.puWeek) })} />
                      <input type="date" value={formatInputMidweekDate(batch.needWeek)} onChange={(event) => updateSupplierBatch(batch.id, { needWeek: dateInputToMidweekDate(event.target.value, batch.needWeek) })} />
                      <input type="date" value={formatInputMidweekDate(batch.supplierRequestWeek)} onChange={(event) => updateSupplierBatch(batch.id, { supplierRequestWeek: dateInputToMidweekDate(event.target.value) })} />
                      <span className="supplier-status-stack">
                        <select value={batch.status} onChange={(event) => updateSupplierBatch(batch.id, { status: event.target.value as SupplierBatchStatus })}>
                          <option>Draft</option>
                          <option>Request sent</option>
                          <option>Supplier requested</option>
                          <option>Approved</option>
                          <option>Rejected</option>
                        </select>
                        <button onClick={() => updateSupplierBatch(batch.id, { status: "Approved", puWeek: batch.supplierRequestWeek || batch.puWeek })}>Approve</button>
                      </span>
                      <input value={batch.note} onChange={(event) => updateSupplierBatch(batch.id, { note: event.target.value })} />
                      <button className="tiny-action" disabled={supplierPlan.batches.length <= 1} onClick={() => deleteSupplierBatch(batch.id)}>Delete</button>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="supplier-card supplier-material-card">
              <div className="section-title compact-title">
                <div>
                  <h2>PO material batch allocation</h2>
                  <small>{supplierPoLines.length ? "Edit each batch quantity. Use 0 when a material is not included in that batch." : "Import PO Detail to allocate material quantities by batch."}</small>
                </div>
                <div className="material-allocation-actions">
                  <button className="secondary-action" disabled={!supplierPoLines.length} onClick={resetSupplierMaterialAllocations}>Apply split %</button>
                  <button className="primary-action" disabled={!supplierPoLines.length} onClick={exportSupplierMaterialAllocations}>Export Excel</button>
                </div>
              </div>
              {supplierPoLines.length ? (
                <div className="supplier-material-scroll">
                  <table className="supplier-material-table">
                    <thead>
                      <tr>
                        <th>Line</th>
                        <th>Material</th>
                        <th>Manufacturer</th>
                        <th>PO Qty</th>
                        <th>Unit price</th>
                        <th>Amount</th>
                        {supplierPlan.batches.map((batch) => (
                          <th key={`head-${batch.id}`}>{batch.batch} {Number(batch.percentage || 0).toFixed(1)}%</th>
                        ))}
                        <th>Allocated</th>
                        <th>Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierPoLines.map((line) => {
                        const allocatedQty = supplierPlan.batches.reduce((sum, batch) => sum + getMaterialAllocationQty(supplierPlan, line, batch), 0);
                        const remainingQty = Math.round((line.poQty - allocatedQty) * 100) / 100;
                        return (
                          <tr key={line.id}>
                            <td>{line.lineNo}</td>
                            <td>
                              <strong>{line.material}</strong>
                              <small>{line.materialCode} / {line.category}</small>
                            </td>
                            <td>{line.manufacturer}</td>
                            <td>{line.poQty.toLocaleString()} {line.unit}</td>
                            <td>{formatMoney(line.unitPrice)}</td>
                            <td>{formatMoney(line.amount)}</td>
                            {supplierPlan.batches.map((batch) => (
                              <td key={`${line.id}-${batch.id}`}>
                                <input
                                  aria-label={`${line.material} ${batch.batch} quantity`}
                                  min="0"
                                  step="0.01"
                                  type="number"
                                  value={getMaterialAllocationQty(supplierPlan, line, batch)}
                                  onChange={(event) => updateSupplierMaterialAllocation(line.id, batch.id, Number(event.target.value))}
                                />
                                <small>{line.unit}</small>
                              </td>
                            ))}
                            <td>
                              <strong>{allocatedQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                              <small>{line.unit}</small>
                            </td>
                            <td className={Math.abs(remainingQty) > 0.01 ? "allocation-warning" : "allocation-ok"}>
                              <strong>{remainingQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                              <small>{line.unit}</small>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">Upload the PO Detail List to preview each material line, assign it into batches, and export the final batch material list.</div>
              )}
            </section>

            <div className="supplier-grid lower">
              <section className="supplier-card">
                <div className="section-title compact-title">
                  <h2>Pickup reminder and supplier documents</h2>
                </div>
                <div className="supplier-doc-table">
                  {supplierPlan.batches.map((batch) => (
                    <div className="supplier-doc-row" key={`doc-${batch.id}`}>
                      <span>
                        <strong>{batch.batch}</strong>
                        <small>PU week {formatScheduleWeek(batch.puWeek)}</small>
                      </span>
                      <FileAttachments
                        label="Commercial invoice"
                        owner={{ projectId: supplierPlan.projectId, ownerType: "supplier_plan_batch", ownerId: batch.id, kind: "commercial_invoice" }}
                        names={batch.commercialInvoiceFiles}
                        onNamesChange={(commercialInvoiceFiles) => updateSupplierBatch(batch.id, { commercialInvoiceFiles })}
                        emptyText="Pending"
                      />
                      <FileAttachments
                        label="Packing list"
                        owner={{ projectId: supplierPlan.projectId, ownerType: "supplier_plan_batch", ownerId: batch.id, kind: "packing_list" }}
                        names={batch.packingListFiles}
                        onNamesChange={(packingListFiles) => updateSupplierBatch(batch.id, { packingListFiles })}
                        emptyText="Pending"
                      />
                    </div>
                  ))}
                </div>
                <div className="supplier-email-preview compact">
                  <strong>Pickup reminder draft</strong>
                  <textarea readOnly value={pickupReminderText} />
                </div>
                <div className="form-actions">
                  <button className="secondary-action" onClick={() => copyText(pickupReminderText)}>Copy reminder</button>
                  <button className="secondary-action" onClick={() => updateSupplierPlan((plan) => ({ ...plan, pickupReminderSent: true }))}>Mark reminder sent</button>
                </div>
              </section>

              <section className="supplier-card">
                <div className="section-title compact-title">
                  <h2>Forwarder handoff</h2>
                </div>
                <label className="supplier-forwarder-email">
                  Forwarder email
                  <input value={supplierPlan.forwarderEmail} onChange={(event) => updateSupplierPlan((plan) => ({ ...plan, forwarderEmail: event.target.value }))} />
                </label>
                <div className="supplier-forwarder-table">
                  {supplierPlan.batches.map((batch) => (
                    <div className="supplier-forwarder-row" key={`forwarder-${batch.id}`}>
                      <span>
                        <strong>{batch.batch}</strong>
                        <small>{[...batch.commercialInvoiceFiles, ...batch.packingListFiles].join(" / ") || "Documents pending"}</small>
                      </span>
                      <label>
                        B/L number
                        <input value={batch.blNumber} onChange={(event) => updateSupplierBatch(batch.id, { blNumber: event.target.value })} />
                      </label>
                      <label>
                        ETA
                        <input type="date" value={formatInputMidweekDate(batch.forwarderEta)} onChange={(event) => updateSupplierBatch(batch.id, { forwarderEta: dateInputToMidweekDate(event.target.value) })} />
                      </label>
                    </div>
                  ))}
                </div>
                <div className="supplier-email-preview compact">
                  <strong>Forwarder notice draft</strong>
                  <textarea readOnly value={forwarderNoticeText} />
                </div>
                <div className="form-actions">
                  <button className="secondary-action" onClick={() => copyText(forwarderNoticeText)}>Copy forwarder notice</button>
                  <button className="secondary-action" onClick={() => updateSupplierPlan((plan) => ({ ...plan, forwarderNoticeSent: true }))}>Mark notice sent</button>
                </div>
              </section>
            </div>
          </>
        ) : (
          <div className="empty-state">Add delivery records with PO numbers first, then use this workflow to split PO batches and prepare supplier schedule requests.</div>
        )}
      </section>
    </>
  );
}
