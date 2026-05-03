import {
  RTCPeerConnection as RNRTCPeerConnection,
  mediaDevices as rnMediaDevices,
} from "react-native-webrtc";

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

// react-native-webrtc's exports are structurally a superset of our minimal
// interfaces. Cast through `unknown` once, at the boundary, so the rest of
// the code stays strongly typed.
export const RTCPeerConnection: PeerConnectionConstructor =
  RNRTCPeerConnection as unknown as PeerConnectionConstructor;

export const mediaDevices: MediaDevices =
  rnMediaDevices as unknown as MediaDevices;
