import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMyReports,
  useAppealReport,
  getListMyReportsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Flag, Loader2, MessageSquareWarning } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  open: "Under review",
  resolved: "Action taken",
  dismissed: "No action taken",
};
const STATUS_TONE: Record<string, string> = {
  open: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  resolved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  dismissed: "bg-muted text-muted-foreground",
};

export function MyReportsPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const list = useListMyReports({
    query: {
      queryKey: getListMyReportsQueryKey(),
      refetchInterval: 30_000,
    },
  });
  const [appealId, setAppealId] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const appeal = useAppealReport({
    mutation: {
      onSuccess: () => {
        setAppealId(null);
        setReason("");
        qc.invalidateQueries({ queryKey: getListMyReportsQueryKey() });
        toast({ title: "Appeal submitted" });
      },
      onError: () =>
        toast({ title: "Couldn't file appeal", variant: "destructive" }),
    },
  });

  if (list.isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
      </div>
    );
  }
  const data = list.data ?? [];
  if (data.length === 0) {
    return (
      <div
        className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground"
        data-testid="my-reports-empty"
      >
        <Flag className="mb-2 h-5 w-5 text-muted-foreground/70" />
        You haven't filed any reports.
      </div>
    );
  }

  return (
    <ul className="space-y-3" data-testid="my-reports-list">
      {data.map((r) => {
        const tone = STATUS_TONE[r.status] ?? "bg-muted text-muted-foreground";
        return (
          <li
            key={r.id}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
            data-testid={`my-report-${r.id}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString()} · {r.scopeType} ·{" "}
                  {r.targetType} #{r.targetId}
                </p>
                <p className="mt-1 text-sm text-foreground">{r.reason}</p>
                {r.resolution && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Moderator note: {r.resolution}
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}
                data-testid={`my-report-status-${r.id}`}
              >
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
            </div>

            {r.appeal && (
              <div
                className="mt-3 rounded-lg border border-border bg-background p-3 text-xs"
                data-testid={`my-report-appeal-${r.id}`}
              >
                <p className="font-medium text-foreground">
                  Appeal:{" "}
                  <span className="font-normal text-muted-foreground">
                    {r.appeal.status === "open"
                      ? "Awaiting admin review"
                      : `Decided: ${r.appeal.decision ?? "—"}`}
                  </span>
                </p>
                <p className="mt-1 text-muted-foreground">{r.appeal.reason}</p>
                {r.appeal.decisionNote && (
                  <p className="mt-1 text-muted-foreground">
                    Admin note: {r.appeal.decisionNote}
                  </p>
                )}
              </div>
            )}

            {r.canAppeal && appealId !== r.id && (
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAppealId(r.id);
                    setReason("");
                  }}
                  data-testid={`button-open-appeal-${r.id}`}
                >
                  <MessageSquareWarning className="mr-1.5 h-3.5 w-3.5" />
                  Appeal to admin
                </Button>
              </div>
            )}

            {appealId === r.id && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value.slice(0, 500))}
                  rows={3}
                  placeholder="Tell admins why you think this decision should be reviewed."
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  data-testid={`input-appeal-reason-${r.id}`}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      appeal.mutate({ id: r.id, data: { reason: reason.trim() } })
                    }
                    disabled={reason.trim().length === 0 || appeal.isPending}
                    data-testid={`button-submit-appeal-${r.id}`}
                  >
                    {appeal.isPending && (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    )}
                    Submit appeal
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAppealId(null);
                      setReason("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
