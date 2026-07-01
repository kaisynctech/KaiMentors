"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./workspace-switcher.module.css";

interface Workspace {
  traderId: string;
  role: string;
  displayName: string;
}

export function WorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/workspace/list")
      .then((r) => r.json())
      .then(({ workspaces: ws, activeId: aid }: { workspaces: Workspace[]; activeId: string | null }) => {
        setWorkspaces(ws ?? []);
        setActiveId(aid ?? null);
      });
  }, []);

  if (workspaces.length < 2) return null;

  const active = workspaces.find((w) => w.traderId === activeId) ?? workspaces[0];

  async function switchTo(ws: Workspace) {
    await fetch("/api/workspace/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traderId: ws.traderId }),
    });
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
