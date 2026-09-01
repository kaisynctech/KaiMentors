"use client";

import { useState } from "react";
import {
  PORTAL_FEATURE_CATALOG,
  resolvePortalFeatures,
  type PortalAccessModel,
  type PortalFeatureKey,
} from "@/lib/portal-features";

interface PortalFeaturesSettingsProps {
  initial: Record<string, boolean>;
  accessModel: PortalAccessModel;
}

export function PortalFeaturesSettings({
  initial,
  accessModel,
}: PortalFeaturesSettingsProps) {
  const [features, setFeatures] = useState(() =>
    resolvePortalFeatures(initial, accessModel),
  );
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function toggle(key: PortalFeatureKey, enabled: boolean) {
    setFeatures((current) => ({ ...current, [key]: enabled }));
  }

  async function save() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/portal/features", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ features }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Academy features could not be saved.");
      }
      setFeatures(resolvePortalFeatures(payload.features, accessModel));
      setMessage("Academy features saved. Students see the same modules.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Academy features could not be saved.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <header style={{ marginBottom: "1.25rem" }}>
        <p className="eyebrow">Academy features</p>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800 }}>
          Modules on this portal
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
          Turn a module on or off for this academy. The mentor dashboard and the
          student portal stay in sync — students only see what you enable here.
        </p>
      </header>

      <div style={{ display: "grid", gap: "0.85rem", marginBottom: "1rem" }}>
        {PORTAL_FEATURE_CATALOG.map((feature) => (
          <label
            key={feature.key}
            style={{ display: "flex", gap: "0.65rem", alignItems: "flex-start" }}
          >
            <input
              checked={features[feature.key]}
              onChange={(event) => toggle(feature.key, event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>{feature.label}</strong>
              <br />
              <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                {feature.description}
              </span>
            </span>
          </label>
        ))}
      </div>

      <button disabled={loading} onClick={save} type="button">
        {loading ? "Saving…" : "Save academy features"}
      </button>
      {message ? <p style={{ marginTop: "0.75rem", fontSize: "0.88rem" }}>{message}</p> : null}
    </section>
  );
}
