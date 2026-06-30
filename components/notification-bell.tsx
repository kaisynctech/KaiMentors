"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import styles from "./notification-bell.module.css";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  booking_id: string | null;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.is_read).length;

  async function load() {
    if (loaded) return;
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = (await res.json()) as Notification[];
        setNotifications(data);
      }
    } finally {
      setLoaded(true);
    }
  }

  async function markRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    await fetch(`/api/notifications/${id}`, { method: "PATCH" });
  }

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) void load();
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className={styles.root} ref={ref}>
      <button
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        className={styles.trigger}
        onClick={handleToggle}
        type="button"
      >
        <Bell size={17} />
        {unread > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={styles.dropdown} role="dialog" aria-label="Notifications">
          <p className={styles.dropdownTitle}>Notifications</p>
          {!loaded ? (
            <p className={styles.empty}>Loading…</p>
          ) : notifications.length === 0 ? (
            <p className={styles.empty}>No notifications yet.</p>
          ) : (
            <ul className={styles.list}>
              {notifications.map((n) => (
                <li
                  className={`${styles.item} ${n.is_read ? styles.itemRead : ""}`}
                  key={n.id}
                  onClick={() => { if (!n.is_read) void markRead(n.id); }}
                >
                  <p className={styles.itemTitle}>{n.title}</p>
                  {n.body && <p className={styles.itemBody}>{n.body}</p>}
                  <p className={styles.itemTime}>
                    {new Date(n.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
