import { Router, type IRouter, type Request } from "express";
import {
  db,
  reportsTable,
  reportAppealsTable,
  userTwoFactorTable,
  userSessionsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin, getUserId } from "../middlewares/requireAuth";
import {
  CheckModerationBody,
  AppealReportBody,
  DecideAppealBody,
  EnableMyTwoFactorBody,
  DisableMyTwoFactorBody,
  EnrollMyTwoFactorEmailBody,
  ConfirmMyTwoFactorEmailBody,
} from "@workspace/api-zod";
import { checkContent } from "../lib/contentSafety";
import {
  generateTotpSecret,
  buildOtpauthUrl,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
  consumeBackupCode,
  generateEmailOtp,
  hashEmailOtp,
} from "../lib/totp";
import { sendEmail, escapeHtml } from "../lib/email";
import {
  getCurrentClerkSessionId,
  revokeUserSession,
} from "../lib/sessionTracker";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

function intParam(req: Request, key: string): number | null {
  const raw = Array.isArray(req.params[key])
    ? req.params[key][0]
    : req.params[key];
  const n = parseInt(String(raw), 10);
  return Number.isNaN(n) ? null : n;
}

// ---------- Pre-post safety check ----------

router.post(
  "/moderation/check",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = CheckModerationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const result = await checkContent(parsed.data.text);
    res.json(result);
  },
);

// ---------- My reports & appeals ----------

router.get("/me/reports", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const rows = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.reporterId, me))
    .orderBy(desc(reportsTable.createdAt))
    .limit(100);
  if (rows.length === 0) {
    res.json([]);
    return;
  }
  const ids = rows.map((r) => r.id);
  const appeals = await db
    .select()
    .from(reportAppealsTable)
    .where(inArray(reportAppealsTable.reportId, ids));
  const appealByReport = new Map(appeals.map((a) => [a.reportId, a]));
  res.json(
    rows.map((r) => {
      const a = appealByReport.get(r.id);
      const status = r.status as "open" | "resolved" | "dismissed";
      return {
        id: r.id,
        scopeType: r.scopeType,
        scopeKey: r.scopeKey,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        status,
        resolution: r.resolution,
        resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        appeal: a
          ? {
              id: a.id,
              reportId: a.reportId,
              requesterId: a.requesterId,
              reason: a.reason,
              status: a.status,
              decision: a.decision,
              decisionNote: a.decisionNote,
              decidedBy: a.decidedBy,
              decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null,
              createdAt: a.createdAt.toISOString(),
              report: null,
            }
          : null,
        canAppeal:
          (status === "resolved" || status === "dismissed") && !a,
      };
    }),
  );
});

router.post(
  "/reports/:id/appeal",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = intParam(req, "id");
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = AppealReportBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const me = getUserId(req);
    const [report] = await db
      .select()
      .from(reportsTable)
      .where(eq(reportsTable.id, id))
      .limit(1);
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    if (report.reporterId !== me) {
      res.status(403).json({ error: "You can only appeal your own reports" });
      return;
    }
    if (report.status === "open") {
      res.status(409).json({ error: "Report is still under review" });
      return;
    }
    const [existing] = await db
      .select()
      .from(reportAppealsTable)
      .where(eq(reportAppealsTable.reportId, id))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "Appeal already filed" });
      return;
    }
    const [created] = await db
      .insert(reportAppealsTable)
      .values({
        reportId: id,
        requesterId: me,
        reason: parsed.data.reason,
      })
      .returning();
    res.json({
      id: created.id,
      reportId: created.reportId,
      requesterId: created.requesterId,
      reason: created.reason,
      status: created.status,
      decision: created.decision,
      decisionNote: created.decisionNote,
      decidedBy: created.decidedBy,
      decidedAt: null,
      createdAt: created.createdAt.toISOString(),
      report: null,
    });
  },
);

