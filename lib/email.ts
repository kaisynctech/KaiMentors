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
