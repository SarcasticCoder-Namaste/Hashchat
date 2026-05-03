import { useCallback, useEffect, useRef } from "react";
import { useAuth, useUser } from "@clerk/react";
import { useGroupCall } from "@/hooks/useGroupCall";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Video, VideoOff, PhoneOff, X } from "lucide-react";

interface CallModalProps {
  callId: number;
  withVideo: boolean;
  onClose: () => void;
}

export function CallModal({ callId, withVideo, onClose }: CallModalProps) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const fetchToken = useCallback(() => getToken(), [getToken]);

  const {
    localStream,
    remotePeers,
    call,
    error,
    muted,
    videoOff,
    toggleMute,
    toggleVideo,
    hangup,
  } = useGroupCall({
    callId,
    myUserId: user?.id ?? "",
    enabled: !!user?.id,
    withVideo,
    getToken: fetchToken,
    onEnd: onClose,
  });

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Esc dismisses the modal — hang up cleanly so we leave the call on the
  // server, stop local tracks, and notify the parent (which clears the
  // active callId). Without this the only way to leave is the on-screen
  // hangup/X buttons, which is a poor accessibility outcome.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void hangup();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hangup]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95 text-white" data-testid="call-modal">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm font-semibold">
            {call?.kind === "video" ? "Video call" : "Voice call"}
          </p>
          <p className="text-xs text-white/60">
            {call?.participants.filter((p) => p.state === "joined").length ?? 1} joined ·{" "}
            {call?.status ?? "connecting"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10"
          onClick={hangup}
          data-testid="button-close-call"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {error ? (
          <div className="mx-auto max-w-md rounded-lg bg-red-500/20 p-4 text-center text-sm">
            {error}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <VideoTile
            label={`You${muted ? " (muted)" : ""}`}
            muted
            mirrored
            videoRef={localVideoRef}
            placeholder={videoOff || !withVideo}
            placeholderText={user?.username ?? "You"}
          />
          {remotePeers.map((p) => (
            <RemoteTile key={p.userId} peer={p} />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-white/10 bg-black/40 px-4 py-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMute}
          className="h-12 w-12 rounded-full bg-white/10 text-white hover:bg-white/20"
          data-testid="button-toggle-mute"
        >
          {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </Button>
        {withVideo && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleVideo}
            className="h-12 w-12 rounded-full bg-white/10 text-white hover:bg-white/20"
            data-testid="button-toggle-video"
          >
            {videoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          </Button>
        )}
        <Button
          onClick={hangup}
          className="h-12 w-12 rounded-full bg-red-600 p-0 text-white hover:bg-red-700"
          data-testid="button-hangup"
        >
          <PhoneOff className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

function VideoTile({
  label,
  videoRef,
  muted,
  mirrored,
  placeholder,
  placeholderText,
}: {
  label: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  muted?: boolean;
  mirrored?: boolean;
  placeholder?: boolean;
  placeholderText?: string;
}) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-zinc-900">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={[
          "h-full w-full object-cover",
          mirrored ? "[transform:scaleX(-1)]" : "",
          placeholder ? "hidden" : "",
        ].join(" ")}
      />
      {placeholder && (
        <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-white/70">
          {(placeholderText ?? "?").slice(0, 2).toUpperCase()}
        </div>
      )}
      <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs">
        {label}
      </span>
    </div>
  );
}

function RemoteTile({ peer }: { peer: { userId: string; displayName: string; stream: MediaStream } }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = peer.stream;
  }, [peer.stream]);
  const hasVideo = peer.stream.getVideoTracks().some((t) => t.enabled);
  return (
    <VideoTile
      label={peer.displayName}
      videoRef={ref}
      placeholder={!hasVideo}
      placeholderText={peer.displayName}
    />
  );
}
