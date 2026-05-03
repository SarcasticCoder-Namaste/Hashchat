import { EventEmitter } from "node:events";

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export type PollScope =
  | { kind: "room"; tag: string }
  | { kind: "conversation"; id: number };

function channel(scope: PollScope): string {
  return scope.kind === "room"
    ? `room:${scope.tag.toLowerCase()}`
    : `conv:${scope.id}`;
}

export interface PollUpdateEvent {
  pollId: number;
  totalVotes: number;
  at: number;
}

export function publishPollUpdate(
  scope: PollScope,
  event: PollUpdateEvent,
): void {
  emitter.emit(channel(scope), event);
}

export function subscribePollUpdates(
  scope: PollScope,
  listener: (event: PollUpdateEvent) => void,
): () => void {
  const ch = channel(scope);
  emitter.on(ch, listener);
  return () => {
    emitter.off(ch, listener);
  };
}
