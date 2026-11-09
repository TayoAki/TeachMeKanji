import "server-only";
import { reportError } from "@appbuilder/core";

/**
 * Transactional email. With RESEND_API_KEY and EMAIL_FROM set, sends through Resend's HTTP API;
 * otherwise development prints the message to the server log, and production reports an error.
 */
/** Whether emails really go out (development prints them to the log instead). */
export function emailConfigured(): boolean {
  return (
    Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM) ||
    process.env.NODE_ENV !== "production"
  );
}

export async function sendEmail(message: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
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
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: message.to, subject: message.subject, text: message.text }),
  });
  if (!response.ok)
    reportError(new Error(`Email send failed (${response.status})`), { to: message.to });
}
