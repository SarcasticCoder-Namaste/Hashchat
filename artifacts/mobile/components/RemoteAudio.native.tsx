// On native, react-native-webrtc auto-plays remote audio tracks through the
// device output — there is nothing to render in the React tree.
import type { MediaStream } from "@/hooks/webrtcShim";

export function RemoteAudio(_props: { stream: MediaStream; muted?: boolean }) {
  return null;
}
