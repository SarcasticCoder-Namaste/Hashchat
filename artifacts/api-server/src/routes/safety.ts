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
} from "@workspace/api-zod";
import { checkContent } from "../lib/contentSafety";
import {
  generateTotpSecret,
  buildOtpauthUrl,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
  consumeBackupCode,
} from "../lib/totp";
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

router.get("/me/2fa", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const row = await getTwoFactor(me);
  res.json({
    enabled: !!row?.enabled,
    enabledAt: row?.enabledAt ? row.enabledAt.toISOString() : null,
    backupCodesRemaining: row?.backupCodesHash?.length ?? 0,
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
    if (!ok) {
      const r = consumeBackupCode(code, row.backupCodesHash);
      ok = r.ok;
      remaining = r.remaining;
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
