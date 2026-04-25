import { useEffect, useRef, useState, useCallback } from "react";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiBase = `${basePath}/api`;

interface CallSignal {
  id: number;
  fromUserId: string;
  toUserId: string;
  kind: string;
  payload: string;
}

interface CallParticipant {
  userId: string;
  displayName: string;
  state: string;
}

interface CallState {
  id: number;
  kind: string;
  status: string;
  participants: CallParticipant[];
}

interface RemotePeer {
  userId: string;
  displayName: string;
  stream: MediaStream;
}

export function useGroupCall(opts: {
  callId: number | null;
  myUserId: string;
  enabled: boolean;
  withVideo: boolean;
  getToken: () => Promise<string | null>;
  onEnd: () => void;
}) {
  const { callId, myUserId, enabled, withVideo, getToken, onEnd } = opts;
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [call, setCall] = useState<CallState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(!withVideo);

  const peersRef = useRef<Map<string, { pc: RTCPeerConnection; displayName: string; tracksAdded: boolean }>>(new Map());
  const streamsRef = useRef<Map<string, MediaStream>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const joinedRef = useRef(false);
  const cursorRef = useRef(0);
  const myIdRef = useRef(myUserId);
  myIdRef.current = myUserId;
  // Stabilize callbacks via refs so the polling effect below isn't torn down
  // and re-created on every parent render. Without this, an inline `onClose`
  // (or any new getToken closure) churns through cleanup → setLocalStream(null)
  // → re-render → cleanup → ... and React reports "Maximum update depth
  // exceeded". The effect only reads the *current* values, never closes over
  // them, so refs are safe here.
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const refreshRemote = useCallback(() => {
    const list: RemotePeer[] = [];
    streamsRef.current.forEach((stream, userId) => {
      const p = peersRef.current.get(userId);
      list.push({ userId, displayName: p?.displayName ?? userId, stream });
    });
    setRemotePeers(list);
  }, []);

  const apiCall = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const token = await getTokenRef.current();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      return fetch(`${apiBase}${path}`, { ...init, headers });
    },
    [],
  );

  const sendSignal = useCallback(
    async (toUserId: string, kind: string, payload: unknown) => {
      if (callId == null) return;
      await apiCall(`/calls/${callId}/signals`, {
        method: "POST",
        body: JSON.stringify({ toUserId, kind, payload: JSON.stringify(payload) }),
      });
    },
    [apiCall, callId],
  );

  const ensurePeer = useCallback(
    (otherId: string, displayName: string) => {
      const existing = peersRef.current.get(otherId);
      if (existing) {
        if (!existing.tracksAdded && localStreamRef.current) {
          localStreamRef.current
            .getTracks()
            .forEach((t) => existing.pc.addTrack(t, localStreamRef.current!));
          existing.tracksAdded = true;
        }
        return existing.pc;
      }
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const local = localStreamRef.current;
      const entry = { pc, displayName, tracksAdded: false };
      peersRef.current.set(otherId, entry);

      pc.onicecandidate = (e) => {
        if (e.candidate) void sendSignal(otherId, "ice", e.candidate.toJSON());
      };
      pc.ontrack = (e) => {
        const stream = e.streams[0] ?? new MediaStream([e.track]);
        streamsRef.current.set(otherId, stream);
        refreshRemote();
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          streamsRef.current.delete(otherId);
          refreshRemote();
        }
      };

      if (local) {
        local.getTracks().forEach((t) => pc.addTrack(t, local));
        entry.tracksAdded = true;
      }
      return pc;
    },
    [sendSignal, refreshRemote],
  );

  const cleanup = useCallback(() => {
    peersRef.current.forEach(({ pc }) => pc.close());
    peersRef.current.clear();
    streamsRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemotePeers([]);
  }, []);

  useEffect(() => {
    if (!enabled || callId == null) return;
    let cancelled = false;

    const setup = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: withVideo,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);

        await apiCall(`/calls/${callId}/join`, { method: "POST" });
        if (cancelled) return;
        joinedRef.current = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Couldn't access microphone/camera";
        setError(msg);
      }
    };

    void setup();

    const refresh = async () => {
      // Hold off on any peer connection / signaling work until we have local
      // media AND have notified the server we joined. Otherwise the polling
      // loop can create RTCPeerConnections without local tracks and emit
      // offers that result in one-way / no-media calls.
      if (!joinedRef.current || !localStreamRef.current) return;
      try {
        const callRes = await apiCall(`/calls/${callId}`);
        if (!callRes.ok) return;
        const cdata = (await callRes.json()) as CallState;
        if (cancelled) return;
        setCall(cdata);

        const joinedOthers = cdata.participants.filter(
          (p) => p.state === "joined" && p.userId !== myIdRef.current,
        );
        for (const p of joinedOthers) {
          if (peersRef.current.has(p.userId)) {
            const ent = peersRef.current.get(p.userId)!;
            ent.displayName = p.displayName;
            continue;
          }
          if (myIdRef.current < p.userId) {
            const pc = ensurePeer(p.userId, p.displayName);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendSignal(p.userId, "offer", offer);
          }
        }
        const joinedIds = new Set(joinedOthers.map((p) => p.userId));
        peersRef.current.forEach((ent, uid) => {
          if (!joinedIds.has(uid)) {
            ent.pc.close();
            peersRef.current.delete(uid);
            streamsRef.current.delete(uid);
          }
        });
        refreshRemote();

        const sigRes = await apiCall(
          `/calls/${callId}/signals?since=${cursorRef.current}`,
        );
        if (!sigRes.ok) return;
        const sdata = (await sigRes.json()) as { signals: CallSignal[]; cursor: number };
        cursorRef.current = sdata.cursor;
        for (const s of sdata.signals) {
          const fromName =
            joinedOthers.find((p) => p.userId === s.fromUserId)?.displayName ?? s.fromUserId;
          const pc = ensurePeer(s.fromUserId, fromName);
          let payload: unknown;
          try {
            payload = JSON.parse(s.payload);
          } catch {
            continue;
          }
          if (s.kind === "offer") {
            await pc.setRemoteDescription(payload as RTCSessionDescriptionInit);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendSignal(s.fromUserId, "answer", answer);
          } else if (s.kind === "answer") {
            await pc.setRemoteDescription(payload as RTCSessionDescriptionInit);
          } else if (s.kind === "ice") {
            try {
              await pc.addIceCandidate(payload as RTCIceCandidateInit);
            } catch {
              /* ignore late ICE */
            }
          }
        }

        if (cdata.status === "ended" && !cancelled) {
          onEndRef.current();
        }
      } catch {
        /* polling errors are non-fatal */
      }
    };

    const interval = window.setInterval(refresh, 1500);
    void refresh();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      cleanup();
    };
    // NOTE: apiCall / ensurePeer / sendSignal / refreshRemote / cleanup are
    // already stable (empty or stable-input useCallback). onEnd is read via
    // onEndRef so it doesn't need to be a dep here. Keeping these out of the
    // deps array prevents the polling effect from being torn down + re-set up
    // every render, which previously caused a render loop ("Maximum update
    // depth exceeded") whenever the parent re-rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, callId, withVideo]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !videoOff;
    stream.getVideoTracks().forEach((t) => (t.enabled = !next));
    setVideoOff(next);
  }, [videoOff]);

  const hangup = useCallback(async () => {
    // Always tear down local state and notify the parent, even if the /leave
    // POST throws (network down, expired token, etc.). Otherwise a flaky
    // network would leave the user stuck inside a modal with their mic/camera
    // still active.
    try {
      if (callId != null) {
        await apiCall(`/calls/${callId}/leave`, { method: "POST" });
      }
    } catch {
      /* swallow — we still need to clean up locally */
    } finally {
      cleanup();
      onEndRef.current();
    }
  }, [apiCall, callId, cleanup]);

  return {
    localStream,
    remotePeers,
    call,
    error,
    muted,
    videoOff,
    toggleMute,
    toggleVideo,
    hangup,
  };
}
