import { useCallback, useEffect, useRef, useState } from "react";

import {
  getCall,
  getCallSignals,
  sendCallSignal,
  CallSignalBodyKind,
  type Call,
  type CallParticipant,
} from "@workspace/api-client-react";

import {
  RTCPeerConnection,
  mediaDevices,
  type IceCandidatePayload,
  type MediaStream,
  type MediaTrack,
  type PeerConnection,
  type SessionDescription,
} from "@/hooks/webrtcShim";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

type SignalKind = (typeof CallSignalBodyKind)[keyof typeof CallSignalBodyKind];

export interface RemotePeer {
  userId: string;
  displayName: string;
  stream: MediaStream;
}

interface PeerEntry {
  pc: PeerConnection;
  displayName: string;
  tracksAdded: boolean;
}

interface Options {
  callId: number | null;
  myUserId: string;
  enabled: boolean;
  // Only speakers/hosts capture & publish a microphone stream. Listeners
  // create receive-only peer connections so they can hear speakers without
  // ever being asked for mic permission.
  isSpeaker: boolean;
  onEnd?: () => void;
}

interface Result {
  remotePeers: RemotePeer[];
  call: Call | null;
  error: string | null;
  muted: boolean;
  // True once we have either obtained a local mic stream (for speakers) or
  // confirmed we don't need one (for listeners) — i.e. peer connections may
  // start being created.
  ready: boolean;
  toggleMute: () => void;
}

