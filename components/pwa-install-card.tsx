"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { isIosSafari, isStandaloneDisplayMode } from "@/lib/push-client";
import styles from "./pwa-install-card.module.css";

const DISMISS_KEY = "pwa-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface Props {
  academyName: string;
}

export function PwaInstallCard({ academyName }: Props) {
  const [visible, setVisible] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandaloneDisplayMode()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    setVisible(true);
    setShowIosGuide(isIosSafari());

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setShowIosGuide(false);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, []);

  async function handleInstall() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setVisible(false);
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <section className={styles.card}>
      <Smartphone size={20} />
      <h2>Add {academyName} to your home screen</h2>
      <p>
        Quick access to signals and messages — like an app, no download.
      </p>

      {showIosGuide ? (
        <ol className={styles.iosSteps}>
          <li>Open this page in Safari.</li>
          <li>Tap Share.</li>
          <li>Select Add to Home Screen.</li>
        </ol>
      ) : null}

      <div className={styles.actions}>
        {installEvent ? (
          <button className={styles.primary} onClick={() => void handleInstall()} type="button">
            Install app
          </button>
        ) : null}
        <button className={styles.dismiss} onClick={dismiss} type="button">
          Not now
        </button>
      </div>
    </section>
  );
}
