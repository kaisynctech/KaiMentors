"use client";

import { createContext, useContext } from "react";
import type { PortalAccessModel } from "@/lib/portal-features";
import {
  resolvePortalFeatures,
  type PortalFeatureKey,
} from "@/lib/portal-features";

type PortalFeaturesContextValue = {
  features: Record<PortalFeatureKey, boolean>;
  accessModel: PortalAccessModel;
};

const PortalFeaturesContext = createContext<PortalFeaturesContextValue>({
  features: resolvePortalFeatures({}, "verification"),
  accessModel: "verification",
});

export function PortalFeaturesProvider({
  stored,
  accessModel,
  children,
}: {
  stored: Record<string, boolean> | null | undefined;
  accessModel: PortalAccessModel;
  children: React.ReactNode;
}) {
  return (
    <PortalFeaturesContext.Provider
      value={{
        features: resolvePortalFeatures(stored, accessModel),
        accessModel,
      }}
    >
      {children}
    </PortalFeaturesContext.Provider>
  );
}

export function usePortalFeatures() {
  return useContext(PortalFeaturesContext);
}
