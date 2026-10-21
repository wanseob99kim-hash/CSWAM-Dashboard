import { useEffect, useState } from "react";
import { readPipelineFile, type PipelineFile } from "@/lib/pipeline/parse";
import { readWinsysExtract, type WinsysExtract } from "@/lib/winsys/extract";
import { decodeText, loadLatestWorkspaceFile, type Loaded } from "@/lib/workspace-files";

/**
 * Data extracts several sections share: the WINSYS extract (PO values,
 * invoices, receipts, SAP BOMs) and the Sales Pipeline budgets. Loaded once the
 * workspace is ready.
 */
export function useSharedExtracts(enabled: boolean) {
  const [winsys, setWinsys] = useState<Loaded<WinsysExtract>>({ kind: "idle" });
  const [pipeline, setPipeline] = useState<Loaded<PipelineFile>>({ kind: "idle" });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWinsys({ kind: "loading" });
    setPipeline({ kind: "loading" });
    void loadLatestWorkspaceFile("winsys", (data) => readWinsysExtract(decodeText(data))).then((next) => active && setWinsys(next));
    void loadLatestWorkspaceFile("pipeline", (data) => readPipelineFile(decodeText(data))).then((next) => active && setPipeline(next));
    return () => {
      active = false;
    };
  }, [enabled]);

  return { winsys, pipeline };
}

export type SharedExtracts = ReturnType<typeof useSharedExtracts>;
