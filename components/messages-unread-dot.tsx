"use client";

import { useEffect, useState } from "react";
import styles from "./messages-unread-dot.module.css";

export function MessagesUnreadDot({ traderId }: { traderId?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!traderId) return;
    function load() {
      fetch("/api/messages/unread")
        .then((r) => (r.ok ? r.json() : { count: 0 }))
        .then(({ count: n }: { count: number }) => setCount(n));
    }
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [traderId]);

  if (!count) return null;
  return <span aria-label={`${count} unread`} className={styles.dot} />;
}
