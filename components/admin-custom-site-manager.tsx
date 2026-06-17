"use client";

import { CheckCircle2, Loader2, Save } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CustomSitePackage, WebsiteDeliveryMode } from "@/lib/custom-sites";
import styles from "./admin-custom-site-manager.module.css";

interface TenantRow {
  traderId: string;
  portalId: string;
  mentorName: string;
  portalName: string;
  portalSlug: string;
  studentCount: number;
  deliveryMode: WebsiteDeliveryMode;
  assignmentId: string | null;
  packageId: string | null;
  packageName: string | null;
  assignmentStatus: string | null;
  showPoweredBy: boolean;
}

export function AdminCustomSiteManager({
  packages,
  tenants,
}: {
  packages: CustomSitePackage[];
  tenants: TenantRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedPackages, setSelectedPackages] = useState(
    Object.fromEntries(
      tenants.map((tenant) => [tenant.portalId, tenant.packageId ?? ""]),
    ),
  );
  const [poweredBy, setPoweredBy] = useState(
    Object.fromEntries(
      tenants.map((tenant) => [tenant.portalId, tenant.showPoweredBy]),
    ),
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function post(body: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/custom-sites/assign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Action failed.");
      setMessage(
        body.action === "assign"
          ? "Custom package assigned."
          : "Website delivery mode updated.",
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
            <p className="eyebrow">Assignment control</p>
            <h2>Tenant custom website packages</h2>
            <p>
              KaiMentors controls which bespoke website belongs to each mentor.
              Mentors can only edit safe content fields after assignment.
            </p>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Mentor</th>
                <th>Portal</th>
                <th>Students</th>
                <th>Current package</th>
                <th>Assign package</th>
                <th>Powered by</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.portalId}>
                  <td>
                    <strong>{tenant.mentorName}</strong>
                    <span>{tenant.deliveryMode.replace("_", " ")}</span>
                  </td>
                  <td>
                    <strong>{tenant.portalName}</strong>
                    <span>/portal/{tenant.portalSlug}</span>
                  </td>
                  <td>{tenant.studentCount}</td>
                  <td>
                    <span className={tenant.packageName ? styles.activeBadge : styles.badge}>
                      {tenant.packageName ?? "No package"}
                    </span>
                  </td>
                  <td>
                    <select
                      onChange={(event) =>
                        setSelectedPackages((current) => ({
                          ...current,
                          [tenant.portalId]: event.target.value,
                        }))
                      }
                      value={selectedPackages[tenant.portalId] ?? ""}
                    >
                      <option value="">Select package</option>
                      {packages.map((sitePackage) => (
                        <option key={sitePackage.id} value={sitePackage.id}>
                          {sitePackage.name} v{sitePackage.version}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      checked={poweredBy[tenant.portalId] ?? true}
                      onChange={(event) =>
                        setPoweredBy((current) => ({
                          ...current,
                          [tenant.portalId]: event.target.checked,
                        }))
                      }
                      type="checkbox"
                    />
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        disabled={
                          !selectedPackages[tenant.portalId] ||
                          busy === `assign-${tenant.portalId}`
                        }
                        onClick={() =>
                          post(
                            {
                              action: "assign",
                              portalId: tenant.portalId,
                              packageId: selectedPackages[tenant.portalId],
                              showPoweredBy: poweredBy[tenant.portalId] ?? true,
                            },
                            `assign-${tenant.portalId}`,
                          )
                        }
                        type="button"
                      >
                        {busy === `assign-${tenant.portalId}` ? (
                          <Loader2 className={styles.spin} size={15} />
                        ) : (
                          <Save size={15} />
                        )}
                        Assign
                      </button>
                      {tenant.deliveryMode === "custom_package" ? (
                        <button
                          className={styles.secondaryButton}
                          disabled={busy === `pause-${tenant.portalId}`}
                          onClick={() =>
                            post(
                              {
                                action: "set_mode",
                                portalId: tenant.portalId,
                                mode: "builder_template",
                              },
                              `pause-${tenant.portalId}`,
                            )
                          }
                          type="button"
                        >
                          Pause
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
