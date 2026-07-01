"use client";

import { useEffect, useState } from "react";
import styles from "./messages-unread-dot.module.css";

export function MessagesUnreadDot({
  traderId,
  apiPath,
}: {
  traderId?: string;
  apiPath?: string;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!traderId) return;
    const path = apiPath ?? "/api/messages/unread";
    function load() {
      fetch(path)
        .then((r) => (r.ok ? r.json() : { count: 0 }))
        .then(({ count: n }: { count: number }) => setCount(n));
    }
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [traderId, apiPath]);

  if (!count) return null;
  return <span aria-label={`${count} unread`} className={styles.dot} />;
}
