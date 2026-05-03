import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SHORTCUTS } from "@/hooks/useKeyboardShortcuts";

function Key({ k }: { k: string }) {
  return (
    <kbd className="inline-flex min-w-[1.6rem] items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-mono font-semibold text-foreground">
      {k}
    </kbd>
  );
}

function KeyCombo({ keys }: { keys: string }) {
  const parts = keys.split(" ");
  return (
    <span className="inline-flex items-center gap-1">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          <Key k={p} />
          {i < parts.length - 1 && (
            <span className="text-[10px] text-muted-foreground">then</span>
          )}
        </span>
      ))}
    </span>
  );
}

export function ShortcutsCheatSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const groups = SHORTCUTS.reduce<Record<string, typeof SHORTCUTS>>(
    (acc, s) => {
      (acc[s.group] ||= []).push(s);
      return acc;
    },
    {},
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg"
        data-testid="dialog-shortcuts-cheatsheet"
      >
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press{" "}
            <kbd className="rounded border border-border bg-muted px-1 text-[11px] font-mono">
              ?
            </kbd>{" "}
            anytime to open this list. Shortcuts are disabled while typing.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group}
              </p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {items.map((s) => (
                  <li
                    key={s.keys}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="text-foreground">{s.description}</span>
                    <KeyCombo keys={s.keys} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
