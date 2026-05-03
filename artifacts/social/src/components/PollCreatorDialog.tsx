import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateRoomPoll,
  getGetRoomPollsQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";

const EXPIRY_OPTIONS = [
  { value: "0", label: "No expiration" },
  { value: "1", label: "1 hour" },
  { value: "6", label: "6 hours" },
  { value: "24", label: "1 day" },
  { value: "72", label: "3 days" },
  { value: "168", label: "1 week" },
];

const MODE_OPTIONS = [
  { value: "single", label: "Single choice" },
  { value: "multi", label: "Multi-select" },
  { value: "ranked", label: "Ranked choice" },
];

interface PollCreatorDialogProps {
  tag: string;
  trigger?: React.ReactNode;
}

export function PollCreatorDialog({ tag, trigger }: PollCreatorDialogProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [expiresHours, setExpiresHours] = useState("0");
  const [mode, setMode] = useState<"single" | "multi" | "ranked">("single");
  const [maxSelections, setMaxSelections] = useState("2");

  const create = useCreateRoomPoll({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetRoomPollsQueryKey(tag) });
        setOpen(false);
        setQuestion("");
        setOptions(["", ""]);
        setExpiresHours("0");
        setMode("single");
        setMaxSelections("2");
      },
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = options.map((o) => o.trim()).filter((o) => o.length > 0);
    if (!question.trim() || cleaned.length < 2) return;
    const hours = parseInt(expiresHours, 10);
    const expiresAt =
      hours > 0
        ? new Date(Date.now() + hours * 3600 * 1000).toISOString()
        : undefined;
    const ms = parseInt(maxSelections, 10);
    create.mutate({
      tag,
      data: {
        question: question.trim(),
        options: cleaned,
        mode,
        ...(mode === "multi"
          ? { maxSelections: Math.min(ms, cleaned.length) }
          : {}),
        ...(expiresAt ? { expiresAt } : {}),
      },
    });
  }

  const cleanedCount = options.filter((o) => o.trim()).length;
  const maxSelOptions = Array.from(
    { length: Math.max(2, Math.min(6, cleanedCount || 2) - 1) },
    (_, i) => String(i + 2),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" data-testid="button-open-poll-dialog">
            <Plus className="mr-1 h-3.5 w-3.5" /> New poll
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create a poll for #{tag}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="poll-question">Question</Label>
            <Input
              id="poll-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={200}
              placeholder="Ask the room…"
              data-testid="input-poll-question"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Options (2–6)</Label>
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={opt}
                  onChange={(e) => {
                    const next = [...options];
                    next[i] = e.target.value;
                    setOptions(next);
                  }}
                  maxLength={80}
                  placeholder={`Option ${i + 1}`}
                  data-testid={`input-poll-option-${i}`}
                />
                {options.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setOptions(options.filter((_, idx) => idx !== i))
                    }
                    aria-label="Remove option"
                    data-testid={`button-remove-poll-option-${i}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {options.length < 6 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOptions([...options, ""])}
                data-testid="button-add-poll-option"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add option
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="poll-mode">Voting mode</Label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as typeof mode)}
            >
              <SelectTrigger id="poll-mode" data-testid="select-poll-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {mode === "multi" && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="poll-max-selections">Max selectable</Label>
              <Select
                value={maxSelections}
                onValueChange={setMaxSelections}
              >
                <SelectTrigger
                  id="poll-max-selections"
                  data-testid="select-poll-max-selections"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {maxSelOptions.map((v) => (
                    <SelectItem key={v} value={v}>
                      Up to {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="poll-expires">Expires</Label>
            <Select value={expiresHours} onValueChange={setExpiresHours}>
              <SelectTrigger id="poll-expires" data-testid="select-poll-expires">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={
                create.isPending ||
                !question.trim() ||
                options.filter((o) => o.trim()).length < 2
              }
              data-testid="button-submit-poll"
            >
              {create.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Create poll
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
