// UCA-3 request authentication: only the party's own key reads the party's data.
// Signed message: `${ts}\n${METHOD}\n${path}\n${hex(sha256(body))}`
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import * as ed from "@noble/ed25519";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export const MAX_AGE_MS = 60_000;

export function canonicalMessage(ts: number, method: string, path: string, body: string): Uint8Array {
  return utf8ToBytes(`${ts}\n${method.toUpperCase()}\n${path}\n${bytesToHex(sha256(utf8ToBytes(body)))}`);
}

// Wallet side.
export function signRequest(privateKeyHex: string, party: string, method: string, path: string, body = "", now = Date.now()) {
  const sig = ed.sign(canonicalMessage(now, method, path, body), hexToBytes(privateKeyHex));
  return { "X-UCA-Party": party, "X-UCA-Ts": String(now), "X-UCA-Sig": bytesToHex(sig) };
}

// Host side. `publicKeyOf` returns the party's registered key from the host's topology state.
export type VerifyResult = { ok: true; party: string } | { ok: false; reason: string };

export function makeVerifier(publicKeyOf: (party: string) => Promise<string | null>) {
  const seen = new Map<string, number>(); // sig -> expiry, replay guard

  return async function verify(h: Record<string, string | undefined>, method: string, path: string, body: string, now = Date.now()): Promise<VerifyResult> {
    const party = h["x-uca-party"];
    const ts = Number(h["x-uca-ts"]);
    const sig = h["x-uca-sig"];
    if (!party || !sig || !Number.isFinite(ts)) return { ok: false, reason: "missing_headers" };
    if (Math.abs(now - ts) > MAX_AGE_MS) return { ok: false, reason: "stale" };
    for (const [k, exp] of seen) if (exp < now) seen.delete(k);
    if (seen.has(sig)) return { ok: false, reason: "replay" };
    const pk = await publicKeyOf(party);
    if (!pk) return { ok: false, reason: "unknown_party" };
    const valid = ed.verify(hexToBytes(sig), canonicalMessage(ts, method, path, body), hexToBytes(pk));
    if (!valid) return { ok: false, reason: "bad_signature" };
    seen.set(sig, ts + MAX_AGE_MS);
    return { ok: true, party };
  };
}
