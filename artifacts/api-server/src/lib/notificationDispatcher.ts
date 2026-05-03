import {
  db,
  notificationDeliveriesTable,
  pushSubscriptionsTable,
  userPreferencesTable,
  usersTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { NotificationKind } from "./notifications";
import { buildHref } from "./notifications";

interface DispatchInput {
  notificationId: number;
  recipientId: string;
  kind: NotificationKind;
  actorName?: string | null;
  snippet?: string | null;
  targetType: string | null;
  targetId: number | null;
  targetTextId: string | null;
}

const PREF_KEY_BY_KIND: Record<
  NotificationKind,
  { email: keyof typeof EMAIL_FIELDS; push: keyof typeof PUSH_FIELDS }
> = {
  mention: { email: "emailMentions", push: "pushMentions" },
  reply: { email: "emailReplies", push: "pushReplies" },
  reaction: { email: "emailReactions", push: "pushReactions" },
  follow: { email: "emailFollows", push: "pushFollows" },
  dm: { email: "emailDms", push: "pushDms" },
  // Event reminders piggyback on mention preferences for now.
  event_starting: { email: "emailMentions", push: "pushMentions" },
  // Scheduled post publication notifications piggyback on mention prefs.
  scheduled_post_published: { email: "emailMentions", push: "pushMentions" },
  // Poll closing reminders piggyback on mention prefs.
  poll_closing: { email: "emailMentions", push: "pushMentions" },
};

const EMAIL_FIELDS = {
  emailMentions: true,
  emailReplies: true,
  emailDms: true,
  emailFollows: true,
  emailReactions: true,
} as const;
const PUSH_FIELDS = {
  pushMentions: true,
  pushReplies: true,
  pushDms: true,
  pushFollows: true,
  pushReactions: true,
} as const;

function titleFor(kind: NotificationKind, actor: string | null): string {
  const a = actor ?? "Someone";
  switch (kind) {
    case "mention":
      return `${a} mentioned you on HashChat`;
    case "reply":
      return `${a} replied to you on HashChat`;
    case "reaction":
      return `${a} reacted to your message`;
    case "follow":
      return `${a} started following you`;
    case "dm":
      return `New message from ${a}`;
    case "event_starting":
      return `Event starting soon on HashChat`;
    case "scheduled_post_published":
      return `Your scheduled post is now live on HashChat`;
    case "poll_closing":
      return `A poll you can vote in is closing soon on HashChat`;
  }
}

async function recordDelivery(
  notificationId: number,
  userId: string,
  channel: "email" | "push",
  status: "sent" | "skipped" | "failed",
  error: string | null = null,
): Promise<void> {
  try {
    await db.insert(notificationDeliveriesTable).values({
      notificationId,
      userId,
      channel,
      status,
      error,
    });
  } catch {
    // best effort
  }
}

async function sendEmail(
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
        return { ok: false, error: `sendgrid:${r.status}:${body.slice(0, 200)}` };
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
        return { ok: false, error: `resend:${r.status}:${body.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `resend:fetch:${(e as Error).message}` };
    }
  }

  return { ok: false, error: "no-email-provider-configured" };
}

let webPushModule:
  | typeof import("web-push")
  | null
  | undefined = undefined;

async function getWebPush() {
  if (webPushModule !== undefined) return webPushModule;
  try {
    const mod = await import("web-push");
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subject =
      process.env.VAPID_SUBJECT ?? "mailto:no-reply@hashchat.app";
    if (pub && priv) {
      mod.setVapidDetails(subject, pub, priv);
      webPushModule = mod;
      return mod;
    }
    webPushModule = null;
    return null;
  } catch {
    webPushModule = null;
    return null;
  }
}

async function sendBrowserPush(
  userId: string,
  payload: Record<string, unknown>,
): Promise<{ sent: number; failed: number; skipped: boolean }> {
  const wp = await getWebPush();
  if (!wp) {
    return { sent: 0, failed: 0, skipped: true };
  }
  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));
  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    try {
      await wp.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        },
        JSON.stringify(payload),
      );
      sent += 1;
    } catch (e) {
      failed += 1;
      const status = (e as { statusCode?: number }).statusCode;
      // Clean up dead subscriptions
      if (status === 404 || status === 410) {
        try {
          await db
            .delete(pushSubscriptionsTable)
            .where(eq(pushSubscriptionsTable.id, s.id));
        } catch {
          // ignore
        }
      }
    }
  }
  return { sent, failed, skipped: false };
}

export async function dispatchNotification(input: DispatchInput): Promise<void> {
  try {
    const [prefs] = await db
      .select()
      .from(userPreferencesTable)
      .where(eq(userPreferencesTable.userId, input.recipientId))
      .limit(1);
    const [user] = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
      })
      .from(usersTable)
      .where(eq(usersTable.id, input.recipientId))
      .limit(1);
    if (!user) return;

    const channelKeys = PREF_KEY_BY_KIND[input.kind];
    const wantEmail = prefs ? !!(prefs as any)[channelKeys.email] : false;
    const wantPush = prefs ? !!(prefs as any)[channelKeys.push] : true;

    const subject = titleFor(input.kind, input.actorName ?? null);
    const body = input.snippet ?? "Open HashChat to see what's new.";
    const href = buildHref(input.targetType, input.targetId, input.targetTextId);
    const baseUrl =
      process.env.PUBLIC_APP_URL ??
      process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "";
    const url = href ? `${baseUrl}/social${href}` : baseUrl || "";

    // EMAIL
    if (wantEmail) {
      const recipientEmail = (prefs as any)?.emailAddress as string | null;
      if (!recipientEmail) {
        await recordDelivery(
          input.notificationId,
          input.recipientId,
          "email",
          "skipped",
          "no-email-address",
        );
      } else {
        const text = `${subject}\n\n${body}\n\n${url}`;
        const html = `
          <div style="font-family: ui-sans-serif, system-ui, sans-serif;">
            <h2 style="color:#7c3aed;">${escapeHtml(subject)}</h2>
            <p style="color:#374151;">${escapeHtml(body)}</p>
            ${url ? `<p><a style="color:#7c3aed;" href="${escapeHtml(url)}">Open HashChat</a></p>` : ""}
            <hr/>
            <p style="font-size:12px;color:#6b7280;">You can change which emails you receive in HashChat → Settings → Notifications.</p>
          </div>`;
        const r = await sendEmail(recipientEmail, subject, text, html);
        if (r.ok) {
          await recordDelivery(
            input.notificationId,
            input.recipientId,
            "email",
            "sent",
          );
        } else {
          await recordDelivery(
            input.notificationId,
            input.recipientId,
            "email",
            "failed",
            r.error,
          );
        }
      }
    } else {
      await recordDelivery(
        input.notificationId,
        input.recipientId,
        "email",
        "skipped",
        "preference-off",
      );
    }

    // PUSH
    if (wantPush) {
      const result = await sendBrowserPush(input.recipientId, {
        title: subject,
        body,
        url,
        kind: input.kind,
        notificationId: input.notificationId,
      });
      if (result.skipped) {
        await recordDelivery(
          input.notificationId,
          input.recipientId,
          "push",
          "skipped",
          "vapid-not-configured",
        );
      } else if (result.sent > 0) {
        await recordDelivery(
          input.notificationId,
          input.recipientId,
          "push",
          "sent",
          result.failed > 0 ? `partial:${result.failed}-failed` : null,
        );
      } else if (result.failed > 0) {
        await recordDelivery(
          input.notificationId,
          input.recipientId,
          "push",
          "failed",
          `all-failed:${result.failed}`,
        );
      } else {
        await recordDelivery(
          input.notificationId,
          input.recipientId,
          "push",
          "skipped",
          "no-subscriptions",
        );
      }
    } else {
      await recordDelivery(
        input.notificationId,
        input.recipientId,
        "push",
        "skipped",
        "preference-off",
      );
    }
  } catch {
    // Never fail the request because of dispatch
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
