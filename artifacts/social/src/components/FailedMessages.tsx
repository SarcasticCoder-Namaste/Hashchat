import { useState } from "react";
import { AlertTriangle, RotateCw, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  removeFromOutbox,
  retryMessage,
  updateMessageContent,
  type QueuedMessage,
} from "@/lib/offlineQueue";

export function FailedMessages({ items }: { items: QueuedMessage[] }) {
  const [editing, setEditing] = useState<QueuedMessage | null>(null);
  const [draft, setDraft] = useState("");

  if (items.length === 0) return null;

  return (
    <div
      className="border-t border-destructive/30 bg-destructive/5 px-3 py-2"
      data-testid="failed-messages"
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
        <AlertTriangle className="h-3 w-3" />
        {items.length === 1
          ? "1 message didn't send"
          : `${items.length} messages didn't send`}
      </div>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-2 rounded-md border border-destructive/30 bg-card px-2.5 py-1.5"
            data-testid={`failed-message-${m.id}`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">
                {m.data.content ||
                  (m.data.imageUrl
                    ? "[image]"
                    : m.data.gifUrl
                      ? "[gif]"
                      : m.data.audioUrl
                        ? "[voice message]"
                        : "[message]")}
              </p>
              {m.lastError && (
                <p className="truncate text-[11px] text-muted-foreground">
                  {m.lastError}
                </p>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => retryMessage(m.id)}
              data-testid={`button-retry-${m.id}`}
              aria-label="Retry sending"
              title="Retry"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(m.data.content ?? "");
                setEditing(m);
              }}
              data-testid={`button-edit-${m.id}`}
              aria-label="Edit message"
              title="Edit"
              disabled={!!(m.data.imageUrl || m.data.gifUrl || m.data.audioUrl) && !m.data.content}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => removeFromOutbox(m.id)}
              data-testid={`button-delete-${m.id}`}
              aria-label="Delete message"
              title="Delete"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>

      <Dialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit message</DialogTitle>
            <DialogDescription>
              Update the message and we'll try sending it again.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            autoFocus
            data-testid="textarea-edit-failed-message"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!editing) return;
                const next = draft.trim();
                if (!next) return;
                updateMessageContent(editing.id, { content: next });
                setEditing(null);
              }}
              data-testid="button-save-failed-message"
            >
              Save & retry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
