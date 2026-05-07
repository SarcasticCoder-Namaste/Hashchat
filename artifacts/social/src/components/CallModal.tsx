import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useAuth, useUser } from "@clerk/react";
import { useGroupCall } from "@/hooks/useGroupCall";
import { Button } from "@/components/ui/button";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  X,
  Hand,
  HandMetal,
  Megaphone,
  MicVocal,
} from "lucide-react";

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
    raiseHand,
    lowerHand,
    promote,
    demote,
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

  const isVoiceRoom = !!(call?.kind === "voice" && call?.roomTag);

  const me = useMemo(
    () => call?.participants.find((p) => p.userId === user?.id),
    [call, user?.id],
  );
  const myRole = me?.role ?? "speaker";
  const handIsRaised = !!me?.handRaisedAt;
  const amHost = myRole === "host";

  // Listeners shouldn't transmit audio; mute outgoing tracks until promoted.
  useEffect(() => {
    const stream = localStream;
    if (!stream) return;
    const isListener = isVoiceRoom && myRole === "listener";
    stream.getAudioTracks().forEach((t) => {
      // If the user explicitly muted, keep them muted regardless of role.
      const desiredEnabled = isListener ? false : !muted;
      if (t.enabled !== desiredEnabled) t.enabled = desiredEnabled;
    });
  }, [localStream, isVoiceRoom, myRole, muted]);

  const joinedParticipants = call?.participants.filter((p) => p.state === "joined") ?? [];
  const speakers = joinedParticipants.filter(
    (p) => (p.role ?? "speaker") !== "listener",
  );
  const listeners = joinedParticipants.filter(
    (p) => (p.role ?? "speaker") === "listener",
  );

  const headerLabel = isVoiceRoom
    ? `Voice room${call?.roomTag ? ` · #${call.roomTag}` : ""}`
    : call?.kind === "video"
      ? "Video call"
      : "Voice call";

  // Lock body scroll while the call modal is open so accidental scrolls don't
  // hide the controls behind the mobile browser chrome.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 text-white"
      style={{ height: "100dvh", width: "100dvw" }}
      data-testid="call-modal"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{headerLabel}</p>
          <p className="text-xs text-white/60">
            {joinedParticipants.length} joined ·{" "}
            {call?.status ?? "connecting"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 text-white hover:bg-white/10"
          onClick={hangup}
          data-testid="button-close-call"
          aria-label="Close call"
        >
          <X className="h-6 w-6" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {error ? (
          <div className="mx-auto max-w-md rounded-lg bg-red-500/20 p-4 text-center text-sm">
            {error}
          </div>
        ) : null}

        {isVoiceRoom ? (
          <div className="mx-auto flex max-w-2xl flex-col gap-6">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-white/60">
                Speakers ({speakers.length})
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <SpeakerTile
                  label={`You${muted ? " (muted)" : ""}`}
                  role={myRole}
                  isMe
                />
                {speakers
                  .filter((p) => p.userId !== user?.id)
                  .map((p) => (
                    <SpeakerTile
                      key={p.userId}
                      label={p.displayName}
                      role={p.role ?? "speaker"}
                      onDemote={
                        amHost && p.role !== "host"
                          ? () => void demote(p.userId)
                          : undefined
                      }
                    />
                  ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-white/60">
                Listeners ({listeners.length + (isVoiceRoom && myRole === "listener" ? 0 : 0)})
              </p>
              <div className="flex flex-wrap gap-2">
                {listeners.map((p) => (
                  <ListenerChip
                    key={p.userId}
                    name={p.displayName}
                    handRaisedAt={p.handRaisedAt ?? null}
                    canPromote={amHost}
                    onPromote={() => void promote(p.userId)}
                    isMe={p.userId === user?.id}
                  />
                ))}
                {listeners.length === 0 && (
                  <p className="text-xs text-white/50">No listeners yet.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
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
        )}
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-white/10 bg-black/40 px-4 py-4">
        {isVoiceRoom && myRole === "listener" ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={handIsRaised ? () => void lowerHand() : () => void raiseHand()}
            className={[
              "h-12 w-12 rounded-full text-white",
              handIsRaised
                ? "bg-amber-500/30 hover:bg-amber-500/40"
                : "bg-white/10 hover:bg-white/20",
            ].join(" ")}
            data-testid="button-toggle-hand"
            aria-label={handIsRaised ? "Lower hand" : "Raise hand"}
            title={handIsRaised ? "Lower hand" : "Raise hand to speak"}
          >
            {handIsRaised ? (
              <HandMetal className="h-5 w-5" />
            ) : (
              <Hand className="h-5 w-5" />
            )}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            className="h-12 w-12 rounded-full bg-white/10 text-white hover:bg-white/20"
            data-testid="button-toggle-mute"
          >
            {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>
        )}
        {withVideo && !isVoiceRoom && (
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
          className="h-14 w-14 rounded-full bg-red-600 p-0 text-white hover:bg-red-700"
          data-testid="button-hangup"
          aria-label="Hang up"
        >
          <PhoneOff className="h-6 w-6" />
        </Button>
      </div>
    </div>,
    document.body,
  );
}

function SpeakerTile({
  label,
  role,
  isMe,
  onDemote,
}: {
  label: string;
  role: "host" | "speaker" | "listener";
  isMe?: boolean;
  onDemote?: () => void;
}) {
  return (
    <div className="relative flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/70 p-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-base font-semibold">
        {label.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="text-xs text-white/60 inline-flex items-center gap-1">
          {role === "host" ? (
            <>
              <Megaphone className="h-3 w-3" /> Host
            </>
          ) : (
            <>
              <MicVocal className="h-3 w-3" /> Speaker
            </>
          )}
        </p>
      </div>
      {!isMe && onDemote && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-white/70 hover:bg-white/10 hover:text-white"
          onClick={onDemote}
          data-testid={`button-demote-${label}`}
        >
          Move to listener
        </Button>
      )}
    </div>
  );
}

function ListenerChip({
  name,
  handRaisedAt,
  canPromote,
  onPromote,
  isMe,
}: {
  name: string;
  handRaisedAt: string | null;
  canPromote: boolean;
  onPromote: () => void;
  isMe?: boolean;
}) {
  const handUp = !!handRaisedAt;
  return (
    <div
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
        handUp
          ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
          : "border-white/10 bg-zinc-900/70 text-white/80",
      ].join(" ")}
      data-testid={`listener-${name}`}
    >
      {handUp && <Hand className="h-3 w-3" />}
      <span className="max-w-[10rem] truncate">
        {name}
        {isMe ? " (you)" : ""}
      </span>
      {canPromote && handUp && !isMe && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 rounded-full px-2 text-[11px] text-white/90 hover:bg-white/10"
          onClick={onPromote}
          data-testid={`button-promote-${name}`}
        >
          Promote
        </Button>
      )}
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
