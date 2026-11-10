/**
 * Transactional and funnel email. With RESEND_API_KEY and EMAIL_FROM set, sends through Resend's
 * HTTP API; otherwise development prints the message to the log, and production reports an error.
 * Used by the web app (auth emails, the readiness check) and the worker (the funnel sequence).
 */
import { reportError } from "./report";

/** Whether emails really go out (development prints them to the log instead). */
export function emailConfigured(): boolean {
  return (
    Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM) ||
    process.env.NODE_ENV !== "production"
  );
}

/** Whether a real provider is set (development's log printing doesn't count). */
export function emailProviderSet(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(message: {
  to: string;
  subject: string;
  text: string;
  /** Extra headers, e.g. List-Unsubscribe for marketing email. */
  headers?: Record<string, string>;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    if (process.env.NODE_ENV === "production") {
      // Never put links with tokens in production logs.
      reportError(new Error("Email not sent: RESEND_API_KEY and EMAIL_FROM are not set"), {
        subject: message.subject,
      });
    } else {
      console.log(`[email] to=${message.to} subject="${message.subject}"\n${message.text}`);
    }
    return false;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.headers ? { headers: message.headers } : {}),
    }),
  });
  if (!response.ok) {
    reportError(new Error(`Email send failed (${response.status})`), { subject: message.subject });
    return false;
  }
  return true;
}
