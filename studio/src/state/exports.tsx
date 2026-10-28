import { createContext, useContext, useState, type ReactNode } from "react";
import { useStartExport } from "../api/exports";
import type { FormatInfo } from "../api/types";
import { useOutputControls, type OutputControls } from "../components/OutputControls";
import { useRenders } from "./renders";

export interface ExportValue {
  output: OutputControls;
  deliveryProfile: "custom" | "reels_shorts";
  setDeliveryProfile: (profile: "custom" | "reels_shorts") => void;
  /** Starts an export of the saved composition; the monitor follows it. */
  start: (composition: string) => void;
  pending: boolean;
  error: Error | null;
  /** The export started from this tab most recently. */
  lastExportId: string | null;
}

const ExportContext = createContext<ExportValue | null>(null);

export function useExportSettings(): ExportValue {
  const value = useContext(ExportContext);
  if (!value) throw new Error("useExportSettings needs an ExportProvider");
  return value;
}

interface Props {
  pid: string;
  formats: Record<string, FormatInfo>;
  children: ReactNode;
}

/** Export output settings (shown in the Inspector) and starting exports (from the Timeline). */
export function ExportProvider({ pid, formats, children }: Props) {
  const startExport = useStartExport(pid);
  const output = useOutputControls(pid, "export", formats);
  const { show } = useRenders();
  const [lastExportId, setLastExportId] = useState<string | null>(null);
  const [deliveryProfile, setDeliveryProfile] = useState<"custom" | "reels_shorts">("custom");

  function chooseDeliveryProfile(profile: "custom" | "reels_shorts") {
    setDeliveryProfile(profile);
    if (profile === "reels_shorts") {
      output.setFormat("portrait");
      output.update({ resolution: "1080p", fps: 30 });
    }
  }

  function start(composition: string) {
    const { format, choice } = output;
    if (!choice) return;
    startExport.mutate(
      { composition, format, ...choice, delivery_profile: deliveryProfile },
      {
        onSuccess: ({ export_id }) => {
          setLastExportId(export_id);
          show({ kind: "export", id: export_id });
        },
      },
    );
  }

  const value = {
    output, deliveryProfile, setDeliveryProfile: chooseDeliveryProfile, start,
    pending: startExport.isPending, error: startExport.error, lastExportId,
  };
  return <ExportContext.Provider value={value}>{children}</ExportContext.Provider>;
}
