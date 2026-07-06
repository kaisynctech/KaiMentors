import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;
const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@kaimentors.com";

/** Rejects after `ms` milliseconds so a hung Resend call never blocks forever. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Resend timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export interface BookingEmailData {
  to: string;
  studentName: string;
  mentorName: string;
  sessionTypeName: string;
  startsAt: string;
  durationMinutes: number;
  recipientTimezone: string;
}

function formatDateTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export async function sendBookingConfirmation(data: BookingEmailData) {
  return withTimeout(resend!.emails.send({
    from: FROM,
    to: data.to,
    subject: `Session confirmed: ${data.sessionTypeName} with ${data.mentorName}`,
    html: `
      <p>Hi ${data.studentName},</p>
      <p>Your session has been confirmed:</p>
      <ul>
        <li><strong>Session:</strong> ${data.sessionTypeName}</li>
        <li><strong>With:</strong> ${data.mentorName}</li>
        <li><strong>When:</strong> ${formatDateTime(data.startsAt, data.recipientTimezone)}</li>
        <li><strong>Duration:</strong> ${data.durationMinutes} minutes</li>
      </ul>
      <p>You can join from your academy portal when the session starts.</p>
    `,
  }), 8000);
}

export async function sendBookingReminder(
  data: BookingEmailData,
  hoursAhead: 24 | 1,
) {
  const label = hoursAhead === 24 ? "tomorrow" : "in 1 hour";
  return withTimeout(resend!.emails.send({
    from: FROM,
    to: data.to,
    subject: `Reminder: ${data.sessionTypeName} ${label}`,
    html: `
      <p>Hi ${data.studentName},</p>
      <p>This is a reminder that your session starts ${label}:</p>
      <ul>
        <li><strong>Session:</strong> ${data.sessionTypeName}</li>
        <li><strong>With:</strong> ${data.mentorName}</li>
        <li><strong>When:</strong> ${formatDateTime(data.startsAt, data.recipientTimezone)}</li>
      </ul>
      <p>Log into your academy to join the session when it starts.</p>
    `,
  }), 8000);
}

export async function sendMentorBookingNotification(data: {
  to: string;
  mentorName: string;
  studentName: string;
  sessionTypeName: string;
  startsAt: string;
  durationMinutes: number;
  mentorTimezone: string;
  requiresApproval: boolean;
}) {
  const action = data.requiresApproval
    ? "A student has requested a session — please review it in your dashboard."
    : "A student has booked a session.";
  return withTimeout(resend!.emails.send({
    from: FROM,
    to: data.to,
    subject: `New booking: ${data.sessionTypeName} with ${data.studentName}`,
    html: `
      <p>Hi ${data.mentorName},</p>
      <p>${action}</p>
      <ul>
        <li><strong>Student:</strong> ${data.studentName}</li>
        <li><strong>Session:</strong> ${data.sessionTypeName}</li>
        <li><strong>When:</strong> ${formatDateTime(data.startsAt, data.mentorTimezone)}</li>
        <li><strong>Duration:</strong> ${data.durationMinutes} minutes</li>
      </ul>
    `,
  }), 8000);
}

export async function sendCancellationEmail(data: {
  to: string;
  recipientName: string;
  sessionTypeName: string;
  startsAt: string;
  recipientTimezone: string;
  cancelledBy: "mentor" | "student";
  reason?: string | null;
}) {
  const cancellerLabel =
    data.cancelledBy === "mentor" ? "your mentor" : "the student";
  return withTimeout(resend!.emails.send({
    from: FROM,
    to: data.to,
    subject: `Session cancelled: ${data.sessionTypeName}`,
    html: `
      <p>Hi ${data.recipientName},</p>
      <p>Your session has been cancelled by ${cancellerLabel}.</p>
      <ul>
        <li><strong>Session:</strong> ${data.sessionTypeName}</li>
        <li><strong>Was scheduled for:</strong> ${formatDateTime(data.startsAt, data.recipientTimezone)}</li>
        ${data.reason ? `<li><strong>Reason:</strong> ${data.reason}</li>` : ""}
      </ul>
    `,
  }), 8000);
}

export async function sendWorkspaceAdded({
  to,
  workspaceName,
  inviterName,
  dashboardUrl,
}: {
  to: string;
  workspaceName: string;
  inviterName: string;
  dashboardUrl: string;
}) {
  if (!resend) return;
  await withTimeout(
    resend.emails.send({
      from: FROM,
      to,
      subject: `You've been added to ${workspaceName}`,
      html: `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f3f4f6;margin:0;padding:40px 0;">
  <div style="background:#fff;max-width:480px;margin:0 auto;border-radius:16px;padding:40px;border:1px solid #e5e7eb;">
    <p style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;margin:0 0 12px;">
      Workspace access
    </p>
    <h1 style="font-size:22px;font-weight:800;color:#111314;margin:0 0 16px;letter-spacing:-0.03em;">
      You've been added to ${workspaceName}
    </h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 28px;">
      ${inviterName} has added you to the <strong>${workspaceName}</strong> mentor workspace.
      Log in to access it.
    </p>
    <a href="${dashboardUrl}"
       style="display:inline-block;background:#111314;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:700;">
      Go to dashboard →
    </a>
  </div>
</body>
</html>`,
    }),
    8000,
  );
}
