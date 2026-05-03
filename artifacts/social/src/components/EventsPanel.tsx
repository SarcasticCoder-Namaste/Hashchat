import { useEffect, useRef, useState } from "react";
import {
  useGetRoomEvents,
  useCreateRoomEvent,
  useRsvpEvent,
  useCancelRsvpEvent,
  useCancelEvent,
  useUpdateEvent,
  getGetRoomEventsQueryKey,
  getGetUpcomingEventsQueryKey,
  type Event as RoomEvent,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar,
  Plus,
  Bell,
  BellOff,
  Pencil,
  Trash2,
  Radio,
  Loader2,
  Users,
} from "lucide-react";

function localInputToIso(value: string) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isoToLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EventsPanel({ tag }: { tag: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetRoomEvents(tag, {
    query: {
      queryKey: getGetRoomEventsQueryKey(tag),
      refetchOnWindowFocus: false,
      refetchInterval: 30000,
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetRoomEventsQueryKey(tag) });
    qc.invalidateQueries({ queryKey: getGetUpcomingEventsQueryKey() });
  };

  const create = useCreateRoomEvent({
    mutation: {
      onSuccess: () => {
        toast({
          title: "Event scheduled",
          description: "Members can now RSVP to your event.",
        });
        invalidate();
      },
      onError: (err: unknown) => {
        const e = err as { response?: { data?: { error?: string } } };
        toast({
          title: "Could not schedule",
          description: e.response?.data?.error ?? "Try again in a moment.",
          variant: "destructive",
        });
      },
    },
  });
  const rsvp = useRsvpEvent({ mutation: { onSuccess: invalidate } });
  const unRsvp = useCancelRsvpEvent({ mutation: { onSuccess: invalidate } });
  const cancel = useCancelEvent({
    mutation: {
      onSuccess: () => {
        toast({ title: "Event canceled" });
        invalidate();
      },
    },
  });
  const update = useUpdateEvent({
    mutation: {
      onSuccess: () => {
        toast({ title: "Event updated" });
        invalidate();
      },
      onError: (err: unknown) => {
        const e = err as { response?: { data?: { error?: string } } };
        toast({
          title: "Could not update",
          description: e.response?.data?.error ?? "Try again in a moment.",
          variant: "destructive",
        });
      },
    },
  });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  function reset() {
    setTitle("");
    setDescription("");
    setStartsAt("");
    setEndsAt("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const startsIso = localInputToIso(startsAt);
    const endsIso = endsAt ? localInputToIso(endsAt) : null;
    if (!title.trim() || !startsIso) return;
    create.mutate(
      {
        tag,
        data: {
          title: title.trim(),
          description: description.trim() || null,
          startsAt: startsIso,
          endsAt: endsIso,
        },
      },
      {
        onSuccess: () => {
          reset();
          setOpen(false);
        },
      },
    );
  }

  const upcoming = (data ?? []).filter((e) => !e.isPast);
  const past = (data ?? []).filter((e) => e.isPast);

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-4"
      data-testid="events-panel"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Room events
            </h3>
            <p className="text-xs text-muted-foreground">
              Plan meetups, calls, livestreams or watch parties.
            </p>
          </div>
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) reset();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-create-event">
                <Plus className="mr-1 h-4 w-4" /> Schedule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Schedule an event</DialogTitle>
                <DialogDescription>
                  Active members of #{tag} can plan events the room can RSVP to.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Title
                  </label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Friday hangout, AMA, watch party…"
                    maxLength={120}
                    data-testid="input-event-title"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Description (optional)
                  </label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="What is this about?"
                    data-testid="input-event-description"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-foreground">
                      Starts at
                    </label>
                    <Input
                      type="datetime-local"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                      data-testid="input-event-starts"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">
                      Ends at (optional)
                    </label>
                    <Input
                      type="datetime-local"
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                      data-testid="input-event-ends"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={create.isPending || !title.trim() || !startsAt}
                    data-testid="button-submit-event"
                  >
                    {create.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Schedule
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No events yet. Be the first to schedule one!
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((e) => (
              <EventRow
                key={e.id}
                event={e}
                onRsvp={() => rsvp.mutate({ id: e.id })}
                onUnRsvp={() => unRsvp.mutate({ id: e.id })}
                onCancel={() => cancel.mutate({ id: e.id })}
                onUpdate={(data) => update.mutate({ id: e.id, data })}
                updatePending={update.isPending}
                pending={rsvp.isPending || unRsvp.isPending || cancel.isPending}
              />
            ))}
            {past.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  Past events ({past.length})
                </summary>
                <div className="mt-2 space-y-2 opacity-70">
                  {past.map((e) => (
                    <EventRow
                      key={e.id}
                      event={e}
                      onRsvp={() => rsvp.mutate({ id: e.id })}
                      onUnRsvp={() => unRsvp.mutate({ id: e.id })}
                      onCancel={() => cancel.mutate({ id: e.id })}
                      onUpdate={(data) => update.mutate({ id: e.id, data })}
                      updatePending={update.isPending}
                      pending={false}
                    />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EventRow({
  event,
  onRsvp,
  onUnRsvp,
  onCancel,
  onUpdate,
  updatePending,
  pending,
}: {
  event: RoomEvent;
  onRsvp: () => void;
  onUnRsvp: () => void;
  onCancel: () => void;
  onUpdate: (data: {
    title: string;
    description: string | null;
    startsAt: string;
    endsAt: string | null;
  }) => void;
  updatePending: boolean;
  pending: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [eTitle, setETitle] = useState(event.title);
  const [eDescription, setEDescription] = useState(event.description ?? "");
  const [eStartsAt, setEStartsAt] = useState(isoToLocalInput(event.startsAt));
  const [eEndsAt, setEEndsAt] = useState(isoToLocalInput(event.endsAt));

  useEffect(() => {
    if (editOpen) {
      setETitle(event.title);
      setEDescription(event.description ?? "");
      setEStartsAt(isoToLocalInput(event.startsAt));
      setEEndsAt(isoToLocalInput(event.endsAt));
    }
  }, [editOpen, event.title, event.description, event.startsAt, event.endsAt]);

  function submitEdit(ev: React.FormEvent) {
    ev.preventDefault();
    const startsIso = localInputToIso(eStartsAt);
    const endsIso = eEndsAt ? localInputToIso(eEndsAt) : null;
    if (!eTitle.trim() || !startsIso) return;
    onUpdate({
      title: eTitle.trim(),
      description: eDescription.trim() || null,
      startsAt: startsIso,
      endsAt: endsIso,
    });
    setEditOpen(false);
  }

  return (
    <div
      className="rounded-xl border border-border bg-card p-3"
      data-testid={`event-row-${event.id}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg ${
            event.isLive
              ? "bg-red-500/15 text-red-600"
              : "bg-violet-500/15 text-violet-600"
          }`}
        >
          {event.isLive ? (
            <Radio className="h-5 w-5 animate-pulse" />
          ) : (
            <Calendar className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="truncate font-semibold text-foreground"
            data-testid={`event-row-title-${event.id}`}
          >
            {event.title}
          </p>
          <p className="text-xs text-muted-foreground">
            {event.isLive ? "Live now · " : ""}
            {fmtDate(event.startsAt)}
            {event.endsAt && ` – ${fmtDate(event.endsAt)}`} · by {event.creatorName}
          </p>
          {event.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {event.description}
            </p>
          )}
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {event.rsvpCount} going
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          {!event.isPast &&
            (event.rsvpedByMe ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={onUnRsvp}
                disabled={pending}
                data-testid={`event-row-unrsvp-${event.id}`}
              >
                <BellOff className="mr-1 h-3.5 w-3.5" /> Going
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={onRsvp}
                disabled={pending}
                data-testid={`event-row-rsvp-${event.id}`}
              >
                <Bell className="mr-1 h-3.5 w-3.5" /> RSVP
              </Button>
            ))}
          {event.canModerate && !event.isPast && (
            <div className="flex items-center gap-1">
              <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={pending || updatePending}
                    aria-label="Edit event"
                    data-testid={`event-row-edit-${event.id}`}
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit event</DialogTitle>
                    <DialogDescription>
                      Update the title, description, or schedule. RSVPs are kept.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={submitEdit} className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-foreground">
                        Title
                      </label>
                      <Input
                        value={eTitle}
                        onChange={(e) => setETitle(e.target.value)}
                        maxLength={120}
                        data-testid={`input-edit-event-title-${event.id}`}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">
                        Description (optional)
                      </label>
                      <Textarea
                        value={eDescription}
                        onChange={(e) => setEDescription(e.target.value)}
                        rows={3}
                        data-testid={`input-edit-event-description-${event.id}`}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-sm font-medium text-foreground">
                          Starts at
                        </label>
                        <Input
                          type="datetime-local"
                          value={eStartsAt}
                          onChange={(e) => setEStartsAt(e.target.value)}
                          data-testid={`input-edit-event-starts-${event.id}`}
                          required
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground">
                          Ends at (optional)
                        </label>
                        <Input
                          type="datetime-local"
                          value={eEndsAt}
                          onChange={(e) => setEEndsAt(e.target.value)}
                          data-testid={`input-edit-event-ends-${event.id}`}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="submit"
                        disabled={
                          updatePending || !eTitle.trim() || !eStartsAt
                        }
                        data-testid={`button-submit-edit-event-${event.id}`}
                      >
                        {updatePending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Save changes
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              <Button
                size="icon"
                variant="ghost"
                onClick={onCancel}
                disabled={pending}
                aria-label="Cancel event"
                data-testid={`event-row-cancel-${event.id}`}
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function LiveEventBanner({ tag }: { tag: string }) {
  const { data } = useGetRoomEvents(tag, {
    query: {
      queryKey: getGetRoomEventsQueryKey(tag),
      refetchInterval: 30000,
    },
  });
  const live = (data ?? []).find((e) => e.isLive);
  const previousLiveIdRef = useRef<number | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const liveId = live ? live.id : null;
    if (liveId !== null && liveId !== previousLiveIdRef.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 2400);
      previousLiveIdRef.current = liveId;
      return () => clearTimeout(t);
    }
    if (liveId === null) {
      previousLiveIdRef.current = null;
    }
    return undefined;
  }, [live]);

  if (!live) return null;
  return (
    <div
      className={[
        "flex items-center gap-2 border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs transition-colors",
        flash ? "animate-pulse bg-red-500/30" : "",
      ].join(" ")}
      data-testid={`live-banner-${live.id}`}
      data-flash={flash ? "true" : "false"}
    >
      <Radio className="h-3.5 w-3.5 animate-pulse text-red-600" />
      <span className="font-semibold text-red-600 dark:text-red-400">
        Live now
      </span>
      <span className="truncate text-foreground">{live.title}</span>
      <span className="ml-auto text-muted-foreground">
        {live.rsvpCount} going
      </span>
    </div>
  );
}
