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
import { sendEmail, escapeHtml } from "./email";

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
  // Scheduled DM delivery confirmations piggyback on DM prefs.
  scheduled_dm_delivered: { email: "emailDms", push: "pushDms" },
  scheduled_dm_failed: { email: "emailDms", push: "pushDms" },
  // Poll closing reminders piggyback on mention prefs.
  poll_closing: { email: "emailMentions", push: "pushMentions" },
  // Post impression milestones piggyback on mention preferences.
  post_milestone: { email: "emailMentions", push: "pushMentions" },
  // Moderation notifications use the mention pref slot for now.
  report_resolved: { email: "emailMentions", push: "pushMentions" },
  appeal_decided: { email: "emailMentions", push: "pushMentions" },
  moderation_action: { email: "emailMentions", push: "pushMentions" },
  mod_promoted: { email: "emailMentions", push: "pushMentions" },
  post_pinned: { email: "emailMentions", push: "pushMentions" },
  // Weekly leaderboard recaps piggyback on mention preferences.
  weekly_rank: { email: "emailMentions", push: "pushMentions" },
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
    case "scheduled_dm_delivered":
      return `Your scheduled DM was delivered on HashChat`;
    case "scheduled_dm_failed":
      return `Your scheduled DM could not be delivered on HashChat`;
    case "poll_closing":
      return `A poll you can vote in is closing soon on HashChat`;
    case "post_milestone":
      return `Your post hit a new milestone on HashChat`;
    case "report_resolved":
      return `Your HashChat report has an update`;
    case "appeal_decided":
      return `Your HashChat appeal has been decided`;
    case "moderation_action":
      return `Moderator action on your content`;
    case "mod_promoted":
      return `You're now a moderator`;
    case "post_pinned":
      return `${a} pinned your post`;
    case "weekly_rank":
      return `Your weekly hashtag rank on HashChat`;
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
  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));
  const webSubs = subs.filter((s) => s.kind !== "expo");
  if (!wp) {
    return { sent: 0, failed: 0, skipped: webSubs.length === 0 ? false : true };
  }
  let sent = 0;
  let failed = 0;
  for (const s of webSubs) {
    if (!s.p256dh || !s.auth) continue;
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

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

async function sendExpoPush(
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<{ sent: number; failed: number }> {
  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(
      and(
        eq(pushSubscriptionsTable.userId, userId),
        eq(pushSubscriptionsTable.kind, "expo"),
      ),
    );
  if (subs.length === 0) return { sent: 0, failed: 0 };

  const messages = subs.map((s) => ({
    to: s.endpoint,
    sound: "default" as const,
    title,
    body,
    data,
  }));

  try {
    const r = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
    if (!r.ok) {
      return { sent: 0, failed: subs.length };
    }
    const json = (await r.json()) as { data?: ExpoPushTicket[] };
    const tickets = json.data ?? [];
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < tickets.length; i += 1) {
      const t = tickets[i];
      const sub = subs[i];
      if (t?.status === "ok") {
        sent += 1;
      } else {
        failed += 1;
        const err = t?.details?.error;
        if (
          sub &&
          (err === "DeviceNotRegistered" || err === "InvalidCredentials")
        ) {
          try {
            await db
              .delete(pushSubscriptionsTable)
              .where(eq(pushSubscriptionsTable.id, sub.id));
          } catch {
            // ignore
          }
        }
      }
    }
    return { sent, failed };
  } catch {
    return { sent: 0, failed: subs.length };
  }
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
      const payload = {
        title: subject,
        body,
        url,
        kind: input.kind,
        notificationId: input.notificationId,
        targetType: input.targetType,
        targetId: input.targetId,
        targetTextId: input.targetTextId,
      };
      const [webResult, expoResult] = await Promise.all([
        sendBrowserPush(input.recipientId, payload),
        sendExpoPush(input.recipientId, subject, body, payload),
      ]);
      const result = {
        sent: webResult.sent + expoResult.sent,
        failed: webResult.failed + expoResult.failed,
        skipped: webResult.skipped && expoResult.sent === 0 && expoResult.failed === 0,
      };
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