router.get(
  "/admin/appeals",
  requireAuth,
  requireAdmin,
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(reportAppealsTable)
      .where(eq(reportAppealsTable.status, "open"))
      .orderBy(desc(reportAppealsTable.createdAt))
      .limit(200);
    if (rows.length === 0) {
      res.json([]);
      return;
    }
    const reportIds = rows.map((r) => r.reportId);
    const reports = await db
      .select()
      .from(reportsTable)
      .where(inArray(reportsTable.id, reportIds));
    const rmap = new Map(reports.map((r) => [r.id, r]));
    res.json(
      rows.map((a) => {
        const r = rmap.get(a.reportId);
        return {
          id: a.id,
          reportId: a.reportId,
          requesterId: a.requesterId,
          reason: a.reason,
          status: a.status,
          decision: a.decision,
          decisionNote: a.decisionNote,
          decidedBy: a.decidedBy,
          decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null,
          createdAt: a.createdAt.toISOString(),
          report: r
            ? {
                id: r.id,
                scopeType: r.scopeType,
                scopeKey: r.scopeKey,
                targetType: r.targetType,
                targetId: r.targetId,
                reason: r.reason,
                status: r.status,
                reporter: null,
                targetSnippet: null,
                targetAuthorName: null,
                resolvedBy: r.resolvedBy,
                resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
                resolution: r.resolution,
                createdAt: r.createdAt.toISOString(),
              }
            : null,
        };
      }),
    );
  },
);

router.post(
  "/appeals/:id/decide",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = intParam(req, "id");
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = DecideAppealBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const me = getUserId(req);
    const [appeal] = await db
      .select()
      .from(reportAppealsTable)
      .where(eq(reportAppealsTable.id, id))
      .limit(1);
    if (!appeal) {
      res.status(404).json({ error: "Appeal not found" });
      return;
    }
    if (appeal.status !== "open") {
      res.status(409).json({ error: "Appeal already decided" });
      return;
    }
    const now = new Date();
    await db
      .update(reportAppealsTable)
      .set({
        status: "decided",
        decision: parsed.data.decision,
        decisionNote: parsed.data.note ?? null,
        decidedBy: me,
        decidedAt: now,
      })
      .where(eq(reportAppealsTable.id, id));

    // If the appeal was upheld → reopen the original report so mods can act.
    if (parsed.data.decision === "overturned") {
      await db
        .update(reportsTable)
        .set({
          status: "open",
          resolvedAt: null,
          resolvedBy: null,
          resolution: `Reopened after appeal overturned by admin (${me}).`,
        })
        .where(eq(reportsTable.id, appeal.reportId));
    }

    const decisionLabel =
      parsed.data.decision === "overturned" ? "overturned" : "upheld";
    const note = parsed.data.note?.trim();
    const appealSnippet = note
      ? `Your appeal was ${decisionLabel}. Admin note: ${note}`
      : `Your appeal was ${decisionLabel}.`;
    await createNotification({
      recipientId: appeal.requesterId,
      actorId: me,
      kind: "appeal_decided",
      targetType: "report",
      targetId: appeal.reportId,
      snippet: appealSnippet,
    });

    const [refreshed] = await db
      .select()
      .from(reportAppealsTable)
      .where(eq(reportAppealsTable.id, id))
      .limit(1);
    res.json({
      id: refreshed.id,
      reportId: refreshed.reportId,
      requesterId: refreshed.requesterId,
      reason: refreshed.reason,
      status: refreshed.status,
      decision: refreshed.decision,
      decisionNote: refreshed.decisionNote,
      decidedBy: refreshed.decidedBy,
      decidedAt: refreshed.decidedAt ? refreshed.decidedAt.toISOString() : null,
      createdAt: refreshed.createdAt.toISOString(),
      report: null,
    });
  },
);

// ---------- 2FA ----------

async function getTwoFactor(userId: string) {
  const [row] = await db
    .select()
    .from(userTwoFactorTable)
    .where(eq(userTwoFactorTable.userId, userId))
    .limit(1);
  return row ?? null;
}

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 1) return email;
  const name = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = name.slice(0, Math.min(2, name.length));
  const masked =
    name.length <= 2 ? `${head}*` : `${head}${"*".repeat(Math.max(1, name.length - 2))}`;
  return `${masked}@${domain}`;
}

router.get("/me/2fa", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const row = await getTwoFactor(me);
  res.json({
    enabled: !!row?.enabled,
    enabledAt: row?.enabledAt ? row.enabledAt.toISOString() : null,
    backupCodesRemaining: row?.backupCodesHash?.length ?? 0,
    emailEnabled: !!row?.emailEnabled,
    emailEnabledAt: row?.emailEnabledAt
      ? row.emailEnabledAt.toISOString()
      : null,
    emailAddress: row?.emailEnabled ? maskEmail(row.emailAddress) : null,
  });
});

