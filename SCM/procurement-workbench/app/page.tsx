"use client";

import { AppNav } from "@/components/workbench/app-nav";
import { BomPanel } from "@/components/workbench/bom-panel";
import { CashflowPanel } from "@/components/workbench/cashflow-panel";
import { DeliveryEditor } from "@/components/workbench/delivery-editor";
import { DeliveryPortfolio } from "@/components/workbench/delivery-portfolio";
import { DeliverySchedule } from "@/components/workbench/delivery-schedule";
import { EcnPanel } from "@/components/workbench/ecn-panel";
import { LogisticsPanel } from "@/components/workbench/logistics-panel";
import { MaterialPlanPanel } from "@/components/workbench/material-plan-panel";
import { McipPanel } from "@/components/workbench/mcip-panel";
import { NcrPanel } from "@/components/workbench/ncr-panel";
import { OverviewPanel } from "@/components/workbench/overview-panel";
import { ProjectEditor } from "@/components/workbench/project-editor";
import { ProjectPicker } from "@/components/workbench/project-picker";
import { SupplierSchedule } from "@/components/workbench/supplier-schedule";
import { SyncNotices } from "@/components/workbench/sync-status";
import { ThisWeekPanel } from "@/components/workbench/this-week-panel";
import { TopBar } from "@/components/workbench/top-bar";
import { WorkbenchHeader } from "@/components/workbench/workbench-header";
import { useWorkbench } from "@/hooks/useWorkbench";

export default function Home() {
  const wb = useWorkbench();
  // One-project parts of a section stay hidden while "All projects" is selected.
  const allProjects = wb.projectScope === "all";

  return (
    <div className="app-shell">
      <AppNav wb={wb} />
      <div className="app-main">
        <TopBar wb={wb} />
        <main className="app-content">
          <WorkbenchHeader wb={wb} />
          <SyncNotices wb={wb} />
          <ProjectEditor wb={wb} />
          <ProjectPicker wb={wb} />
          <ThisWeekPanel wb={wb} />
          <MaterialPlanPanel wb={wb} />
          <div className="scope-gate" hidden={allProjects}>
            <DeliveryEditor wb={wb} />
          </div>
          <DeliveryPortfolio wb={wb} />
          <div className="scope-gate" hidden={allProjects}>
            <SupplierSchedule wb={wb} />
            <OverviewPanel wb={wb} />
            <BomPanel wb={wb} />
          </div>
          <McipPanel wb={wb} />
          <CashflowPanel wb={wb} />
          <LogisticsPanel wb={wb} />
          <NcrPanel wb={wb} />
          <EcnPanel wb={wb} />
          <div className="scope-gate" hidden={allProjects}>
            <DeliverySchedule wb={wb} />
          </div>
        </main>
      </div>
    </div>
  );
}
