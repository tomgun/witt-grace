/**
 * must: the invite link round-trips (signal, secret, host key, the door it opens) and refuses anything else; a link
 *       always names its own token, so a personal link never yields a general one; relays are wss: except on this
 *       machine; the relay only ever sees hashes of the secret; only the host whose key the link names can prove
 *       itself; a password proof is bound to host key and invite and survives case, Unicode and separators;
 *       suggested passwords come from exactly 2048 Finnish words or a 32-symbol alphabet (WG-030, P2P-02, P2P-06)
 * test: tests/unit/session-link.test.ts
 * red-against: a link without a door token accepted; a plain ws:// relay on another host accepted; the secret used
 *              verbatim as the room id; a signature from another key accepted; a proof that verifies at another
 *              host; a word list that drifted from 2048 (biased or weaker suggestions)
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  base64url,
  encodeInvite,
  fromBase64url,
  isRelayUrl,
  normalizePassword,
  parseInvite,
  passwordSalt,
  probeProof,
} from '../../src/domain/index.ts';
import {
  createHostKey,
  passwordProof,
  roomAddress,
  suggestPassword,
  verifyHost,
} from '../../src/lib/p2p/keys.ts';
import { FI_WORDS } from '../../src/lib/p2p/words-fi.ts';

const SECRET = 'AAAAAAAAAAAAAAAAAAAAAA';
const KEY = 'BBBBBBBBBBBBBBBBBBBBBB';
const TOKEN = 'CCCCCCCCCCCCCCCCCCCCCC';

test('base64url matches the RFC 4648 vectors without padding', () => {
  const enc = (s: string) => base64url(new TextEncoder().encode(s));
  assert.equal(enc(''), '');
  assert.equal(enc('f'), 'Zg');
  assert.equal(enc('fo'), 'Zm8');
  assert.equal(enc('foo'), 'Zm9v');
  assert.equal(enc('foob'), 'Zm9vYg');
  assert.equal(base64url(Uint8Array.from([251, 255])), '-_8');
  assert.deepEqual([...(fromBase64url('-_8') as Uint8Array)], [251, 255]);
  assert.equal(new TextDecoder().decode(fromBase64url('Zm9vYg') as Uint8Array), 'foob');
  assert.equal(fromBase64url('Z'), null);
  assert.equal(fromBase64url('Zm9v+'), null);
});

test('a general nostr link and a personal relay link round-trip exactly', () => {
  const general = encodeInvite({
    signal: { strategy: 'nostr' },
    secret: SECRET,
    hostKey: KEY,
    access: { kind: 'general', token: TOKEN },
  });
  assert.equal(general, `join=1.n.${SECRET}.${KEY}.g${TOKEN}`);
  assert.deepEqual(parseInvite('#' + general), {
    ok: true,
    invite: {
      signal: { strategy: 'nostr' },
      secret: SECRET,
      hostKey: KEY,
      access: { kind: 'general', token: TOKEN },
    },
  });
  const urls = ['wss://signal.example.org/relay', 'ws://127.0.0.1:8787'];
  for (const kind of ['personal', 'password'] as const) {
    const link = encodeInvite({
      signal: { strategy: 'relay', urls },
      secret: SECRET,
      hostKey: KEY,
      access: { kind, token: TOKEN },
    });
    assert.ok(link.endsWith(`.${kind === 'personal' ? 'p' : 'k'}${TOKEN}`));
    assert.deepEqual(parseInvite(link), {
      ok: true,
      invite: {
        signal: { strategy: 'relay', urls },
        secret: SECRET,
        hostKey: KEY,
        access: { kind, token: TOKEN },
      },
    });
  }
});

test('malformed, foreign and future links are refused with a reason; a link always names its door', () => {
  assert.deepEqual(parseInvite('#view=1'), { ok: false, reason: 'not-invite' });
  assert.deepEqual(parseInvite(`#join=2.n.${SECRET}.${KEY}.g${TOKEN}`), { ok: false, reason: 'version' });
  assert.deepEqual(parseInvite(`#join=1.n.${SECRET.slice(1)}.${KEY}.g${TOKEN}`), {
    ok: false,
    reason: 'malformed',
  });
  assert.deepEqual(parseInvite(`#join=1.n.${SECRET}.${KEY}`), { ok: false, reason: 'malformed' });
  assert.deepEqual(parseInvite(`#join=1.n.${SECRET}.${KEY}.${TOKEN}`), { ok: false, reason: 'malformed' });
  assert.deepEqual(parseInvite(`#join=1.n.${SECRET}.${KEY}.x${TOKEN}`), { ok: false, reason: 'malformed' });
  assert.deepEqual(parseInvite(`#join=1.x.${SECRET}.${KEY}.g${TOKEN}`), { ok: false, reason: 'malformed' });
  assert.deepEqual(parseInvite(`#join=1.n.${SECRET}.${KEY}.g${TOKEN}.p${TOKEN}`), {
    ok: false,
    reason: 'malformed',
  });
  const plain = base64url(new TextEncoder().encode('ws://evil.example:8787'));
  assert.deepEqual(parseInvite(`#join=1.r~${plain}.${SECRET}.${KEY}.g${TOKEN}`), {
    ok: false,
    reason: 'relay',
  });
});

test('relay URLs: TLS anywhere, plain ws only on this machine, no credentials', () => {
  assert.equal(isRelayUrl('wss://relay.example.org'), true);
  assert.equal(isRelayUrl('ws://localhost:8787'), true);
  assert.equal(isRelayUrl('ws://127.0.0.1:8787/x'), true);
  assert.equal(isRelayUrl('ws://192.168.1.4:8787'), false);
  assert.equal(isRelayUrl('https://relay.example.org'), false);
  assert.equal(isRelayUrl('wss://user:pw@relay.example.org'), false);
  assert.equal(isRelayUrl('javascript:alert(1)'), false);
  assert.equal(isRelayUrl('not a url'), false);
});

test('the relay sees SHA-256 derivations of the secret, never the secret', async () => {
  const address = await roomAddress({ strategy: 'nostr' }, SECRET);
  assert.equal(address.roomId, '6fe4936e1563aa5cf327ba6a51e3490c86a7fc4bb2d1899af0de7666d2ab2a97');
  assert.equal(address.password, '0af765440736ef6882161eea1e70b3e5f85c6c190e678522c769921a25b930d4');
  assert.ok(!address.roomId.includes(SECRET) && !address.password.includes(SECRET));
});

test('only the key the link names can answer the probe', async () => {
  const host = await createHostKey();
  const impostor = await createHostKey();
  const text = probeProof(TOKEN, 'session-1');
  assert.equal(text, `witt-collab-v1|${TOKEN}|session-1`);
  const signature = await host.sign(text);
  assert.equal(await verifyHost(host.fingerprint, host.publicKey, signature, text), true);
  assert.equal(
    await verifyHost(host.fingerprint, host.publicKey, signature, probeProof(TOKEN, 'session-2')),
    false
  );
  const forged = await impostor.sign(text);
  assert.equal(await verifyHost(host.fingerprint, impostor.publicKey, forged, text), false);
  assert.equal(await verifyHost(host.fingerprint, host.publicKey, forged, text), false);
  assert.equal(host.fingerprint.length, 22);
});

test('passwords compare after normalising case, Unicode and separators; the proof is bound to host key and invite', async () => {
  assert.equal(normalizePassword('  Pilvi Kartta__norsu.SYKSY '), 'pilvi-kartta-norsu-syksy');
  assert.equal(normalizePassword('A\u0308'), 'ä', 'a decomposed ä is the same letter');
  assert.equal(passwordSalt(KEY, TOKEN), `witt-invite-v1|${KEY}|${TOKEN}`);
  const proof = await passwordProof('Pilvi kartta', passwordSalt(KEY, TOKEN), 1000);
  assert.equal(proof, await passwordProof('pilvi-KARTTA', passwordSalt(KEY, TOKEN), 1000));
  assert.match(proof, /^[0-9a-f]{64}$/);
  assert.notEqual(
    proof,
    await passwordProof('pilvi kartta', passwordSalt(SECRET, TOKEN), 1000),
    'another host key'
  );
  assert.notEqual(
    proof,
    await passwordProof('pilvi kartta', passwordSalt(KEY, SECRET), 1000),
    'another invite'
  );
  assert.notEqual(proof, await passwordProof('pilvi karttaa', passwordSalt(KEY, TOKEN), 1000));
});

test('suggested passwords: four words from exactly 2048 distinct ones in Finnish, three groups of four otherwise', () => {
  assert.equal(FI_WORDS.length, 2048);
  assert.equal(new Set(FI_WORDS).size, 2048);
  assert.ok(FI_WORDS.every((w) => /^[a-zäö]{3,10}$/.test(w)));
  const fi = suggestPassword('fi').split('-');
  assert.equal(fi.length, 4);
  assert.ok(fi.every((w) => FI_WORDS.includes(w)));
  assert.match(suggestPassword('en'), /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.equal(normalizePassword(suggestPassword('fi')).length >= 3 * 4 + 3, true);
});
