"use client";

import { createContext, useContext } from "react";
import { academyChartConfig, academyChartsEnabled } from "@/lib/academy-charts";
import type { PortalAccessModel } from "@/lib/portal-features";
import {
  resolvePortalFeatures,
  type PortalFeatureKey,
} from "@/lib/portal-features";

type PortalFeaturesContextValue = {
  features: Record<PortalFeatureKey, boolean>;
  accessModel: PortalAccessModel;
  showLiveChart: boolean;
};

const PortalFeaturesContext = createContext<PortalFeaturesContextValue>({
  features: resolvePortalFeatures({}, "verification"),
  accessModel: "verification",
  showLiveChart: false,
});

export function PortalFeaturesProvider({
  stored,
  accessModel,
  portalSlug,
  children,
}: {
  stored: Record<string, boolean> | null | undefined;
  accessModel: PortalAccessModel;
  portalSlug?: string | null;
  children: React.ReactNode;
}) {
  return (
    <PortalFeaturesContext.Provider
      value={{
        features: resolvePortalFeatures(stored, accessModel),
        accessModel,
        showLiveChart:
          academyChartsEnabled(stored) && Boolean(academyChartConfig(portalSlug)),
      }}
    >
      {children}
    </PortalFeaturesContext.Provider>
  );
}

export function usePortalFeatures() {
  return useContext(PortalFeaturesContext);
}
