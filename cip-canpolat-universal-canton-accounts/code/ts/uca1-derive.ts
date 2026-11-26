// UCA-1 Key derivation.
// Standard: BIP-39 seed -> SLIP-0010 ed25519 (hardened only).
//   Namespace key:    m/44'/6767'/a'/0'/0'   its fingerprint is the party's namespace, so it fixes the partyID
//   Signing key i:    m/44'/6767'/a'/1'/i'   listed in the PartyToKeyMapping, rotates without changing the partyID
// Legacy schemes are registered by name so existing accounts stay importable.
import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils";
import * as ed from "@noble/ed25519";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export const CANTON_COIN_TYPE = 6767; // SLIP-0044, Canton Coin
const HARDENED = 0x80000000;

export type DerivedKey = { scheme: string; path?: string; privateKey: string; publicKey: string };

// SLIP-0010 for ed25519: every level is hardened.
export function slip10Ed25519(seed: Uint8Array, path: number[]): { key: Uint8Array; chainCode: Uint8Array } {
  let I = hmac(sha512, utf8ToBytes("ed25519 seed"), seed);
  let key = I.slice(0, 32);
  let chainCode = I.slice(32);
  for (const index of path) {
    const i = (index | HARDENED) >>> 0;
    const data = concatBytes(new Uint8Array([0]), key, new Uint8Array([i >>> 24, (i >>> 16) & 0xff, (i >>> 8) & 0xff, i & 0xff]));
    I = hmac(sha512, chainCode, data);
    key = I.slice(0, 32);
    chainCode = I.slice(32);
  }
  return { key, chainCode };
}

export function standardPath(account = 0): number[] {
  return [44, CANTON_COIN_TYPE, account, 0, 0];
}

// Protocol signing keys live on their own branch, so rotating them (or moving
// to a threshold set) never touches the namespace key and the partyID.
export function signingPath(account = 0, index = 0): number[] {
  return [44, CANTON_COIN_TYPE, account, 1, index];
}

function toDerived(scheme: string, priv: Uint8Array, path?: string): DerivedKey {
  return { scheme, path, privateKey: bytesToHex(priv), publicKey: bytesToHex(ed.getPublicKey(priv)) };
}

function seedOf(mnemonic: string, passphrase = ""): Uint8Array {
  const clean = mnemonic.trim().toLowerCase().replace(/\s+/g, " ");
  if (!validateMnemonic(clean, wordlist)) throw new Error("invalid_mnemonic");
  return mnemonicToSeedSync(clean, passphrase);
}

// The namespace key for account index `account`.
export function deriveStandard(mnemonic: string, account = 0): DerivedKey {
  const { key } = slip10Ed25519(seedOf(mnemonic), standardPath(account));
  return toDerived("uca-1", key, `m/44'/${CANTON_COIN_TYPE}'/${account}'/0'/0'`);
}
export const deriveNamespace = deriveStandard;

// Protocol signing key `index` for account `account`.
export function deriveSigning(mnemonic: string, account = 0, index = 0): DerivedKey {
  const { key } = slip10Ed25519(seedOf(mnemonic), signingPath(account, index));
  return toDerived("uca-1-signing", key, `m/44'/${CANTON_COIN_TYPE}'/${account}'/1'/${index}'`);
}

// Legacy registry. Each entry turns a BIP-39 seed into a 32-byte ed25519 private key.
export const LEGACY_SCHEMES: Record<string, (seed: Uint8Array) => Uint8Array> = {
  // Wallet SDK guide: first 32 bytes of the BIP-39 seed.
  "wallet-sdk-seed32": (seed) => seed.slice(0, 32),
};

// A vendor registers its own scheme, for example sha256(seed || context).
export function registerContextScheme(name: string, context: string): void {
  LEGACY_SCHEMES[name] = (seed) => sha256(concatBytes(seed, utf8ToBytes(context)));
}

// Import order: the standard key first, then every registered legacy key.
// The caller asks UCA-2 which of these control an existing party.
export function deriveAll(mnemonic: string, accounts = 1): DerivedKey[] {
  const seed = seedOf(mnemonic);
  const out: DerivedKey[] = [];
  for (let a = 0; a < accounts; a++) {
    const { key } = slip10Ed25519(seed, standardPath(a));
    out.push(toDerived("uca-1", key, `m/44'/${CANTON_COIN_TYPE}'/${a}'/0'/0'`));
  }
  for (const [name, fn] of Object.entries(LEGACY_SCHEMES)) out.push(toDerived(name, fn(seed)));
  return out;
}

// A raw 32-byte private key (64 hex characters) is always accepted.
export function fromRawKey(hex: string): DerivedKey {
  const clean = hex.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(clean)) throw new Error("invalid_raw_key");
  return toDerived("raw", ed.etc.hexToBytes(clean));
}
