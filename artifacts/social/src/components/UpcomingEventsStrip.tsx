import { Link } from "wouter";
import {
  useGetUpcomingEvents,
  useRsvpEvent,
  useCancelRsvpEvent,
  getGetUpcomingEventsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Calendar, Hash, Radio, Bell, BellOff } from "lucide-react";
import { motion } from "framer-motion";

function formatRelative(iso: string) {
  const t = new Date(iso).getTime();
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  if (min < 1) return diff > 0 ? "Now" : "Just now";
  if (min < 60) return diff > 0 ? `in ${min}m` : `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return diff > 0 ? `in ${hr}h` : `${hr}h ago`;
  const day = Math.round(hr / 24);
  return diff > 0 ? `in ${day}d` : `${day}d ago`;
}

export function UpcomingEventsStrip() {
  const qc = useQueryClient();
  const { data } = useGetUpcomingEvents(
    { limit: 8 },
    {
      query: {
        queryKey: getGetUpcomingEventsQueryKey({ limit: 8 }),
        refetchOnWindowFocus: false,
      },
    },
  );
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getGetUpcomingEventsQueryKey() });
  const rsvp = useRsvpEvent({ mutation: { onSuccess: invalidate } });
  const unRsvp = useCancelRsvpEvent({ mutation: { onSuccess: invalidate } });

  if (!data || data.length === 0) return null;

  return (
    <section data-testid="upcoming-events-strip">
      <div className="mb-3 flex items-center gap-2">
        <Calendar className="h-5 w-5 text-violet-600" />
        <h2 className="text-lg font-semibold text-foreground">Upcoming events</h2>
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {data.map((e, idx) => (
          <motion.div
            key={e.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04, duration: 0.2 }}
            className="min-w-[260px] max-w-[280px] flex-shrink-0 rounded-xl border border-border bg-card p-3 shadow-sm"
            data-testid={`event-card-${e.id}`}
          >
            <div className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide">
              {e.isLive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-red-600 dark:text-red-400">
                  <Radio className="h-3 w-3 animate-pulse" /> Live now
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400">
                  <Calendar className="h-3 w-3" /> {formatRelative(e.startsAt)}
                </span>
              )}
              <Link
                href={`/app/rooms/${encodeURIComponent(e.roomTag)}`}
                className="ml-auto inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
              >
                <Hash className="h-3 w-3" />
                {e.roomTag}
              </Link>
            </div>
            <p
              className="line-clamp-2 text-sm font-semibold text-foreground"
              data-testid={`event-title-${e.id}`}
            >
              {e.title}
            </p>
            {e.description && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {e.description}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {e.rsvpCount} going
              </span>
              {e.rsvpedByMe ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => unRsvp.mutate({ id: e.id })}
                  disabled={unRsvp.isPending}
                  data-testid={`event-unrsvp-${e.id}`}
                >
                  <BellOff className="mr-1 h-3.5 w-3.5" /> Going
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => rsvp.mutate({ id: e.id })}
                  disabled={rsvp.isPending}
                  data-testid={`event-rsvp-${e.id}`}
                >
                  <Bell className="mr-1 h-3.5 w-3.5" /> RSVP
                </Button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
