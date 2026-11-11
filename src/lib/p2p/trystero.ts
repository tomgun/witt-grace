// The WebRTC adapter: Trystero (ADR A010) behind `PeerNetwork`. Each signaling strategy is a separate chunk loaded
// only when a person starts or joins a collaboration, so the editor itself never loads networking code. The only
// module allowed to import Trystero (ESLint).
import type { ConnectNetwork, PeerEvent, PeerNetwork } from './network.ts';

const APP_ID = 'witt-grace-collab-v1';
/** Largest message a peer accepts; a document snapshot is the biggest thing that travels. */
const MAX_RECEIVE_BYTES = 6 * 1024 * 1024;

const isLocal = (url: string) => /^ws:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/.test(url);

export const connectTrystero: ConnectNetwork = async (address) => {
  const base = { appId: APP_ID, password: address.password, maxReceiveBytes: MAX_RECEIVE_BYTES };
  let room;
  if (address.signal.strategy === 'relay') {
    const { joinRoom } = await import('@trystero-p2p/ws-relay');
    const urls = address.signal.urls;
    // A relay on this machine means a local test or demo: no public STUN, peers meet on loopback.
    const rtcConfig = urls.every(isLocal) ? { iceServers: [] } : undefined;
    room = joinRoom({ ...base, relayConfig: { urls }, ...(rtcConfig ? { rtcConfig } : {}) }, address.roomId);
  } else {
    const { joinRoom } = await import('@trystero-p2p/nostr');
    room = joinRoom(base, address.roomId);
  }
  const action = room.makeAction<string>('witt');
  const messageListeners = new Set<(peerId: string, message: string) => void>();
  const peerListeners = new Set<(event: PeerEvent) => void>();
  action.onMessage = (data, { peerId }) => {
    if (typeof data === 'string') messageListeners.forEach((l) => l(peerId, data));
  };
  room.onPeerJoin = (peerId) => peerListeners.forEach((l) => l({ peerId, kind: 'joined' }));
  room.onPeerLeave = (peerId) => peerListeners.forEach((l) => l({ peerId, kind: 'left' }));
  const network: PeerNetwork = {
    sendTo: (peerId, message) => {
      void action.send(message, { target: peerId }).catch(() => undefined);
    },
    onMessage: (listener) => {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    onPeer: (listener) => {
      peerListeners.add(listener);
      return () => peerListeners.delete(listener);
    },
    leave: () => room.leave(),
  };
  return network;
};
