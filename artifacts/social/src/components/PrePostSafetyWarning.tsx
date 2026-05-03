import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useCheckModeration } from "@workspace/api-client-react";

interface Props {
  text: string;
  className?: string;
}

const DEBOUNCE_MS = 600;
const MIN_LEN = 6;

export function PrePostSafetyWarning({ text, className }: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<{
    flagged: boolean;
    message: string | null;
    categories: string[];
  } | null>(null);

  const check = useCheckModeration();

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.length < MIN_LEN) {
      setResult(null);
      return;
    }
    const t = setTimeout(() => setPending(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    check
      .mutateAsync({ data: { text: pending } })
      .then((r) => {
        if (cancelled) return;
        setResult({
          flagged: !!r.flagged,
          message: r.message ?? null,
          categories: Array.isArray(r.categories) ? r.categories : [],
        });
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  if (!result || !result.flagged) return null;

  return (
    <div
      className={`flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 ${className ?? ""}`}
      data-testid="pre-post-safety-warning"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {result.message ?? "This post may violate community rules."}
        </p>
        {result.categories.length > 0 && (
          <p className="mt-0.5 text-[11px] opacity-80">
            Flags: {result.categories.join(", ")}
          </p>
        )}
        <p className="mt-0.5 text-[11px] opacity-80">
          You can still post — just take a second to review.
        </p>
      </div>
    </div>
  );
}