router.post("/me/2fa/setup", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const [user] = await db
    .select({ username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.id, me))
    .limit(1);
  const secret = generateTotpSecret();
  await db
    .insert(userTwoFactorTable)
    .values({
      userId: me,
      secret,
      enabled: false,
      backupCodesHash: [],
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userTwoFactorTable.userId,
      set: { secret, enabled: false, enabledAt: null, updatedAt: new Date() },
    });
  res.json({
    secret,
    otpauthUrl: buildOtpauthUrl(user?.username ?? me, secret),
  });
});

router.post("/me/2fa/enable", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const parsed = EnableMyTwoFactorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const row = await getTwoFactor(me);
  if (!row) {
    res.status(409).json({ error: "Run setup first" });
    return;
  }
  if (!verifyTotp(row.secret, parsed.data.code)) {
    res.status(400).json({ error: "Invalid code" });
    return;
  }
  const codes = generateBackupCodes(8);
  const hashes = codes.map(hashBackupCode);
  const now = new Date();
  await db
    .update(userTwoFactorTable)
    .set({
      enabled: true,
      enabledAt: now,
      backupCodesHash: hashes,
      updatedAt: now,
    })
    .where(eq(userTwoFactorTable.userId, me));
  res.json({ enabled: true, backupCodes: codes });
});

