import { EventEmitter } from "node:events";

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

function channel(tag: string): string {
  return `room:${tag.toLowerCase()}`;
}

export interface PollUpdateEvent {
  pollId: number;
  totalVotes: number;
  at: number;
}

export function publishPollUpdate(tag: string, event: PollUpdateEvent): void {
  emitter.emit(channel(tag), event);
}

export function subscribePollUpdates(
  tag: string,
  listener: (event: PollUpdateEvent) => void,
): () => void {
  const ch = channel(tag);
  emitter.on(ch, listener);
  return () => {
    emitter.off(ch, listener);
  };
}
