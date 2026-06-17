"use client";

import { CheckCircle2, ExternalLink, Loader2, LockKeyhole, Save } from "lucide-react";
import { useState } from "react";
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
  const [showPoweredBy, setShowPoweredBy] = useState(
    assignment?.show_powered_by ?? true,
  );
  const [overrides, setOverrides] = useState<Record<string, string>>(
    assignment?.content_overrides ?? {},
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activePackage = packages.find(
    (sitePackage) => sitePackage.id === assignment?.package_id,
  );
  const fields = activePackage?.editable_schema ?? [];

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
      setMessage("Custom website content saved.");
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
            <span>Managed assignment</span>
            <h2>Custom website package</h2>
            <p>
              KaiMentors assigns bespoke client websites from the platform
              console. Mentors can edit approved content fields only after a
              package is assigned to their workspace.
            </p>
          </div>
          <a href={`/portal/${portalSlug}`} target="_blank">
            Open public site <ExternalLink size={15} />
          </a>
        </div>
        <div className={styles.assignmentSummary}>
          <LockKeyhole size={18} />
          <div>
            <strong>
              {activePackage
                ? `${activePackage.name} v${activePackage.version}`
                : "No custom package assigned"}
            </strong>
            <span>
              {activePackage
                ? `${activePackage.category} · ${deliveryMode.replace("_", " ")}`
                : "KaiMentors will assign a custom package from the platform admin portal."}
            </span>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span>Safe client edits</span>
            <h2>{activePackage?.name ?? "No package assigned"}</h2>
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
            <strong>Show &quot;Powered by KaiMentors&quot;</strong>
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
