"use client";

import { useEffect, useState } from "react";

export function useOtpCooldown() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);
  return { seconds, start: (duration = 60) => setSeconds(duration) };
}
