import type {
  MediaDevices,
  PeerConnectionConstructor,
} from "@/hooks/webrtcShim";

export type {
  IceCandidateLike,
  IceCandidatePayload,
  MediaDevices,
  MediaStream,
  MediaTrack,
  PeerConnection,
  PeerConnectionConstructor,
  PeerIceEvent,
  PeerTrackEvent,
  SessionDescription,
} from "@/hooks/webrtcShim";

// Browser DOM `RTCPeerConnection` / `navigator.mediaDevices` are structurally
// compatible with our minimal `PeerConnection` / `MediaDevices` interfaces.
// We deliberately cast through `unknown` here (not `any`) so the cast is
// confined to this single boundary and the rest of the code stays typed.
export const RTCPeerConnection: PeerConnectionConstructor =
  typeof window !== "undefined"
    ? (window.RTCPeerConnection as unknown as PeerConnectionConstructor)
    : (undefined as unknown as PeerConnectionConstructor);

export const mediaDevices: MediaDevices =
  typeof navigator !== "undefined" && navigator.mediaDevices
    ? (navigator.mediaDevices as unknown as MediaDevices)
    : {
        getUserMedia: () =>
          Promise.reject(new Error("getUserMedia unavailable")),
      };