router.post(
  "/me/2fa/disable",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const parsed = DisableMyTwoFactorBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const row = await getTwoFactor(me);
    if (!row || !row.enabled) {
      res.json({ ok: true });
      return;
    }
    const code = parsed.data.code;
    let ok = verifyTotp(row.secret, code);
    let remaining = row.backupCodesHash;
    let consumedEmailCode = false;
    if (!ok) {
      const r = consumeBackupCode(code, row.backupCodesHash);
      ok = r.ok;
      remaining = r.remaining;
    }
    if (!ok) {
      // Try email-delivered code as a backup factor
      const emailOk = checkPendingEmailCode(row, code, "auth");
      if (emailOk) {
        ok = true;
        consumedEmailCode = true;
      }
    }
    if (!ok) {
      res.status(400).json({ error: "Invalid code" });
      return;
    }
    await db
      .update(userTwoFactorTable)
      .set({
        enabled: false,
        enabledAt: null,
        backupCodesHash: remaining,
        ...(consumedEmailCode
          ? {
              pendingEmailCodeHash: null,
              pendingEmailCodeExpiresAt: null,
              pendingEmailCodePurpose: null,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(userTwoFactorTable.userId, me));
    res.json({ ok: true });
  },
);

// ---------- 2FA email backup factor ----------

const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_RESEND_COOLDOWN_MS = 30 * 1000;

function checkPendingEmailCode(
  row: {
    pendingEmailCodeHash: string | null;
    pendingEmailCodeExpiresAt: Date | null;
    pendingEmailCodePurpose: string | null;
  },
  code: string,
  expectedPurpose: "enroll" | "auth",
): boolean {
  if (
    !row.pendingEmailCodeHash ||
    !row.pendingEmailCodeExpiresAt ||
    row.pendingEmailCodePurpose !== expectedPurpose
  ) {
    return false;
  }
  if (row.pendingEmailCodeExpiresAt.getTime() < Date.now()) return false;
  return hashEmailOtp(code) === row.pendingEmailCodeHash;
}

function emailCodeBody(code: string, purpose: "enroll" | "auth"): {
  subject: string;
  text: string;
  html: string;
} {
  const subject =
    purpose === "enroll"
      ? "Confirm your HashChat email backup code"
      : "Your HashChat sign-in code";
  const intro =
    purpose === "enroll"
      ? "Use this code to confirm email as a backup two-factor method on HashChat."
      : "Use this code to sign in or disable two-factor authentication on HashChat.";
  const text = `${intro}\n\nYour code: ${code}\n\nThis code expires in 10 minutes and can only be used once. If you didn't request it, you can ignore this email.`;
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, sans-serif;">
      <h2 style="color:#7c3aed;">${escapeHtml(subject)}</h2>
      <p style="color:#374151;">${escapeHtml(intro)}</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:700;color:#111827;background:#f3f4f6;padding:14px 18px;border-radius:8px;display:inline-block;">${escapeHtml(code)}</p>
      <p style="color:#6b7280;font-size:12px;">This code expires in 10 minutes and can only be used once. If you didn't request it, you can ignore this email.</p>
    </div>`;
  return { subject, text, html };
}

async function issueEmailCode(
  userId: string,
  emailAddress: string,
  purpose: "enroll" | "auth",
  pendingEmailAddress: string | null,
): Promise<
  | { ok: true; expiresAt: Date }
  | { ok: false; status: number; error: string }
> {
  const code = generateEmailOtp();
  const codeHash = hashEmailOtp(code);
  const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS);
  const { subject, text, html } = emailCodeBody(code, purpose);
  const r = await sendEmail(emailAddress, subject, text, html);
  if (!r.ok) {
    return {
      ok: false,
      status: 502,
      error:
        r.error === "no-email-provider-configured"
          ? "Email is not configured on this server"
          : "Could not send email right now",
    };
  }
  await db
    .update(userTwoFactorTable)
    .set({
      pendingEmailCodeHash: codeHash,
      pendingEmailCodeExpiresAt: expiresAt,
      pendingEmailCodePurpose: purpose,
      pendingEmailAddress,
      updatedAt: new Date(),
    })
    .where(eq(userTwoFactorTable.userId, userId));
  return { ok: true, expiresAt };
}

async function ensureTwoFactorRow(userId: string): Promise<void> {
  await db
    .insert(userTwoFactorTable)
    .values({
      userId,
      secret: generateTotpSecret(),
      enabled: false,
      backupCodesHash: [],
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: userTwoFactorTable.userId });
}

router.post(
  "/me/2fa/email/enroll",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const parsed = EnrollMyTwoFactorEmailBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const email = parsed.data.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Invalid email address" });
      return;
    }
    await ensureTwoFactorRow(me);
    const existing = await getTwoFactor(me);
    if (
      existing?.pendingEmailCodeExpiresAt &&
      existing.pendingEmailCodePurpose === "enroll" &&
      existing.pendingEmailAddress === email &&
      existing.pendingEmailCodeExpiresAt.getTime() - EMAIL_CODE_TTL_MS >
        Date.now() - EMAIL_RESEND_COOLDOWN_MS
    ) {
      res.status(429).json({ error: "Please wait before requesting another code" });
      return;
    }
    const r = await issueEmailCode(me, email, "enroll", email);
    if (!r.ok) {
      res.status(r.status).json({ error: r.error });
      return;
    }
    res.json({
      sent: true,
      expiresAt: r.expiresAt.toISOString(),
      emailAddress: maskEmail(email) ?? email,
    });
  },
);

router.post(
  "/me/2fa/email/confirm",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const parsed = ConfirmMyTwoFactorEmailBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const row = await getTwoFactor(me);
    if (!row || !row.pendingEmailAddress) {
      res.status(409).json({ error: "Start email enrollment first" });
      return;
    }
    if (!checkPendingEmailCode(row, parsed.data.code, "enroll")) {
      res.status(400).json({ error: "Invalid or expired code" });
      return;
    }
    const now = new Date();
    await db
      .update(userTwoFactorTable)
      .set({
        emailAddress: row.pendingEmailAddress,
        emailEnabled: true,
        emailEnabledAt: now,
        pendingEmailCodeHash: null,
        pendingEmailCodeExpiresAt: null,
        pendingEmailCodePurpose: null,
        pendingEmailAddress: null,
        updatedAt: now,
      })
      .where(eq(userTwoFactorTable.userId, me));
    res.json({ ok: true });
  },
);

router.post(
  "/me/2fa/email/send",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const row = await getTwoFactor(me);
    if (!row || !row.emailEnabled || !row.emailAddress) {
      res.status(409).json({ error: "Email backup is not enrolled" });
      return;
    }
    if (
      row.pendingEmailCodeExpiresAt &&
      row.pendingEmailCodePurpose === "auth" &&
      row.pendingEmailCodeExpiresAt.getTime() - EMAIL_CODE_TTL_MS >
        Date.now() - EMAIL_RESEND_COOLDOWN_MS
    ) {
      res.status(429).json({ error: "Please wait before requesting another code" });
      return;
    }
    const r = await issueEmailCode(me, row.emailAddress, "auth", null);
    if (!r.ok) {
      res.status(r.status).json({ error: r.error });
      return;
    }
    res.json({
      sent: true,
      expiresAt: r.expiresAt.toISOString(),
      emailAddress: maskEmail(row.emailAddress) ?? row.emailAddress,
    });
  },
);

// ---------- Brute-force protection for public recovery ----------

const MAX_VERIFY_FAILURES = 5;
const RECOVERY_LOCKOUT_MS = 15 * 60 * 1000;
const IP_WINDOW_MS = 5 * 60 * 1000;
const IP_MAX_CHALLENGE = 5;
const IP_MAX_VERIFY = 10;

interface IpBucket {
  resetAt: number;
  challenge: number;
  verify: number;
}
const ipBuckets = new Map<string, IpBucket>();

function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

function takeIpToken(
  ip: string,
  kind: "challenge" | "verify",
): boolean {
  const now = Date.now();
  let b = ipBuckets.get(ip);
  if (!b || b.resetAt < now) {
    b = { resetAt: now + IP_WINDOW_MS, challenge: 0, verify: 0 };
    ipBuckets.set(ip, b);
  }
  if (kind === "challenge") {
    if (b.challenge >= IP_MAX_CHALLENGE) return false;
    b.challenge += 1;
  } else {
    if (b.verify >= IP_MAX_VERIFY) return false;
    b.verify += 1;
  }
  return true;
}

// Best-effort cleanup so the in-memory map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of ipBuckets) {
    if (v.resetAt < now) ipBuckets.delete(k);
  }
}, IP_WINDOW_MS).unref?.();

// ---------- Public sign-in recovery via email-delivered code ----------
//
// These endpoints intentionally do NOT use requireAuth: they exist so a user
// who is locked out (no authenticator, no backup codes left) can recover
// without admin intervention. Successful verification clears the pending code
// (single-use) AND turns off TOTP enforcement so the user can sign in with
// their primary credentials and re-enroll.
//
// To resist account enumeration the response shape never reveals whether the
// username exists or whether email backup is enrolled.

router.post(
  "/auth/2fa/email/challenge",
  async (req, res): Promise<void> => {
    if (!takeIpToken(clientIp(req), "challenge")) {
      // Generic response so we don't leak rate-limit state to attackers
      // probing usernames; legitimate users rarely hit this in 5 minutes.
      res.status(429).json({ sent: true, error: "Too many requests" });
      return;
    }
    const username =
      typeof req.body?.username === "string"
        ? req.body.username.trim().toLowerCase()
        : "";
    if (!username || username.length > 64) {
      res.json({ sent: true });
      return;
    }
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);
    if (!user) {
      res.json({ sent: true });
      return;
    }
    const row = await getTwoFactor(user.id);
    if (!row || !row.enabled || !row.emailEnabled || !row.emailAddress) {
      res.json({ sent: true });
      return;
    }
    if (
      row.recoveryLockedUntil &&
      row.recoveryLockedUntil.getTime() > Date.now()
    ) {
      // Account is in cool-down after too many failures; respond generically.
      res.json({ sent: true });
      return;
    }
    if (
      row.pendingEmailCodeExpiresAt &&
      row.pendingEmailCodePurpose === "auth" &&
      row.pendingEmailCodeExpiresAt.getTime() - EMAIL_CODE_TTL_MS >
        Date.now() - EMAIL_RESEND_COOLDOWN_MS
    ) {
      res.json({ sent: true });
      return;
    }
    await issueEmailCode(user.id, row.emailAddress, "auth", null);
    // A fresh challenge resets prior failure counter for this user.
    await db
      .update(userTwoFactorTable)
      .set({ pendingEmailFailedAttempts: 0 })
      .where(eq(userTwoFactorTable.userId, user.id));
    res.json({ sent: true });
  },
);

router.post(
  "/auth/2fa/email/verify",
  async (req, res): Promise<void> => {
    if (!takeIpToken(clientIp(req), "verify")) {
      res.status(429).json({ error: "Too many attempts. Try again later." });
      return;
    }
    const username =
      typeof req.body?.username === "string"
        ? req.body.username.trim().toLowerCase()
        : "";
    const code =
      typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!username || !/^\d{6}$/.test(code.replace(/\s+/g, ""))) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);
    if (!user) {
      res.status(400).json({ error: "Invalid or expired code" });
      return;
    }
    const row = await getTwoFactor(user.id);
    if (!row || !row.enabled || !row.emailEnabled) {
      res.status(400).json({ error: "Invalid or expired code" });
      return;
    }
    if (
      row.recoveryLockedUntil &&
      row.recoveryLockedUntil.getTime() > Date.now()
    ) {
      res.status(429).json({ error: "Too many attempts. Try again later." });
      return;
    }
    if (!checkPendingEmailCode(row, code, "auth")) {
      // Track failed attempts; lock and invalidate the pending challenge after
      // MAX_VERIFY_FAILURES bad guesses.
      const nextAttempts = (row.pendingEmailFailedAttempts ?? 0) + 1;
      const shouldLock = nextAttempts >= MAX_VERIFY_FAILURES;
      await db
        .update(userTwoFactorTable)
        .set({
          pendingEmailFailedAttempts: shouldLock ? 0 : nextAttempts,
          ...(shouldLock
            ? {
                pendingEmailCodeHash: null,
                pendingEmailCodeExpiresAt: null,
                pendingEmailCodePurpose: null,
                recoveryLockedUntil: new Date(Date.now() + RECOVERY_LOCKOUT_MS),
              }
            : {}),
        })
        .where(eq(userTwoFactorTable.userId, user.id));
      req.log?.warn?.(
        { userId: user.id, attempts: nextAttempts, locked: shouldLock },
        "2fa email recovery: verification failed",
      );
      if (shouldLock) {
        res.status(429).json({ error: "Too many attempts. Try again later." });
        return;
      }
      res.status(400).json({ error: "Invalid or expired code" });
      return;
    }
    // Atomically consume the code (single-use) AND drop the TOTP gate so the
    // user can finish signing in normally. We scope the update by the current
    // pending hash so a parallel use can only succeed once.
    const codeHash = hashEmailOtp(code);
    const updated = await db
      .update(userTwoFactorTable)
      .set({
        enabled: false,
        enabledAt: null,
        pendingEmailCodeHash: null,
        pendingEmailCodeExpiresAt: null,
        pendingEmailCodePurpose: null,
        pendingEmailAddress: null,
        pendingEmailFailedAttempts: 0,
        recoveryLockedUntil: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userTwoFactorTable.userId, user.id),
          eq(userTwoFactorTable.pendingEmailCodeHash, codeHash),
        ),
      )
      .returning({ userId: userTwoFactorTable.userId });
    if (updated.length === 0) {
      res.status(400).json({ error: "Invalid or expired code" });
      return;
    }
    res.json({ ok: true });
  },
);

router.post(
  "/me/2fa/email/remove",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    await db
      .update(userTwoFactorTable)
      .set({
        emailAddress: null,
        emailEnabled: false,
        emailEnabledAt: null,
        pendingEmailCodeHash: null,
        pendingEmailCodeExpiresAt: null,
        pendingEmailCodePurpose: null,
        pendingEmailAddress: null,
        updatedAt: new Date(),
      })
      .where(eq(userTwoFactorTable.userId, me));
    res.json({ ok: true });
  },
);

// ---------- Sessions ----------

router.get("/me/sessions", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const current = getCurrentClerkSessionId(req);
  const rows = await db
    .select()
    .from(userSessionsTable)
    .where(eq(userSessionsTable.userId, me))
    .orderBy(desc(userSessionsTable.lastSeenAt))
    .limit(50);
  res.json(
    rows.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      deviceLabel: r.deviceLabel,
      userAgent: r.userAgent,
      ipRegion: r.ipRegion,
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
      revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
      current: current !== null && current === r.sessionId,
    })),
  );
});

router.post(
  "/me/sessions/:id/revoke",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = intParam(req, "id");
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    const r = await revokeUserSession(me, id);
    if (!r.ok) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ ok: true });
  },
);

export default router;
