"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./workspace-switcher.module.css";

interface Workspace {
  traderId: string;
  role: string;
  displayName: string;
}

function getActiveWorkspaceId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)km_workspace=([^;]+)/);
  return match ? match[1] : null;
}

function setActiveWorkspaceId(traderId: string) {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `km_workspace=${traderId}; path=/; max-age=2592000; SameSite=Lax${secure}`;
}

export function WorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setActiveId(getActiveWorkspaceId());
    fetch("/api/workspace/list")
      .then((r) => r.json())
      .then(({ workspaces: ws }: { workspaces: Workspace[] }) => setWorkspaces(ws ?? []));
  }, []);

  if (workspaces.length < 2) return null;

  const active = workspaces.find((w) => w.traderId === activeId) ?? workspaces[0];

  function switchTo(ws: Workspace) {
    setActiveWorkspaceId(ws.traderId);
    setOpen(false);
    window.location.href = "/dashboard";
  }

  return (
    <div className={styles.switcher}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className={styles.label}>
          <span className={styles.meta}>Workspace</span>
          <strong>{active.displayName}</strong>
        </span>
        <ChevronDown className={open ? styles.chevronOpen : undefined} size={14} />
      </button>

      {open && (
        <ul className={styles.dropdown} role="listbox">
          {workspaces.map((ws) => (
            <li aria-selected={ws.traderId === active.traderId} key={ws.traderId} role="option">
              <button
                className={ws.traderId === active.traderId ? styles.activeOption : undefined}
                onClick={() => switchTo(ws)}
                type="button"
              >
                {ws.displayName}
                <span>{ws.role}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
