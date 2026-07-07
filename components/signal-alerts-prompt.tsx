"use client";

import { useEffect, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import {
  isIosSafari,
  isStandaloneDisplayMode,
  pushSupported,
  subscribeToSignalPush,
  unsubscribeFromSignalPush,
} from "@/lib/push-client";
import styles from "./signal-alerts-prompt.module.css";

const DISMISS_KEY = "signal-alerts-dismissed";

interface Props {
  traderId: string;
}

export function SignalAlertsPrompt({ traderId }: Props) {
  const [visible, setVisible] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [needsInstallFirst, setNeedsInstallFirst] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    const permission = Notification.permission;
    if (permission === "granted") {
      setEnabled(true);
      return;
    }

    if (isIosSafari() && !isStandaloneDisplayMode()) {
      setNeedsInstallFirst(true);
      setVisible(true);
      return;
    }

    if (permission === "default") {
      setVisible(true);
    }
  }, []);

  async function enableAlerts() {
    setLoading(true);
    setError("");
    try {
      await subscribeToSignalPush(traderId);
      setEnabled(true);
      setVisible(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Alerts could not be enabled.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function disableAlerts() {
    setLoading(true);
    setError("");
    try {
      await unsubscribeFromSignalPush();
      setEnabled(false);
      setVisible(false);
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      setError("Alerts could not be disabled.");
    } finally {
      setLoading(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  if (enabled && !visible) {
    return (
      <section className={styles.card}>
        <BellRing size={18} />
        <h2>Signal alerts are on</h2>
        <p>You&apos;ll get notified when your mentor posts today&apos;s trade signal.</p>
        <div className={styles.actions}>
          <button
            className={styles.secondary}
            disabled={loading}
            onClick={() => void disableAlerts()}
            type="button"
          >
            {loading ? <Loader2 size={14} className="spin" /> : null}
            Turn off alerts
          </button>
        </div>
      </section>
    );
  }

  if (!visible) return null;

  return (
    <section className={styles.card}>
      <BellRing size={18} />
      <h2>Signal alerts</h2>
      <p>Get notified when your mentor posts today&apos;s trade signal.</p>

      {needsInstallFirst ? (
        <p className={styles.hint}>
          On iPhone: open in Safari → Share → Add to Home Screen, then turn on
          alerts.
        </p>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.actions}>
        {!needsInstallFirst ? (
          <button
            className={styles.primary}
            disabled={loading}
            onClick={() => void enableAlerts()}
            type="button"
          >
            {loading ? <Loader2 size={14} className="spin" /> : null}
            Turn on alerts
          </button>
        ) : null}
        <button className={styles.dismiss} onClick={dismiss} type="button">
          Not now
        </button>
      </div>
    </section>
  );
}
