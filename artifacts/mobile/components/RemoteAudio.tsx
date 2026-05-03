// Stub. The real implementations live in RemoteAudio.web.tsx and
// RemoteAudio.native.tsx; Metro/Expo selects the right one per platform.
import type { MediaStream } from "@/hooks/webrtcShim";

export function RemoteAudio(_props: { stream: MediaStream; muted?: boolean }) {
  return null;
}
