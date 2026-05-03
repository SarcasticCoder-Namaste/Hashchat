export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sgKey = process.env.SENDGRID_API_KEY;
  const fromAddress =
    process.env.MAIL_FROM_ADDRESS ?? "no-reply@hashchat.app";
  const fromName = process.env.MAIL_FROM_NAME ?? "HashChat";

  if (sgKey) {
    try {
      const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sgKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }], subject }],
          from: { email: fromAddress, name: fromName },
          content: [
            { type: "text/plain", value: text },
            { type: "text/html", value: html },
          ],
        }),
      });
      if (!r.ok) {
        const body = await r.text();
        return {
          ok: false,
          error: `sendgrid:${r.status}:${body.slice(0, 200)}`,
        };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `sendgrid:fetch:${(e as Error).message}` };
    }
  }

  const reKey = process.env.RESEND_API_KEY;
  if (reKey) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${reKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${fromName} <${fromAddress}>`,
          to: [to],
          subject,
          text,
          html,
        }),
      });
      if (!r.ok) {
        const body = await r.text();
        return {
          ok: false,
          error: `resend:${r.status}:${body.slice(0, 200)}`,
        };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `resend:fetch:${(e as Error).message}` };
    }
  }

  return { ok: false, error: "no-email-provider-configured" };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isEmailProviderConfigured(): boolean {
  return (
    process.env.SENDGRID_API_KEY != null || process.env.RESEND_API_KEY != null
  );
}
