import { useEffect, useRef } from "react";

import type { MediaStream } from "@/hooks/webrtcShim";

interface Props {
  stream: MediaStream;
  muted?: boolean;
}

// On the web build (react-native-web) we need an actual <audio> element so the
// browser plays the remote MediaStream. Returning a hidden audio tag works on
// both desktop and mobile browsers as long as it is mounted before/while the
// user interacts (joining a room counts as a user gesture).
export function RemoteAudio({ stream, muted }: Props) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Cast through unknown so we don't leak our minimal MediaStream shape
    // onto the DOM `srcObject` setter type.
    const domStream = stream as unknown as MediaProvider;
    if (el.srcObject !== domStream) {
      el.srcObject = domStream;
    }
    el.muted = !!muted;
    const play = el.play();
    if (play && typeof play.catch === "function") {
      play.catch((err: unknown) => {
        // Autoplay can be blocked until first user gesture; not fatal.
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("RemoteAudio: play() rejected", msg);
      });
    }
  }, [stream, muted]);

  return (
    <audio
      ref={ref}
      autoPlay
      playsInline
      style={{ display: "none" }}
      data-testid="remote-audio"
    />
  );
}
