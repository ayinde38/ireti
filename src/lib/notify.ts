import "server-only";

/**
 * Sends a short email. Uses Resend's REST API when RESEND_API_KEY is set;
 * otherwise logs, so local development needs no provider. SMS can be added
 * behind the same function later.
 */
export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY);

export async function sendEmail(to: string[], subject: string, text: string) {
  const recipients = [...new Set(to.filter(Boolean))];
  if (recipients.length === 0) return;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[notify] (no RESEND_API_KEY) to=${recipients.length} subject="${subject}"`);
    return;
  }
  // One request per recipient so donors never see each other's addresses.
  await Promise.allSettled(
    recipients.map((r) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM ?? "Ireti <updates@example.com>",
          to: [r],
          subject,
          text,
        }),
      }),
    ),
  );
}

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
