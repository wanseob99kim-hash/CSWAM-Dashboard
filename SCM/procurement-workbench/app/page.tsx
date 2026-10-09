"use client";

import { ProjectSidebar } from "@/components/workbench/project-sidebar";
import { WorkbenchHeader } from "@/components/workbench/workbench-header";
import { SyncNotices } from "@/components/workbench/sync-status";
import { ProjectEditor } from "@/components/workbench/project-editor";
import { DeliveryEditor } from "@/components/workbench/delivery-editor";
import { DeliveryPortfolio } from "@/components/workbench/delivery-portfolio";
import { SupplierSchedule } from "@/components/workbench/supplier-schedule";
import { OverviewPanel } from "@/components/workbench/overview-panel";
import { McipPanel } from "@/components/workbench/mcip-panel";
import { CashflowPanel } from "@/components/workbench/cashflow-panel";
import { LogisticsPanel } from "@/components/workbench/logistics-panel";
import { BomPanel } from "@/components/workbench/bom-panel";
import { NcrPanel } from "@/components/workbench/ncr-panel";
import { EcnPanel } from "@/components/workbench/ecn-panel";
import { DeliverySchedule } from "@/components/workbench/delivery-schedule";
import { useWorkbench } from "@/hooks/useWorkbench";

export default function Home() {
  const wb = useWorkbench();

  return (
    <main className="im-shell">
      <ProjectSidebar wb={wb} />
      <section className="im-workspace">
        <WorkbenchHeader wb={wb} />
        <SyncNotices wb={wb} />
        <ProjectEditor wb={wb} />
        <DeliveryEditor wb={wb} />
        <DeliveryPortfolio wb={wb} />
        <SupplierSchedule wb={wb} />
        <OverviewPanel wb={wb} />
        <McipPanel wb={wb} />
        <CashflowPanel wb={wb} />
        <LogisticsPanel wb={wb} />
        <BomPanel wb={wb} />
        <NcrPanel wb={wb} />
        <EcnPanel wb={wb} />
        <DeliverySchedule wb={wb} />
      </section>
    </main>
  );
}
