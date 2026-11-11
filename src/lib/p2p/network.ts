// The seam between the collaboration protocol and whatever carries its messages. The session controller sees only
// this interface; `trystero.ts` is the WebRTC adapter, `LoopbackHub` an in-memory one for tests. Messages are strings
// (JSON), so the size limits are checked on what actually crosses the wire.

export type PeerEvent = { peerId: string; kind: 'joined' | 'left' };

export interface PeerNetwork {
  /** Send to one peer; silently dropped when that peer is gone (the protocol notices through `left`). */
  sendTo(peerId: string, message: string): void;
  onMessage(listener: (peerId: string, message: string) => void): () => void;
  onPeer(listener: (event: PeerEvent) => void): () => void;
  leave(): Promise<void>;
}

/** Where the peers meet: values derived from the invite secret (`keys.ts`), never the secret itself. */
export interface RoomAddress {
  /** The public Nostr relays Trystero knows, or the relay URLs the inviter chose. */
  signal: { strategy: 'nostr' } | { strategy: 'relay'; urls: string[] };
  roomId: string;
  password: string;
}

export type ConnectNetwork = (room: RoomAddress) => Promise<PeerNetwork>;

/**
 * An in-memory network for tests: every peer that joins the same hub sees the others. Delivery is manual
 * (`flush`), so a test can hold, reorder or drop messages and watch the protocol cope.
 */
export class LoopbackHub {
  private readonly peers = new Map<
    string,
    { messages: Set<(from: string, m: string) => void>; events: Set<(e: PeerEvent) => void> }
  >();
  /** Messages in flight, in send order; a departure is queued too, so what a peer sent before leaving arrives first. */
  queue: { from: string; to: string; message: string | null }[] = [];

  join(peerId: string): PeerNetwork {
    const self = {
      messages: new Set<(from: string, m: string) => void>(),
      events: new Set<(e: PeerEvent) => void>(),
    };
    // The newcomer is reachable before anyone hears of it, as with a WebRTC channel that has opened.
    const others = [...this.peers.values()];
    this.peers.set(peerId, self);
    for (const entry of others) entry.events.forEach((l) => l({ peerId, kind: 'joined' }));
    return {
      sendTo: (to, message) => {
        if (this.peers.has(to)) this.queue.push({ from: peerId, to, message });
      },
      onMessage: (listener) => {
        self.messages.add(listener);
        return () => self.messages.delete(listener);
      },
      onPeer: (listener) => {
        self.events.add(listener);
        // Like WebRTC, a listener added after joining still hears about the peers already there.
        const present = [...this.peers.keys()].filter((other) => other !== peerId);
        queueMicrotask(() => present.forEach((other) => listener({ peerId: other, kind: 'joined' })));
        return () => self.events.delete(listener);
      },
      leave: async () => {
        this.peers.delete(peerId);
        this.queue = this.queue.filter((q) => q.to !== peerId);
        for (const other of this.peers.keys()) this.queue.push({ from: peerId, to: other, message: null });
      },
    };
  }

  /** Deliver everything queued, including what the deliveries send in turn, up to `limit` messages. */
  flush(limit = 10_000): number {
    let delivered = 0;
    while (this.queue.length && delivered < limit) {
      const { from, to, message } = this.queue.shift() as {
        from: string;
        to: string;
        message: string | null;
      };
      const peer = this.peers.get(to);
      if (message === null) peer?.events.forEach((l) => l({ peerId: from, kind: 'left' }));
      else peer?.messages.forEach((l) => l(from, message));
      delivered++;
    }
    return delivered;
  }
}
