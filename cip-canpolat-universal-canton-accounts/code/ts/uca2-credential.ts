// UCA-2 Account credential.
// The deterministic account identifier is carried as a credential associated
// with the partyID, so partyID generation stays unrestricted and parties created
// before UCA (with any hint) are covered without migration.
//
// The credential is signed by the party's namespace key. A verifier checks the
// signature with the namespace public key and checks, against topology state,
// that this key's fingerprint is the namespace of `partyId`. No issuer is trusted.
// The field layout follows the Identity & Metadata SIG credential model once
// that schema is published; until then this is the minimal form.
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import * as ed from "@noble/ed25519";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export const CREDENTIAL_TYPE = "uca-account-v1";

export type AccountClaims = {
  type: typeof CREDENTIAL_TYPE;
  accountId: string; // hex(sha256(namespace public key))[0:48], the deterministic identifier
  partyId: string;
  namespacePublicKey: string; // hex, raw 32-byte ed25519
  signingPublicKeys: string[]; // current PartyToKeyMapping keys, hex
  threshold: number;
  hosts: string[]; // participant ids
  issuedAt: string; // ISO 8601, UTC
};

export type AccountCredential = { claims: AccountClaims; signature: string };

export function accountId(namespacePublicKeyHex: string): string {
  const pk = hexToBytes(namespacePublicKeyHex);
  if (pk.length !== 32) throw new Error("public_key_must_be_32_bytes");
  return bytesToHex(sha256(pk)).slice(0, 48);
}

// Canonical form: JSON with keys sorted at every level, no whitespace.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function issueCredential(namespacePrivateKeyHex: string, claims: Omit<AccountClaims, "type" | "accountId" | "namespacePublicKey">): AccountCredential {
  const namespacePublicKey = bytesToHex(ed.getPublicKey(hexToBytes(namespacePrivateKeyHex)));
  const full: AccountClaims = { type: CREDENTIAL_TYPE, accountId: accountId(namespacePublicKey), namespacePublicKey, ...claims };
  const signature = bytesToHex(ed.sign(utf8ToBytes(canonical(full)), hexToBytes(namespacePrivateKeyHex)));
  return { claims: full, signature };
}

export type CredentialCheck = { ok: true } | { ok: false; reason: string };

// `namespaceOf` resolves, from topology state, whether the given namespace key owns the party.
export async function verifyCredential(
  cred: AccountCredential,
  namespaceOwnsParty: (namespacePublicKeyHex: string, partyId: string) => Promise<boolean>,
): Promise<CredentialCheck> {
  const c = cred.claims;
  if (c.type !== CREDENTIAL_TYPE) return { ok: false, reason: "wrong_type" };
  if (c.accountId !== accountId(c.namespacePublicKey)) return { ok: false, reason: "account_id_mismatch" };
  const valid = ed.verify(hexToBytes(cred.signature), utf8ToBytes(canonical(c)), hexToBytes(c.namespacePublicKey));
  if (!valid) return { ok: false, reason: "bad_signature" };
  if (!(await namespaceOwnsParty(c.namespacePublicKey, c.partyId))) return { ok: false, reason: "namespace_not_owner" };
  return { ok: true };
}