function logCallWarn(scope: string, err: unknown): void {
  // Real-time signaling regularly produces non-fatal errors (late ICE,
  // peer hung up, network blip). We don't want to spam the user UI with
  // every one, but they must be observable in dev. Console.warn is the
  // conventional surface for this in the mobile artifact.
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[useGroupCall:${scope}] ${msg}`);
}

// Mirrors artifacts/social/src/hooks/useGroupCall.ts but for React Native /
// react-native-webrtc, with a listener mode that only consumes audio.
export function useGroupCall(opts: Options): Result {
  const { callId, myUserId, enabled, isSpeaker, onEnd } = opts;

  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);

  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const streamsRef = useRef<Map<string, MediaStream>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const cursorRef = useRef(0);
  const readyRef = useRef(false);

  const myIdRef = useRef(myUserId);
  myIdRef.current = myUserId;
  const isSpeakerRef = useRef(isSpeaker);
  isSpeakerRef.current = isSpeaker;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  const refreshRemote = useCallback(() => {
    const list: RemotePeer[] = [];
    streamsRef.current.forEach((stream, userId) => {
      const p = peersRef.current.get(userId);
      list.push({ userId, displayName: p?.displayName ?? userId, stream });
    });
    setRemotePeers(list);
  }, []);

  const sendSignalSafe = useCallback(
    async (toUserId: string, kind: SignalKind, payload: unknown) => {
      if (callId == null) return;
      try {
        await sendCallSignal(callId, {
          toUserId,
          kind,
          payload: JSON.stringify(payload),
        });
      } catch (err) {
        // Outbound signal POST failed; the peer will likely retry on the
        // next polling tick when both sides re-evaluate state.
        logCallWarn(`sendSignal:${kind}->${toUserId}`, err);
      }
    },
    [callId],
  );

  const ensurePeer = useCallback(
    (otherId: string, displayName: string): PeerConnection => {
      const existing = peersRef.current.get(otherId);
      const local = localStreamRef.current;
      if (existing) {
        if (!existing.tracksAdded && local) {
          local
            .getTracks()
            .forEach((t: MediaTrack) => existing.pc.addTrack(t, local));
          existing.tracksAdded = true;
        }
        return existing.pc;
      }
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const entry: PeerEntry = { pc, displayName, tracksAdded: false };
      peersRef.current.set(otherId, entry);

      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        const c = e.candidate;
        const cand: IceCandidatePayload =
          typeof c.toJSON === "function"
            ? c.toJSON()
            : {
                candidate: c.candidate ?? "",
                sdpMid: c.sdpMid,
                sdpMLineIndex: c.sdpMLineIndex,
              };
        void sendSignalSafe(otherId, CallSignalBodyKind.ice, cand);
      };
      pc.ontrack = (e) => {
        const stream: MediaStream =
          e.streams[0] ??
          // react-native-webrtc may not always include a streams array; fall
          // back to a single-track stream so the UI still gets the audio.
          ({
            getTracks: () => [e.track],
            getAudioTracks: () => [e.track],
          } as MediaStream);
        streamsRef.current.set(otherId, stream);
        refreshRemote();
      };
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "failed" || state === "closed") {
          streamsRef.current.delete(otherId);
          refreshRemote();
        }
      };

      if (local) {
        local.getTracks().forEach((t: MediaTrack) => pc.addTrack(t, local));
        entry.tracksAdded = true;
      } else if (!isSpeakerRef.current) {
        // Listener: ask the remote for audio without sending any of our own.
        try {
          pc.addTransceiver("audio", { direction: "recvonly" });
        } catch (err) {
          // Older implementations may throw; recvonly is implicit when no
          // tracks are added so the connection still works for receive.
          logCallWarn("addTransceiver", err);
        }
      }
      return pc;
    },
    [sendSignalSafe, refreshRemote],
  );

  // Trigger a fresh offer/answer exchange on a peer connection whose
  // sending tracks have changed (e.g. mic added on listener->speaker
  // promotion, or stopped on speaker->listener demotion). Without this the
  // remote side stays on the original SDP and never hears (or stops hearing)
  // the local audio. We send the offer regardless of who originally
  // initiated; the remote handler accepts re-offers via setRemoteDescription
  // + createAnswer.
  const renegotiate = useCallback(
    async (otherId: string, ent: PeerEntry) => {
      try {
        const offer = await ent.pc.createOffer({ offerToReceiveAudio: true });
        await ent.pc.setLocalDescription(offer);
        await sendSignalSafe(otherId, CallSignalBodyKind.offer, offer);
      } catch (err) {
        logCallWarn(`renegotiate->${otherId}`, err);
      }
    },
    [sendSignalSafe],
  );

  const cleanup = useCallback(() => {
    peersRef.current.forEach(({ pc }) => {
      try {
        pc.close();
      } catch (err) {
        logCallWarn("cleanup:pc.close", err);
      }
    });
    peersRef.current.clear();
    streamsRef.current.clear();
    if (localStreamRef.current) {
      try {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch (err) {
        logCallWarn("cleanup:track.stop", err);
      }
      localStreamRef.current = null;
    }
    readyRef.current = false;
    setReady(false);
    setRemotePeers([]);
  }, []);

  // Acquire / release the local mic when the speaker flag flips while the
  // hook is active (e.g. host promotes us mid-call). Acquisition for the
  // initial join is handled in the main effect below.
  useEffect(() => {
    if (!enabled || callId == null) return;
    let cancelled = false;

    const acquire = async () => {
      if (!isSpeaker) {
        // We are now a listener: drop any captured mic and any speaker-side
        // tracks attached to existing peers. We keep the peer connections so
        // we still receive audio. Renegotiate each peer so the remote side
        // sees the audio direction change instead of staying on the old SDP.
        if (localStreamRef.current) {
          try {
            localStreamRef.current.getTracks().forEach((t) => t.stop());
          } catch (err) {
            logCallWarn("acquire:track.stop", err);
          }
          localStreamRef.current = null;
          const toRenegotiate: [string, PeerEntry][] = [];
          peersRef.current.forEach((ent, otherId) => {
            if (ent.tracksAdded) {
              ent.tracksAdded = false;
              toRenegotiate.push([otherId, ent]);
            }
          });
          for (const [otherId, ent] of toRenegotiate) {
            await renegotiate(otherId, ent);
          }
        }
        readyRef.current = true;
        setReady(true);
        return;
      }
      if (localStreamRef.current) {
        readyRef.current = true;
        setReady(true);
        return;
      }
      try {
        const stream = await mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        // Attach to any peers that already exist (signal arrived before mic
        // permission was granted, or we were just promoted from listener).
        // For peers whose connections were established without our audio, we
        // must renegotiate so the remote side actually starts receiving us.
        const toRenegotiate: [string, PeerEntry][] = [];
        peersRef.current.forEach((ent, otherId) => {
          if (!ent.tracksAdded) {
            stream.getTracks().forEach((t) => ent.pc.addTrack(t, stream));
            ent.tracksAdded = true;
            toRenegotiate.push([otherId, ent]);
          }
        });
        for (const [otherId, ent] of toRenegotiate) {
          if (cancelled) break;
          await renegotiate(otherId, ent);
        }
        // Mic recovered after a previous failure — clear stale error state.
        setError(null);
        readyRef.current = true;
        setReady(true);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Couldn't access the microphone";
        setError(msg);
        logCallWarn("acquire:getUserMedia", err);
        // Even if mic acquisition fails, mark ready so listeners-style
        // receive-only connections can still form (the user can still hear).
        readyRef.current = true;
        setReady(true);
      }
    };

    void acquire();
    return () => {
      cancelled = true;
    };
  }, [enabled, callId, isSpeaker]);

  // Main signaling / polling loop.
  useEffect(() => {
    if (!enabled || callId == null) return;
    let cancelled = false;

    const handleOneSignal = async (
      pc: PeerConnection,
      kind: string,
      payload: unknown,
      fromUserId: string,
    ) => {
      if (kind === "offer") {
        await pc.setRemoteDescription(payload as SessionDescription);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignalSafe(fromUserId, CallSignalBodyKind.answer, answer);
      } else if (kind === "answer") {
        await pc.setRemoteDescription(payload as SessionDescription);
      } else if (kind === "ice") {
        await pc.addIceCandidate(payload as IceCandidatePayload);
      }
    };

    const tick = async () => {
      if (!readyRef.current) return;
      try {
        const cdata = await getCall(callId);
        if (cancelled) return;
        setCall(cdata);

        const joinedOthers = cdata.participants.filter(
          (p: CallParticipant) =>
            p.state === "joined" && p.userId !== myIdRef.current,
        );
        for (const p of joinedOthers) {
          if (peersRef.current.has(p.userId)) {
            const ent = peersRef.current.get(p.userId)!;
            ent.displayName = p.displayName;
            continue;
          }
          // Deterministic offer side: lexicographically smaller id offers to
          // the larger one. Mirrors the web implementation so cross-platform
          // calls negotiate correctly.
          if (myIdRef.current < p.userId) {
            const pc = ensurePeer(p.userId, p.displayName);
            try {
              const offer = await pc.createOffer({
                offerToReceiveAudio: true,
              });
              await pc.setLocalDescription(offer);
              await sendSignalSafe(p.userId, CallSignalBodyKind.offer, offer);
            } catch (err) {
              // Offer failure — peer will be retried on next tick.
              logCallWarn(`tick:offer->${p.userId}`, err);
            }
          }
        }
        const joinedIds = new Set(joinedOthers.map((p) => p.userId));
        peersRef.current.forEach((ent, uid) => {
          if (!joinedIds.has(uid)) {
            try {
              ent.pc.close();
            } catch (err) {
              logCallWarn(`tick:pc.close:${uid}`, err);
            }
            peersRef.current.delete(uid);
            streamsRef.current.delete(uid);
          }
        });
        refreshRemote();

        const sdata = await getCallSignals(callId, { since: cursorRef.current });
        cursorRef.current = sdata.cursor;
        for (const s of sdata.signals) {
          const fromName =
            joinedOthers.find((p) => p.userId === s.fromUserId)?.displayName ??
            s.fromUserId;
          const pc = ensurePeer(s.fromUserId, fromName);
          let payload: unknown;
          try {
            payload = JSON.parse(s.payload);
          } catch (err) {
            // Malformed payload from server — skip but log so it's diagnosable.
            logCallWarn(`tick:parse:${s.kind}<-${s.fromUserId}`, err);
            continue;
          }
          try {
            await handleOneSignal(pc, s.kind, payload, s.fromUserId);
          } catch (err) {
            // Late / out-of-order ICE or duplicate description — log and
            // keep going so a single bad signal can't kill the loop.
            logCallWarn(`tick:apply:${s.kind}<-${s.fromUserId}`, err);
          }
        }

        if (cdata.status === "ended" && !cancelled) {
          onEndRef.current?.();
        }
      } catch (err) {
        // Polling-level error (network, auth blip): non-fatal, retried on
        // next interval. Log so we can see it during dev.
        logCallWarn("tick", err);
      }
    };

    const interval = setInterval(() => void tick(), 1500);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(interval);
      cleanup();
    };
    // ensurePeer / sendSignalSafe / refreshRemote / cleanup are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, callId]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    setMuted((cur) => {
      const next = !cur;
      try {
        stream.getAudioTracks().forEach((t) => (t.enabled = !next));
      } catch (err) {
        logCallWarn("toggleMute", err);
      }
      return next;
    });
  }, []);

  // Reset mute when we lose the local stream (e.g. demoted to listener).
  useEffect(() => {
    if (!isSpeaker && muted) {
      setMuted(false);
    }
  }, [isSpeaker, muted]);

  return { remotePeers, call, error, muted, ready, toggleMute };
}
