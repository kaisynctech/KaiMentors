"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Globe2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { WebsiteDomain } from "@/lib/domains/types";
import styles from "./website-domain-manager.module.css";

interface WebsiteRelease {
  id: string;
  version: number;
  status: "published" | "superseded";
  content_hash: string;
  release_notes: string | null;
  published_at: string;
  published_by: string | null;
}

interface DomainEvent {
  id: number;
  domain_id: string | null;
  event_type: string;
  hostname: string;
  previous_status: string | null;
  next_status: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export function WebsiteDomainManager({
  domains: initialDomains,
  events,
  releases,
  portalSlug,
  portalId,
}: {
  domains: WebsiteDomain[];
  events: DomainEvent[];
  releases: WebsiteRelease[];
  portalSlug: string;
  portalId: string;
}) {
  const router = useRouter();
  const [domains, setDomains] = useState(initialDomains);
  const [selectedId, setSelectedId] = useState(initialDomains[0]?.id ?? "");
  const [hostname, setHostname] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"domains" | "releases">("domains");
  const selected = domains.find((domain) => domain.id === selectedId);
  const selectedEvents = useMemo(
    () => events.filter((event) => event.domain_id === selectedId),
    [events, selectedId],
  );
  const dnsRecommendations = selected
    ? getDnsRecommendations(selected.provider_metadata)
    : [];

  async function domainAction(
    body: Record<string, string>,
    busyKey: string,
  ) {
    setBusy(busyKey);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/website-builder/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body.action === "add" ? { ...body, portalId } : body),
        signal: AbortSignal.timeout(30000),
      });
      const text = await response.text();
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(`Server error (${response.status}). Please try again or refresh the page.`);
      }
      if (!response.ok) throw new Error(String(payload.error ?? "Domain action failed."));

      if (payload.domain) {
        const domain = payload.domain as WebsiteDomain;
        setDomains((current) => {
          const exists = current.some((entry) => entry.id === domain.id);
          return exists
            ? current.map((entry) => (entry.id === domain.id ? domain : entry))
            : [domain, ...current];
        });
        setSelectedId(domain.id);
      }
      if (body.action === "remove") {
        setDomains((current) =>
          current.filter((entry) => entry.id !== body.domainId),
        );
        setSelectedId("");
      }
      if (body.action === "set_primary") {
        setDomains((current) =>
          current.map((entry) => ({
            ...entry,
            is_primary: entry.id === body.domainId,
          })),
        );
      }
      setMessage(
        body.action === "add"
          ? "Domain reserved. Complete any DNS instructions below."
          : body.action === "remove"
            ? "Domain removed."
            : body.action === "set_primary"
              ? "Primary domain updated."
              : "Domain status refreshed.",
      );
      setHostname("");
      router.refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Domain action failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function rollback(releaseId: string) {
    setBusy(`release-${releaseId}`);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/website-builder/releases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "rollback", releaseId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "The release could not be restored.");
      }
      setMessage("The selected release is now live.");
      router.refresh();
    } catch (rollbackError) {
      setError(
        rollbackError instanceof Error
          ? rollbackError.message
          : "The release could not be restored.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.manager}>
      <nav className={styles.tabs}>
        <button
          className={activeTab === "domains" ? styles.activeTab : ""}
          onClick={() => setActiveTab("domains")}
          type="button"
        >
          Custom domains
        </button>
        <button
          className={activeTab === "releases" ? styles.activeTab : ""}
          onClick={() => setActiveTab("releases")}
          type="button"
        >
          Release history
        </button>
      </nav>

      {message ? <p className={styles.success}>{message}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      {activeTab === "domains" ? (
        <>
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span>Domain onboarding</span>
                <h2>Connect a client-owned domain</h2>
                <p>
                  KaiMentors reserves the hostname, provisions it on the
                  deployment, verifies ownership, and tracks DNS and SSL.
                </p>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                domainAction(
                  { action: "add", hostname: String(formData.get("hostname")) },
                  "add",
                );
              }}
              className={styles.addForm}
            >
              <label>
                Domain name
                <input
                  name="hostname"
                  onChange={(event) => setHostname(event.target.value)}
                  placeholder="academy.example.com"
                  required
                  value={hostname}
                />
              </label>
              <button disabled={busy === "add"} type="submit">
                {busy === "add" ? (
                  <Loader2 className={styles.spin} size={17} />
                ) : (
                  <Globe2 size={17} />
                )}
                Connect domain
              </button>
            </form>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span>Domain registry</span>
                <h2>Connected domains</h2>
              </div>
              <a href={`/portal/${portalSlug}`} target="_blank">
                Open fallback portal
              </a>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>Lifecycle</th>
                    <th>DNS</th>
                    <th>SSL</th>
                    <th>Last checked</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {domains.length ? (
                    domains.map((domain) => (
                      <tr
                        className={domain.id === selectedId ? styles.selectedRow : ""}
                        key={domain.id}
                      >
                        <td>
                          <button
                            className={styles.domainName}
                            onClick={() => setSelectedId(domain.id)}
                            type="button"
                          >
                            <strong>{domain.hostname}</strong>
                            <span>{domain.is_primary ? "Primary" : "Alias"}</span>
                          </button>
                        </td>
                        <td><Status value={domain.status} /></td>
                        <td><Status value={domain.dns_status} /></td>
                        <td><Status value={domain.ssl_status} /></td>
                        <td>{formatDate(domain.last_checked_at)}</td>
                        <td>
                          <button
                            aria-label={`Refresh ${domain.hostname}`}
                            className={styles.iconButton}
                            disabled={busy === domain.id}
                            onClick={() =>
                              domainAction(
                                { action: "refresh", domainId: domain.id },
                                domain.id,
                              )
                            }
                            type="button"
                          >
                            {busy === domain.id ? (
                              <Loader2 className={styles.spin} size={16} />
                            ) : (
                              <RefreshCw size={16} />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className={styles.empty} colSpan={6}>
                        No custom domains connected. The slug portal remains
                        available until a domain is activated.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {selected ? (
            <section className={styles.panel}>
              <div className={styles.detailHeader}>
                <div>
                  <span>Selected domain</span>
                  <h2>{selected.hostname}</h2>
                  <p>
                    Provider state is refreshed on demand. DNS propagation can
                    take time after records are changed.
                  </p>
                </div>
                <div className={styles.actions}>
                  {!selected.is_primary && selected.status === "active" ? (
                    <button
                      onClick={() =>
                        domainAction(
                          { action: "set_primary", domainId: selected.id },
                          `primary-${selected.id}`,
                        )
                      }
                      type="button"
                    >
                      <CheckCircle2 size={16} /> Make primary
                    </button>
                  ) : null}
                  <button
                    className={styles.dangerButton}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${selected.hostname} from this website?`,
                        )
                      ) {
                        domainAction(
                          { action: "remove", domainId: selected.id },
                          `remove-${selected.id}`,
                        );
                      }
                    }}
                    type="button"
                  >
                    <Trash2 size={16} /> Remove
                  </button>
                </div>
              </div>

              <div className={styles.statusGrid}>
                <StatusCard label="Ownership" value={selected.ownership_status} />
                <StatusCard label="DNS" value={selected.dns_status} />
                <StatusCard label="SSL certificate" value={selected.ssl_status} />
                <StatusCard label="Authentication" value={selected.auth_status} />
              </div>

              {selected.verification_records.length ? (
                <div className={styles.instructions}>
                  <h3>Required verification records</h3>
                  <div className={styles.tableWrap}>
                    <table>
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Name</th>
                          <th>Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.verification_records.map((record) => (
                          <tr key={`${record.type}-${record.domain}-${record.value}`}>
                            <td>{record.type}</td>
                            <td><CopyValue value={record.domain} /></td>
                            <td><CopyValue value={record.value} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {dnsRecommendations.length ? (
                <div className={styles.instructions}>
                  <h3>Recommended DNS targets</h3>
                  <div className={styles.tableWrap}>
                    <table>
                      <thead>
                        <tr>
                          <th>Record</th>
                          <th>Target</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dnsRecommendations.map((record) => (
                          <tr key={`${record.type}-${record.value}`}>
                            <td>{record.type}</td>
                            <td><CopyValue value={record.value} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {selected.failure_message ? (
                <p className={styles.failure}>
                  <strong>{selected.failure_code ?? "Domain error"}</strong>
                  {selected.failure_message}
                </p>
              ) : null}

              <details className={styles.events}>
                <summary>Domain activity ({selectedEvents.length})</summary>
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Status change</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEvents.map((event) => (
                        <tr key={event.id}>
                          <td>{event.event_type.replace(/_/g, " ")}</td>
                          <td>
                            {event.previous_status ?? "none"} →{" "}
                            {event.next_status ?? "none"}
                          </td>
                          <td>{formatDate(event.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
          ) : null}
        </>
      ) : (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span>Publishing history</span>
              <h2>Immutable website releases</h2>
              <p>
                Every publish creates a complete release. Restoring a previous
                version changes the live pointer without altering the draft.
              </p>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Published</th>
                  <th>Notes</th>
                  <th>Content hash</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {releases.length ? (
                  releases.map((release) => (
                    <tr key={release.id}>
                      <td><strong>v{release.version}</strong></td>
                      <td><Status value={release.status} /></td>
                      <td>{formatDate(release.published_at)}</td>
                      <td>{release.release_notes ?? "Website Builder publish"}</td>
                      <td><code>{release.content_hash.slice(0, 12)}</code></td>
                      <td>
                        {release.status !== "published" ? (
                          <button
                            className={styles.restoreButton}
                            disabled={busy === `release-${release.id}`}
                            onClick={() => rollback(release.id)}
                            type="button"
                          >
                            {busy === `release-${release.id}` ? (
                              <Loader2 className={styles.spin} size={15} />
                            ) : (
                              <RotateCcw size={15} />
                            )}
                            Restore
                          </button>
                        ) : (
                          <span className={styles.liveLabel}>Live</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className={styles.empty} colSpan={6}>
                      Publish the website to create its first release.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Status({ value }: { value: string }) {
  return (
    <span className={`${styles.status} ${styles[`status_${value}`] ?? ""}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <article>
      <span>{label}</span>
      <Status value={value} />
    </article>
  );
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={styles.copyValue}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
      type="button"
    >
      <code>{value}</code>
      {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
    </button>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Not checked";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getDnsRecommendations(metadata: Record<string, unknown>) {
  const values: Array<{ type: string; value: string }> = [];
  for (const [key, type] of [
    ["recommendedIPv4", "A"],
    ["recommendedCNAME", "CNAME"],
  ] as const) {
    const records = metadata[key];
    if (!Array.isArray(records)) continue;
    records.forEach((record) => {
      const value =
        typeof record === "string"
          ? record
          : record &&
              typeof record === "object" &&
              "value" in record &&
              typeof record.value === "string"
            ? record.value
            : null;
      if (value && !values.some((entry) => entry.value === value)) {
        values.push({ type, value });
      }
    });
  }
  return values;
}
