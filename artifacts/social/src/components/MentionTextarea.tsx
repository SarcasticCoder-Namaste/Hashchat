import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import {
  useGetMentionSuggestions,
  getGetMentionSuggestionsQueryKey,
} from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Variant = "input" | "textarea";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  variant?: Variant;
  rows?: number;
  onSubmit?: () => void;
  testId?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onUserActivity?: () => void;
}

export type MentionFieldHandle = {
  focus: () => void;
};

export const MentionTextarea = forwardRef<MentionFieldHandle, Props>(
  function MentionTextarea(
    {
      value,
      onChange,
      placeholder,
      className,
      variant = "input",
      rows = 3,
      onSubmit,
      testId,
      disabled,
      autoFocus,
      onUserActivity,
    },
    ref,
  ) {
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(
      null,
    );
    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [highlight, setHighlight] = useState(0);
    const [tokenStart, setTokenStart] = useState<number | null>(null);

    const { data: suggestions } = useGetMentionSuggestions(
      { q: query },
      {
        query: {
          queryKey: getGetMentionSuggestionsQueryKey({ q: query }),
          enabled: open,
        },
      },
    );
    const items = suggestions ?? [];

    useEffect(() => {
      setHighlight(0);
    }, [query]);

    function detectToken(v: string, caret: number) {
      // Find an @ token at caret position
      let i = caret - 1;
      while (i >= 0) {
        const ch = v[i];
        if (ch === "@") {
          const before = i === 0 ? " " : v[i - 1];
          if (/\s|^/.test(before) || i === 0) {
            const tok = v.slice(i + 1, caret);
            if (/^[a-zA-Z0-9_]{0,30}$/.test(tok)) {
              setTokenStart(i);
              setQuery(tok);
              setOpen(true);
              return;
            }
          }
          break;
        }
        if (!/[a-zA-Z0-9_]/.test(ch)) break;
        i -= 1;
      }
      setOpen(false);
      setTokenStart(null);
      setQuery("");
    }

    function handleChange(
      e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) {
      const v = e.target.value;
      onChange(v);
      onUserActivity?.();
      const caret = e.target.selectionStart ?? v.length;
      detectToken(v, caret);
    }

    function pickSuggestion(idx: number) {
      const u = items[idx];
      if (!u || tokenStart === null) return;
      const el = inputRef.current;
      const caret = el?.selectionStart ?? value.length;
      const before = value.slice(0, tokenStart);
      const after = value.slice(caret);
      const insert = `@${u.username} `;
      const newValue = before + insert + after;
      onChange(newValue);
      setOpen(false);
      setTokenStart(null);
      setQuery("");
      requestAnimationFrame(() => {
        const pos = (before + insert).length;
        el?.focus();
        if (el && "setSelectionRange" in el) {
          (el as HTMLInputElement).setSelectionRange(pos, pos);
        }
      });
    }

    function handleKeyDown(
      e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) {
      if (open && items.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlight((h) => (h + 1) % items.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlight((h) => (h - 1 + items.length) % items.length);
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          pickSuggestion(highlight);
          return;
        }
        if (e.key === "Escape") {
          setOpen(false);
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey && variant === "input" && onSubmit) {
        e.preventDefault();
        onSubmit();
      }
    }

    const commonProps = {
      ref: inputRef as React.Ref<HTMLInputElement & HTMLTextAreaElement>,
      value,
      onChange: handleChange,
      onKeyDown: handleKeyDown,
      placeholder,
      disabled,
      autoFocus,
      "data-testid": testId,
    };

    return (
      <div className="relative w-full">
        {variant === "input" ? (
          <input
            {...commonProps}
            className={
              className ??
              "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            }
          />
        ) : (
          <textarea
            {...commonProps}
            rows={rows}
            className={
              className ??
              "flex min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            }
          />
        )}
        {open && items.length > 0 && (
          <div
            className="absolute bottom-full left-0 z-50 mb-2 max-h-64 w-full max-w-xs overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
            data-testid="mention-suggestions"
          >
            {items.map((u, i) => (
              <button
                key={u.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickSuggestion(i);
                }}
                className={[
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                  i === highlight
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/60",
                ].join(" ")}
                data-testid={`mention-option-${u.username}`}
              >
                <Avatar className="h-6 w-6">
                  {u.avatarUrl ? (
                    <AvatarImage src={u.avatarUrl} alt={u.displayName} />
                  ) : null}
                  <AvatarFallback className="text-[10px]">
                    {u.displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {u.displayName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{u.username}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
);
