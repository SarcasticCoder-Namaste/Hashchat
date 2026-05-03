import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useScheduleConversationMessage,
  getGetMyScheduledMessagesQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationId: number;
  content: string;
  replyToId: number | null;
  onScheduled: () => void;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function defaultLocalDateTime(): { date: string; time: string } {
  const d = new Date(Date.now() + 30 * 60 * 1000);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function ScheduleDmDialog({
  open,
  onOpenChange,
  conversationId,
  content,
  replyToId,
  onScheduled,
}: Props) {
  const qc = useQueryClient();
  const initial = useMemo(defaultLocalDateTime, []);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const next = defaultLocalDateTime();
      setDate(next.date);
      setTime(next.time);
      setError(null);
    }
  }, [open]);

  const schedule = useScheduleConversationMessage({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetMyScheduledMessagesQueryKey() });
        onScheduled();
        onOpenChange(false);
      },
      onError: (err) => {
        const msg = err instanceof Error ? err.message : "Failed to schedule";
        setError(msg);
      },
    },
  });

  const trimmed = content.trim();
  const minLocal = useMemo(() => {
    const d = new Date(Date.now() + 60 * 1000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!trimmed) {
      setError("Type a message before scheduling.");
      return;
    }
    if (!date || !time) {
      setError("Pick a date and time.");
      return;
    }
    const local = new Date(`${date}T${time}`);
    if (Number.isNaN(local.getTime())) {
      setError("Invalid date/time.");
      return;
    }
    if (local.getTime() <= Date.now() + 30_000) {
      setError("Pick a time at least a minute in the future.");
      return;
    }
    schedule.mutate({
      id: conversationId,
      data: {
        content: trimmed,
        scheduledFor: local.toISOString(),
        replyToId: replyToId ?? null,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Schedule message</DialogTitle>
          <DialogDescription>
            We'll send this DM at the time you choose, even if you're offline.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Message</p>
            <p
              className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words"
              data-testid="text-schedule-preview"
            >
              {trimmed || (
                <span className="italic text-muted-foreground">
                  Type a message in the composer first.
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="schedule-date">Date</Label>
              <Input
                id="schedule-date"
                type="date"
                value={date}
                min={minLocal.slice(0, 10)}
                onChange={(e) => setDate(e.target.value)}
                data-testid="input-schedule-date"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="schedule-time">Time</Label>
              <Input
                id="schedule-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                data-testid="input-schedule-time"
              />
            </div>
          </div>
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={schedule.isPending || !trimmed}
              data-testid="button-confirm-schedule"
            >
              {schedule.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Schedule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
