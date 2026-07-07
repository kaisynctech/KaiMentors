"use client";

import { useState } from "react";
import {
  accessPolicyHelperCopy,
  type PortalAccessPolicy,
} from "@/lib/student-access";

interface StudentAccessSettingsProps {
  initial: PortalAccessPolicy;
}

export function StudentAccessSettings({ initial }: StudentAccessSettingsProps) {
  const [requireVerify, setRequireVerify] = useState(
    initial.requireBrokerVerificationForModules,
  );
  const [allowFullAccess, setAllowFullAccess] = useState(
    initial.allowFullAccessWithoutVerification,
  );
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const policy: PortalAccessPolicy = {
    requireBrokerVerificationForModules: requireVerify,
    allowFullAccessWithoutVerification: allowFullAccess,
  };

  async function save() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/portal/access-policy", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requireBrokerVerificationForModules: requireVerify,
          allowFullAccessWithoutVerification: allowFullAccess,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Settings could not be saved.");
      }
      setMessage("Student access settings saved.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Settings could not be saved.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <header style={{ marginBottom: "1.25rem" }}>
        <p className="eyebrow">Student access</p>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800 }}>
          Module locks & broker verification
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
          Control when enrolled students can access courses and academy content.
          Student signup stays the same for every academy.
        </p>
      </header>

      <div style={{ display: "grid", gap: "0.85rem", marginBottom: "1rem" }}>
        <label style={{ display: "flex", gap: "0.65rem", alignItems: "flex-start" }}>
          <input
            checked={requireVerify}
            onChange={(event) => setRequireVerify(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>Require broker verification to unlock modules</strong>
            <br />
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Students must verify with a partner broker before courses unlock.
            </span>
          </span>
        </label>

        <label style={{ display: "flex", gap: "0.65rem", alignItems: "flex-start" }}>
          <input
            checked={allowFullAccess}
            onChange={(event) => setAllowFullAccess(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>Give all students full access (no locked modules)</strong>
            <br />
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Enrolled students can access content without broker verification.
            </span>
          </span>
        </label>
      </div>

      <p
        style={{
          padding: "0.85rem 1rem",
          borderRadius: "0.75rem",
          background: "var(--surface-hover, #f8fafc)",
          border: "1px solid var(--border)",
          fontSize: "0.88rem",
          marginBottom: "1rem",
        }}
      >
        {accessPolicyHelperCopy(policy)}
      </p>

      <button disabled={loading} onClick={save} type="button">
        {loading ? "Saving…" : "Save student access"}
      </button>
      {message ? <p style={{ marginTop: "0.75rem", fontSize: "0.88rem" }}>{message}</p> : null}
    </section>
  );
}
