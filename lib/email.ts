import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@kaimentors.com";

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
  return resend.emails.send({
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
  });
}

export async function sendBookingReminder(
  data: BookingEmailData,
  hoursAhead: 24 | 1,
) {
  const label = hoursAhead === 24 ? "tomorrow" : "in 1 hour";
  return resend.emails.send({
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
  });
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
  return resend.emails.send({
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
  });
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
  return resend.emails.send({
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
  });
}

export async function sendWorkspaceInvitation({
  to,
  workspaceName,
  inviterName,
  joinUrl,
}: {
  to: string;
  workspaceName: string;
  inviterName: string;
  joinUrl: string;
}) {
  if (!resend) return;
  await resend.emails.send({
    from: FROM,
    to,
    subject: `You've been invited to join ${workspaceName}`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f3f4f6;margin:0;padding:40px 0;">
  <div style="background:#fff;max-width:480px;margin:0 auto;border-radius:16px;padding:40px;border:1px solid #e5e7eb;">
    <p style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;margin:0 0 12px;">
      Workspace invitation
    </p>
    <h1 style="font-size:22px;font-weight:800;color:#111314;margin:0 0 16px;letter-spacing:-0.03em;">
      You've been invited to join ${workspaceName}
    </h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 28px;">
      ${inviterName} has invited you to join the <strong>${workspaceName}</strong> mentor workspace on KaiMentors.
      Click below to set up your account.
    </p>
    <a href="${joinUrl}"
       style="display:inline-block;background:#111314;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:700;">
      Set up your account →
    </a>
    <p style="font-size:12px;color:#9ca3af;margin:28px 0 0;">
      This invitation expires in 7 days. If you did not expect this email, you can ignore it safely.
    </p>
  </div>
</body>
</html>`,
  });
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
  await resend.emails.send({
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
  });
}
