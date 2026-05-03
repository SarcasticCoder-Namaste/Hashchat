import { useState } from "react";
import { useTranslateMessage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Languages, Loader2, X } from "lucide-react";

const LANGUAGES = [
  { value: "Spanish", label: "Spanish" },
  { value: "French", label: "French" },
  { value: "German", label: "German" },
  { value: "Portuguese", label: "Portuguese" },
  { value: "Italian", label: "Italian" },
  { value: "Japanese", label: "Japanese" },
  { value: "Korean", label: "Korean" },
  { value: "Chinese (Simplified)", label: "Chinese (Simplified)" },
  { value: "Hindi", label: "Hindi" },
  { value: "Arabic", label: "Arabic" },
  { value: "English", label: "English" },
];

interface Props {
  messageId: number;
  onResult: (text: string, language: string) => void;
  onClear: () => void;
  hasTranslation: boolean;
}

export function MessageTranslatePopover({
  messageId,
  onResult,
  onClear,
  hasTranslation,
}: Props) {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState("Spanish");
  const [error, setError] = useState<string | null>(null);

  const translate = useTranslateMessage({
    mutation: {
      onSuccess: (data) => {
        setError(null);
        onResult(data.text, data.language);
        setOpen(false);
      },
      onError: () => {
        setError("Translation failed. Please try again.");
      },
    },
  });

  function submit() {
    setError(null);
    translate.mutate({ id: messageId, data: { language } });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Translate message"
          data-testid={`button-translate-${messageId}`}
        >
          <Languages className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" side="top" className="flex w-60 flex-col gap-2 p-2">
        <p className="text-xs font-medium text-muted-foreground">Translate to</p>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger
            className="h-8 text-sm"
            data-testid={`select-translate-language-${messageId}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={translate.isPending}
            data-testid={`button-do-translate-${messageId}`}
          >
            {translate.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Translate
          </Button>
          {hasTranslation && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              data-testid={`button-clear-translate-${messageId}`}
            >
              <X className="mr-1 h-3 w-3" /> Show original
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
