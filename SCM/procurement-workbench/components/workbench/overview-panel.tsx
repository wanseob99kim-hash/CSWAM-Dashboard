import { clampPercent, formatMoney, formatPercent, getStatusTone } from "@/lib/format";
import { todoModes, todoPriorities } from "@/lib/seed-data";
import type { Workbench } from "@/hooks/useWorkbench";

type OverviewPanelProps = {
  wb: Workbench;
};

export function OverviewPanel({ wb }: OverviewPanelProps) {
  const { activeWorkspace, todoDraft, setTodoDraft, activeProject, projectRows, projectTowerQty, projectSupplierNcrs, projectInternalNcrs, projectTodoItems, openTodoCount, activeProjectStatus, projectEcnRecords, riskRows, arrivedCount, projectTotalCost, forecastBudgetRemaining, projectBudgetUsedPercent, projectBudgetRemainingPercent, projectBudgetUsedDisplay, deliveryCompletePercent, deliveryRiskPercent, openDeliveryCount, costMixItems, costMixTotal, costMixStops, openBatchCount, addTodoItem, toggleTodoItem, deleteTodoItem } = wb;

  return (
    <section className="overview-panel" hidden={activeWorkspace !== "overview"}>
      <div className="overview-kpi-strip" aria-label="Project control summary">
        <article>
          <span>Production window</span>
          <strong>{activeProject.productionWindow}</strong>
          <small>Production plan baseline</small>
        </article>
        <article>
          <span>Total deliveries</span>
          <strong>{projectRows.length}</strong>
          <small>{arrivedCount} received / {riskRows.length} risk deliveries</small>
        </article>
        <article>
          <span>NCR control</span>
          <strong>{projectSupplierNcrs.length + projectInternalNcrs.length}</strong>
          <small>{projectInternalNcrs.filter((item) => !item.goodsReceived).length} open internal items</small>
        </article>
        <article>
          <span>ECN control</span>
          <strong>{projectEcnRecords.length}</strong>
          <small>{projectEcnRecords.filter((item) => !["Implemented", "Closed"].includes(item.status)).length} open changes</small>
        </article>
        <article>
          <span>To do</span>
          <strong>{openTodoCount}</strong>
          <small>{projectTodoItems.length - openTodoCount} completed</small>
        </article>
      </div>
      <div className="overview-grid">
        <article className="overview-card todo-card">
          <div className="section-title compact-title">
            <h2>To Do List</h2>
          </div>
          <div className="todo-form">
            <input
              aria-label="Todo item"
              placeholder="Add follow-up item"
              value={todoDraft.title}
              onChange={(event) => setTodoDraft({ ...todoDraft, title: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") addTodoItem();
              }}
            />
            <input
              aria-label="Todo owner"
              placeholder="Owner"
              value={todoDraft.owner}
              onChange={(event) => setTodoDraft({ ...todoDraft, owner: event.target.value })}
            />
            <select aria-label="Todo mode" value={todoDraft.mode} onChange={(event) => setTodoDraft({ ...todoDraft, mode: event.target.value })}>
              {todoModes.map((mode) => (
                <option key={mode}>{mode}</option>
              ))}
            </select>
            <select aria-label="Todo priority" value={todoDraft.priority} onChange={(event) => setTodoDraft({ ...todoDraft, priority: event.target.value })}>
              {todoPriorities.map((priority) => (
                <option key={priority}>{priority}</option>
              ))}
            </select>
            <input aria-label="Todo due week" type="week" value={todoDraft.dueWeek} onChange={(event) => setTodoDraft({ ...todoDraft, dueWeek: event.target.value })} />
            <button className="primary-action" onClick={addTodoItem}>Add</button>
          </div>
          <div className="todo-list">
            {projectTodoItems.length ? (
              projectTodoItems.map((item) => (
                <div className={item.done ? "todo-row done" : "todo-row"} key={item.id}>
                  <button className="todo-check" aria-label={item.done ? "Mark as open" : "Mark as done"} onClick={() => toggleTodoItem(item.id)}>
                    {item.done ? "OK" : ""}
                  </button>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.owner || "No owner"} | {item.mode || "General"} | {item.dueWeek || "No due week"}</small>
                  </span>
                  <i className={`todo-priority ${String(item.priority || "Normal").toLowerCase()}`}>{item.priority || "Normal"}</i>
                  <button className="todo-delete" aria-label="Delete todo" onClick={() => deleteTodoItem(item.id)}>Delete</button>
                </div>
              ))
            ) : (
              <div className="empty-state todo-empty">No project tasks yet.</div>
            )}
          </div>
        </article>
        <article className="overview-card project-detail-card">
          <div className="section-title compact-title">
            <h2>Project Snapshot</h2>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Running status</dt>
              <dd><i className={`status-chip ${getStatusTone(activeProjectStatus)}`}>{activeProjectStatus}</i></dd>
            </div>
            <div>
              <dt>Tower quantity</dt>
              <dd>{projectTowerQty.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Open invoice batches</dt>
              <dd>{openBatchCount}</dd>
            </div>
          </dl>
        </article>

        <article className="overview-card budget-detail-card">
          <div className="section-title compact-title">
            <h2>Budget Detail</h2>
          </div>
          <div className="budget-visual">
            <div className="budget-ring" style={{ background: `conic-gradient(var(--green) 0 ${projectBudgetUsedDisplay}%, #e9f1ee ${projectBudgetUsedDisplay}% 100%)` }}>
              <span>{formatPercent(projectBudgetUsedPercent)}</span>
              <small>used</small>
            </div>
            <div className="budget-meter">
              <span style={{ width: `${projectBudgetUsedDisplay}%` }} />
            </div>
          </div>
          <dl className="detail-list two-column">
            <div>
              <dt>Total budget</dt>
              <dd>{formatMoney(activeProject.budget)}</dd>
            </div>
            <div>
              <dt>Total cost</dt>
              <dd>{formatMoney(projectTotalCost)}</dd>
            </div>
            <div>
              <dt>Remaining budget</dt>
              <dd className={forecastBudgetRemaining >= 0 ? "budget-good" : "budget-risk"}>{formatMoney(forecastBudgetRemaining)}</dd>
            </div>
            <div>
              <dt>Used / Remaining</dt>
              <dd>{formatPercent(projectBudgetUsedPercent)} / {formatPercent(projectBudgetRemainingPercent)}</dd>
            </div>
          </dl>
        </article>

        <article className="overview-card delivery-health-card">
          <div className="section-title compact-title">
            <h2>Delivery Health</h2>
          </div>
          <div className="health-visual">
            <div className="health-ring" style={{ background: `conic-gradient(var(--green) 0 ${clampPercent(deliveryCompletePercent)}%, var(--red) ${clampPercent(deliveryCompletePercent)}% ${clampPercent(deliveryCompletePercent + deliveryRiskPercent)}%, #e9f1ee ${clampPercent(deliveryCompletePercent + deliveryRiskPercent)}% 100%)` }}>
              <span>{formatPercent(deliveryCompletePercent)}</span>
              <small>received</small>
            </div>
            <div className="health-bars">
              {[
                { label: "Received", value: arrivedCount, percent: deliveryCompletePercent, tone: "done" },
                { label: "Open", value: openDeliveryCount, percent: projectRows.length ? openDeliveryCount / projectRows.length : 0, tone: "open" },
                { label: "Risk", value: riskRows.length, percent: deliveryRiskPercent, tone: "risk" },
              ].map((item) => (
                <div className="health-line" key={item.label}>
                  <span><strong>{item.label}</strong><small>{item.value} batches</small></span>
                  <i className={`health-track ${item.tone}`}><b style={{ width: `${clampPercent(item.percent)}%` }} /></i>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="overview-card cost-summary-card">
          <div className="section-title compact-title">
            <h2>Cost Summary</h2>
          </div>
          <div className="cost-visual">
            <div className="cost-ring" style={{ background: `conic-gradient(${costMixStops.join(", ") || "#e9f1ee 0 100%"})` }}>
              <span>{formatMoney(projectTotalCost)}</span>
              <small>total cost</small>
            </div>
            <div className="cost-stack">
              {costMixItems.map((item) => (
                <div className="cost-line" key={item.label}>
                  <span>
                    <i className={`cost-dot ${item.tone}`} />
                    {item.label}
                  </span>
                  <strong>{formatMoney(item.value)}</strong>
                  <em>{formatPercent(item.value / costMixTotal)}</em>
                </div>
              ))}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
