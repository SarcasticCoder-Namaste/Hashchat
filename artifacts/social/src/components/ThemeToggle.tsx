import { Palette, Check } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle({
  className,
}: {
  className?: string;
}) {
  const { theme, setTheme, themes } = useTheme();
  const current = themes.find((t) => t.id === theme) ?? themes[0];
  const lightThemes = themes.filter((t) => !t.isDark);
  const darkThemes = themes.filter((t) => t.isDark);

  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Pick theme"
            data-testid="button-theme-toggle"
          >
            <span
              className="block h-4 w-4 rounded-full ring-2 ring-border"
              style={{ background: current.swatch.primary }}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 p-1.5">
          <DropdownMenuLabel className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Palette className="h-3.5 w-3.5" /> Light themes
          </DropdownMenuLabel>
          <ThemeRows
            list={lightThemes}
            activeId={theme}
            onPick={(id) => setTheme(id)}
          />
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dark themes
          </DropdownMenuLabel>
          <ThemeRows
            list={darkThemes}
            activeId={theme}
            onPick={(id) => setTheme(id)}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ThemeRows({
  list,
  activeId,
  onPick,
}: {
  list: ReturnType<typeof useTheme>["themes"];
  activeId: string;
  onPick: (id: ReturnType<typeof useTheme>["themes"][number]["id"]) => void;
}) {
  return (
    <div className="flex flex-col">
      {list.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            data-testid={`theme-${t.id}`}
            className={[
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-foreground hover:bg-accent/50",
            ].join(" ")}
          >
            <span
              className="relative h-6 w-6 shrink-0 overflow-hidden rounded-md border border-border"
              style={{ background: t.swatch.bg }}
            >
              <span
                className="absolute bottom-0.5 left-0.5 h-2 w-2 rounded-full"
                style={{ background: t.swatch.primary }}
              />
              <span
                className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full"
                style={{ background: t.swatch.accent }}
              />
            </span>
            <span className="flex-1 truncate font-medium">{t.label}</span>
            {active && <Check className="h-3.5 w-3.5 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}
