"use client";

import { CheckCircle2, ExternalLink, Loader2, PackageCheck, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CustomSiteAssignment,
  CustomSiteEditableField,
  CustomSitePackage,
  WebsiteDeliveryMode,
} from "@/lib/custom-sites";
import styles from "./custom-site-manager.module.css";

interface CustomSiteManagerProps {
  assignment: CustomSiteAssignment | null;
  deliveryMode: WebsiteDeliveryMode;
  packages: CustomSitePackage[];
  portalSlug: string;
}

export function CustomSiteManager({
  assignment,
  deliveryMode,
  packages,
  portalSlug,
}: CustomSiteManagerProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState(deliveryMode);
  const [selectedPackageId, setSelectedPackageId] = useState(
    assignment?.package_id ?? packages[0]?.id ?? "",
  );
  const [showPoweredBy, setShowPoweredBy] = useState(
    assignment?.show_powered_by ?? true,
  );
  const [overrides, setOverrides] = useState<Record<string, string>>(
    assignment?.content_overrides ?? {},
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedPackage = useMemo(
    () => packages.find((sitePackage) => sitePackage.id === selectedPackageId),
    [packages, selectedPackageId],
  );
  const activePackage = packages.find(
    (sitePackage) => sitePackage.id === assignment?.package_id,
  );
  const fields = selectedPackage?.editable_schema ?? [];

  async function post(body: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/website-builder/custom-site", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Action failed.");
      setMessage(
        body.action === "assign_package"
          ? "Custom website package assigned and activated."
          : body.action === "set_mode"
            ? "Website delivery mode updated."
            : "Custom website content saved.",
      );
      router.refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Action failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function updateMode(nextMode: WebsiteDeliveryMode) {
    setMode(nextMode);
    await post({ action: "set_mode", mode: nextMode }, "mode");
  }

  return (
    <div className={styles.manager}>
      {message ? (
        <p className={styles.success}>
          <CheckCircle2 size={17} /> {message}
        </p>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span>Delivery model</span>
            <h2>Choose how this academy website is served</h2>
            <p>
              Template websites and custom website packages share the same
              tenant, domain, authentication, courses, groups, and messaging
              engine.
            </p>
          </div>
          <a href={`/portal/${portalSlug}`} target="_blank">
            Open public site <ExternalLink size={15} />
          </a>
        </div>
        <div className={styles.modeGrid}>
          {([
            ["builder_template", "Website Builder", "Use KaiMentors templates and reusable sections."],
            ["custom_package", "Custom Package", "Serve a bespoke client website through KaiMentors."],
            ["external_website", "External Website", "Track a separately hosted website while keeping portal routes."],
          ] as const).map(([value, title, description]) => (
            <button
              className={mode === value ? styles.activeMode : ""}
              disabled={busy === "mode"}
              key={value}
              onClick={() => updateMode(value)}
              type="button"
            >
              <strong>{title}</strong>
              <span>{description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span>Package library</span>
            <h2>Custom websites created for clients</h2>
            <p>
              Select a package to make it the public website for this tenant.
              Reserved paths remain controlled by KaiMentors.
            </p>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Package</th>
                <th>Category</th>
                <th>Version</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {packages.map((sitePackage) => {
                const selected = sitePackage.id === selectedPackageId;
                const assigned = sitePackage.id === assignment?.package_id;
                return (
                  <tr
                    className={selected ? styles.selectedRow : ""}
                    key={sitePackage.id}
                  >
                    <td>
                      <button
                        className={styles.packageName}
                        onClick={() => {
                          setSelectedPackageId(sitePackage.id);
                          setOverrides(assignment?.content_overrides ?? {});
                        }}
                        type="button"
                      >
                        <strong>{sitePackage.name}</strong>
                        <span>{sitePackage.description}</span>
                      </button>
                    </td>
                    <td>{sitePackage.category}</td>
                    <td>v{sitePackage.version}</td>
                    <td>
                      <span className={assigned ? styles.activeBadge : styles.badge}>
                        {assigned ? "Assigned" : "Available"}
                      </span>
                    </td>
                    <td>
                      <button
                        disabled={busy === `assign-${sitePackage.id}`}
                        onClick={() =>
                          post(
                            {
                              action: "assign_package",
                              packageId: sitePackage.id,
                              showPoweredBy,
                            },
                            `assign-${sitePackage.id}`,
                          )
                        }
                        type="button"
                      >
                        {busy === `assign-${sitePackage.id}` ? (
                          <Loader2 className={styles.spin} size={15} />
                        ) : (
                          <PackageCheck size={15} />
                        )}
                        {assigned ? "Re-activate" : "Assign"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span>Safe client edits</span>
            <h2>{selectedPackage?.name ?? activePackage?.name ?? "Custom package"}</h2>
            <p>
              These fields are exposed by the package manifest. Clients can
              change content without touching the custom design files.
            </p>
          </div>
        </div>
        <div className={styles.formGrid}>
          {fields.length ? (
            fields.map((field) => (
              <EditableField
                field={field}
                key={field.key}
                onChange={(value) =>
                  setOverrides((current) => ({
                    ...current,
                    [field.key]: value,
                  }))
                }
                value={overrides[field.key] ?? field.default ?? ""}
              />
            ))
          ) : (
            <p className={styles.empty}>
              Select a package to view its editable fields.
            </p>
          )}
        </div>
        <label className={styles.poweredBy}>
          <input
            checked={showPoweredBy}
            onChange={(event) => setShowPoweredBy(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>Show “Powered by KaiMentors”</strong>
            <small>Keep KaiMentors visible while the client owns the website brand.</small>
          </span>
        </label>
        <button
          className={styles.saveButton}
          disabled={!assignment || busy === "overrides"}
          onClick={() =>
            assignment
              ? post(
                  {
                    action: "save_overrides",
                    assignmentId: assignment.id,
                    overrides,
                    showPoweredBy,
                  },
                  "overrides",
                )
              : null
          }
          type="button"
        >
          {busy === "overrides" ? (
            <Loader2 className={styles.spin} size={16} />
          ) : (
            <Save size={16} />
          )}
          Save custom content
        </button>
      </section>
    </div>
  );
}

function EditableField({
  field,
  onChange,
  value,
}: {
  field: CustomSiteEditableField;
  onChange: (value: string) => void;
  value: string;
}) {
  if (field.type === "textarea") {
    return (
      <label className={styles.fullWidth}>
        {field.label}
        <textarea
          onChange={(event) => onChange(event.target.value)}
          rows={4}
          value={value}
        />
      </label>
    );
  }

  return (
    <label>
      {field.label}
      <input
        onChange={(event) => onChange(event.target.value)}
        type={field.type === "url" ? "url" : "text"}
        value={value}
      />
    </label>
  );
}
