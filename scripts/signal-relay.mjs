// The self-hostable signaling relay for live collaboration (ADR A010): a WebSocket topic relay that forwards
// encrypted WebRTC offers between browsers and stores nothing. Used by the browser tests on 127.0.0.1:8787, and the
// same file runs on a VPS behind a TLS proxy (wss://). Usage: node scripts/signal-relay.mjs [port] [host]
// Exit codes: 0 stopped · 2 could not listen.
import { createWsRelayServer } from '@trystero-p2p/ws-relay/server';

const port = Number(process.argv[2] ?? process.env.PORT ?? 8787);
const host = process.argv[3] ?? process.env.HOST ?? '127.0.0.1';
const relay = createWsRelayServer({
  port,
  host,
  maxPayload: 256 * 1024,
  onError: (error) => console.error(`signal-relay: ${error.message}`),
});
relay.ready.then(
  () => console.log(`signal-relay listening on ws://${host}:${port}`),
  (error) => {
    console.error(`signal-relay: cannot listen on ${host}:${port}: ${error.message}`);
    process.exit(2);
  }
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => void relay.close().then(() => process.exit(0)));
