"use client";

import { AcademyProgressPulse } from "@/components/academy-progress-pulse";
import type { AcademyProgressPulse as Pulse } from "@/lib/academy-progress-server";

export function StudentsTab({
  pulse,
  messagesEnabled,
  bookingsEnabled,
}: {
  pulse: Pulse;
  messagesEnabled: boolean;
  bookingsEnabled: boolean;
}) {
  return (
    <AcademyProgressPulse
      bookingsEnabled={bookingsEnabled}
      messagesEnabled={messagesEnabled}
      pulse={pulse}
      showCourseFilter={false}
    />
  );
}
