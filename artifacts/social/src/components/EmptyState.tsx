import { type ComponentType, type ReactNode } from "react";
import { motion } from "framer-motion";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center"
    >
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/15 to-pink-500/15">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500/10 to-pink-500/10 blur-md" />
        <Icon className="relative h-7 w-7 text-primary" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </motion.div>
  );
}
