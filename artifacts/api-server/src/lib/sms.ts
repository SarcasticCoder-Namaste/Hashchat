export async function sendSms(
  to: string,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from =
    process.env.TWILIO_FROM_NUMBER ?? process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (sid && token && from) {
    try {
      const params = new URLSearchParams();
      params.set("To", to);
      params.set("Body", body);
      if (from.startsWith("MG")) {
        params.set("MessagingServiceSid", from);
      } else {
        params.set("From", from);
      }
      const r = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        },
      );
      if (!r.ok) {
        const text = await r.text();
        return {
          ok: false,
          error: `twilio:${r.status}:${text.slice(0, 200)}`,
        };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `twilio:fetch:${(e as Error).message}` };
    }
  }

  return { ok: false, error: "no-sms-provider-configured" };
}

export function isSmsProviderConfigured(): boolean {
  return (
    process.env.TWILIO_ACCOUNT_SID != null &&
    process.env.TWILIO_AUTH_TOKEN != null &&
    (process.env.TWILIO_FROM_NUMBER != null ||
      process.env.TWILIO_MESSAGING_SERVICE_SID != null)
  );
}

export function normalizePhoneNumber(input: string): string | null {
  const trimmed = input.trim().replace(/[\s().-]/g, "");
  if (!/^\+?[1-9]\d{6,14}$/.test(trimmed)) return null;
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}

export function maskPhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  const last4 = digits.slice(-4);
  const prefix = phone.startsWith("+") ? "+" : "";
  return `${prefix}${"•".repeat(Math.max(2, digits.length - 4))}${last4}`;
}
