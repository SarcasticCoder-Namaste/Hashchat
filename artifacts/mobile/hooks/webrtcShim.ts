// Shared minimal WebRTC interface used by both the browser build
// (webrtcShim.web.ts) and the native build (webrtcShim.native.ts).
//
// These types are a small structural subset of the DOM lib's
// `RTCPeerConnection` / `MediaStream` and react-native-webrtc's equivalents.
// We intentionally keep them narrow to what useGroupCall actually calls so
// the same call sites compile against either backend without sprinkling
// `any` everywhere.

export interface MediaTrack {
  enabled: boolean;
  stop: () => void;
}

export interface MediaStream {
  getTracks: () => MediaTrack[];
  getAudioTracks: () => MediaTrack[];
}

export interface IceCandidatePayload {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export interface IceCandidateLike {
  candidate: string | null;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  toJSON?: () => IceCandidatePayload;
}

export interface SessionDescription {
  type: "offer" | "answer" | "pranswer" | "rollback";
  sdp?: string;
}

export interface PeerIceEvent {
  candidate: IceCandidateLike | null;
}

export interface PeerTrackEvent {
  track: MediaTrack;
  streams: MediaStream[];
}

export interface PeerConnection {
  connectionState: string;
  onicecandidate: ((e: PeerIceEvent) => void) | null;
  ontrack: ((e: PeerTrackEvent) => void) | null;
  onconnectionstatechange: (() => void) | null;
  addTrack: (track: MediaTrack, stream: MediaStream) => void;
  addTransceiver: (
    kind: "audio" | "video",
    init?: { direction?: "sendrecv" | "sendonly" | "recvonly" | "inactive" },
  ) => unknown;
  createOffer: (opts?: {
    offerToReceiveAudio?: boolean;
    offerToReceiveVideo?: boolean;
  }) => Promise<SessionDescription>;
  createAnswer: () => Promise<SessionDescription>;
  setLocalDescription: (desc: SessionDescription) => Promise<void>;
  setRemoteDescription: (desc: SessionDescription) => Promise<void>;
  addIceCandidate: (cand: IceCandidatePayload) => Promise<void>;
  close: () => void;
}

export interface PeerConnectionConstructor {
  new (config: { iceServers: { urls: string | string[] }[] }): PeerConnection;
}

export interface MediaDevices {
  getUserMedia: (constraints: {
    audio?: boolean | Record<string, unknown>;
    video?: boolean | Record<string, unknown>;
  }) => Promise<MediaStream>;
}

// Fallback (non-platform) implementation: kept so that if Metro/Expo ever
// fails to pick a platform-specific module the call sites still typecheck
// and we throw a clear error at runtime instead of crashing on undefined.
export const RTCPeerConnection: PeerConnectionConstructor = (() => {
  throw new Error(
    "webrtcShim: platform-specific implementation not loaded. " +
      "Make sure Metro/Expo is picking webrtcShim.web.ts or webrtcShim.native.ts.",
  );
}) as unknown as PeerConnectionConstructor;

export const mediaDevices: MediaDevices = {
  getUserMedia: () => {
    throw new Error("webrtcShim: platform-specific implementation not loaded.");
  },
};
