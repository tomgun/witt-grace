// The WebRTC adapter: Trystero (ADR A010) behind `PeerNetwork`. Each signaling strategy is a separate chunk loaded
// only when a person starts or joins a collaboration, so the editor itself never loads networking code. The only
// module allowed to import Trystero (ESLint).
import type { Room } from '@trystero-p2p/nostr';
import type { ConnectNetwork, PeerEvent, PeerNetwork } from './network.ts';

/** A TURN server this browser may relay through (Lisäasetukset); `urls` pass `isTurnUrl`. */
export interface TurnServer {
  urls: string[];
  username: string;
  credential: string;
}

const APP_ID = 'witt-grace-collab-v1';
/** Largest message a peer accepts; a document snapshot is the biggest thing that travels. */
const MAX_RECEIVE_BYTES = 6 * 1024 * 1024;
/**
 * Public Nostr relays used at once. Trystero picks them in a fixed order from the app id, so the first five are the
 * ones earlier versions used; more of them make it likelier that host and participant share a working relay.
 */
const NOSTR_REDUNDANCY = 8;
/** Trystero's message when signaling worked but no ICE candidate pair connected. */
const NO_DIRECT_PATH = /could not connect to peer/;

const isLocal = (url: string) => /^ws:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/.test(url);

/** The adapter, relaying through `turn` (when given) where no direct path opens. */
export const trysteroConnector =
  (turn: TurnServer[] = []): ConnectNetwork =>
  async (address) => {
    const base = {
      appId: APP_ID,
      password: address.password,
      maxReceiveBytes: MAX_RECEIVE_BYTES,
      ...(turn.length ? { turnConfig: turn } : {}),
    };
    const peerListeners = new Set<(event: PeerEvent) => void>();
    const callbacks = {
      onJoinError: ({ error, peerId }: { error: string; peerId: string }) => {
        if (NO_DIRECT_PATH.test(error)) peerListeners.forEach((l) => l({ peerId, kind: 'unreachable' }));
      },
    };
    let room;
    if (address.signal.strategy === 'relay') {
      const { joinRoom } = await import('@trystero-p2p/ws-relay');
      const urls = address.signal.urls;
      // A relay on this machine means a local test or demo: no public STUN, peers meet on loopback.
      const rtcConfig = urls.every(isLocal) && !turn.length ? { iceServers: [] } : undefined;
      room = joinRoom(
        { ...base, relayConfig: { urls }, ...(rtcConfig ? { rtcConfig } : {}) },
        address.roomId,
        callbacks
      );
    } else {
      const { joinRoom } = await import('@trystero-p2p/nostr');
      room = joinRoom({ ...base, relayConfig: { redundancy: NOSTR_REDUNDANCY } }, address.roomId, callbacks);
    }
    return adapt(room, peerListeners);
  };
export const connectTrystero: ConnectNetwork = trysteroConnector();

function adapt(room: Room, peerListeners: Set<(event: PeerEvent) => void>): PeerNetwork {
  const action = room.makeAction<string>('witt');
  const messageListeners = new Set<(peerId: string, message: string) => void>();
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
}
