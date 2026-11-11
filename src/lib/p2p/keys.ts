// The volatile half of collaboration security: random tokens, the room values derived from the invite secret, and
// the host's signing key (ECDSA P-256, WebCrypto). The pure rules about what is signed live in src/domain/session.ts.
import { base64url, fromBase64url, normalizePassword } from '../../domain/index.ts';
import type { Signal } from '../../domain/index.ts';
import type { RoomAddress } from './network.ts';
import { FI_WORDS } from './words-fi.ts';

const subtle = () => globalThis.crypto.subtle;
const utf8 = (text: string) => new TextEncoder().encode(text);
const sha256 = async (text: string | Uint8Array<ArrayBuffer>) =>
  new Uint8Array(await subtle().digest('SHA-256', typeof text === 'string' ? utf8(text) : text));
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** 128 random bits as 22 base64url characters: secrets, invite and seat tokens, nonces. */
export const randomToken = (): string => base64url(globalThis.crypto.getRandomValues(new Uint8Array(16)));

/** The relay sees only hashes of the secret: one as the room id, another as the password that encrypts the offers. */
export async function roomAddress(signal: Signal, secret: string): Promise<RoomAddress> {
  return {
    signal,
    roomId: hex(await sha256(`witt-room-v1|${secret}`)),
    password: hex(await sha256(`witt-signal-v1|${secret}`)),
  };
}

/** What a host keeps to resume its session after a reload: the private key never leaves the browser (not extractable). */
export interface StoredHostKey {
  privateKey: CryptoKey;
  /** The public key (SPKI) in base64url, sent in the `host` answer. */
  publicKey: string;
  /** SHA-256 of the SPKI bytes, first 128 bits, base64url: the value the invite link carries. */
  fingerprint: string;
}
export interface HostKey extends StoredHostKey {
  sign(text: string): Promise<string>;
}
export const hostKeyFrom = (stored: StoredHostKey): HostKey => ({
  ...stored,
  async sign(text) {
    const signature = await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, stored.privateKey, utf8(text));
    return base64url(new Uint8Array(signature));
  },
});
export async function createHostKey(): Promise<HostKey> {
  const pair = await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const spki = new Uint8Array(await subtle().exportKey('spki', pair.publicKey));
  return hostKeyFrom({
    privateKey: pair.privateKey,
    publicKey: base64url(spki),
    fingerprint: await keyFingerprint(spki),
  });
}
export const keyFingerprint = async (spki: Uint8Array<ArrayBuffer>): Promise<string> =>
  base64url((await sha256(spki)).slice(0, 16));

/** True only when `publicKey` is the one the link names and it signed `text`. */
export async function verifyHost(
  fingerprint: string,
  publicKey: string,
  signature: string,
  text: string
): Promise<boolean> {
  const spki = fromBase64url(publicKey);
  const sig = fromBase64url(signature);
  if (!spki || !sig || (await keyFingerprint(spki)) !== fingerprint) return false;
  try {
    const key = await subtle().importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'verify',
    ]);
    return await subtle().verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, utf8(text));
  } catch {
    return false;
  }
}

/** PBKDF2 rounds for an invite password: slow enough that guessing offline costs years for a suggested password. */
export const PASSWORD_ROUNDS = 600_000;
/** The proof a participant sends for a password invite, and the verifier the host keeps (hex, 256 bits). */
export async function passwordProof(
  password: string,
  salt: string,
  rounds = PASSWORD_ROUNDS
): Promise<string> {
  const key = await subtle().importKey('raw', utf8(normalizePassword(password)), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: utf8(salt), iterations: rounds },
    key,
    256
  );
  return hex(new Uint8Array(bits));
}

/** Uniform random integers below `n` (a power of two up to 65536), from the browser's cryptographic generator. */
function randomBelow(n: number, count: number): number[] {
  return [...globalThis.crypto.getRandomValues(new Uint16Array(count))].map((v) => v & (n - 1));
}
/** Crockford's base32: no I, L, O or U, so no letter reads as a digit: 32 symbols, 5 bits each. */
const SYMBOLS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/**
 * A password to suggest: four Finnish words for a Finnish interface (44 bits, easy to say), otherwise three groups of
 * four clear characters (60 bits). Its strength is the randomness, not the method: the code may be read by anyone.
 */
export function suggestPassword(language: string): string {
  if (language === 'fi')
    return randomBelow(FI_WORDS.length, 4)
      .map((i) => FI_WORDS[i])
      .join('-');
  const chars = randomBelow(32, 12).map((i) => SYMBOLS[i]);
  return [0, 4, 8].map((i) => chars.slice(i, i + 4).join('')).join('-');
}
