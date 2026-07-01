"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import styles from "./notification-bell.module.css";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  booking_id: string | null;
  conversation_id: string | null;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.is_read).length;

  async function load() {
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

  function handleNotificationClick(n: Notification) {
    if (n.type === "new_message" && n.conversation_id) {
      void markRead(n.id);
      setOpen(false);
      router.push(`/dashboard/messages?conversation=${n.conversation_id}`);
    } else if (!n.is_read) {
      void markRead(n.id);
    }
  }

  // Eager load on mount
  useEffect(() => {
    void load();
  }, []);

  // Realtime: prepend new notifications as they arrive
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            setNotifications((prev) => [payload.new as Notification, ...prev]);
          },
        )
        .subscribe();
    });
    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

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
          <span aria-hidden="true" className={styles.badge}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div aria-label="Notifications" className={styles.dropdown} role="dialog">
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
                  onClick={() => handleNotificationClick(n)}
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
