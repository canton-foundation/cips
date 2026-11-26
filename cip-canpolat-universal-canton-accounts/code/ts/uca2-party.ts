// UCA-2 Deterministic party id and discovery.
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

// hint = hex(sha256(raw 32-byte ed25519 public key))[0:48]
export function partyHint(publicKeyHex: string): string {
  const pk = hexToBytes(publicKeyHex);
  if (pk.length !== 32) throw new Error("public_key_must_be_32_bytes");
  return bytesToHex(sha256(pk)).slice(0, 48);
}

// The fingerprint is computed by Canton when the party topology is generated
// (Ledger API: POST /v2/parties/external/generate-topology). A wallet only
// checks that the party it is about to use carries the deterministic hint.
export function followsUca2(partyId: string, publicKeyHex: string): boolean {
  return partyId.startsWith(partyHint(publicKeyHex) + "::");
}

export type DiscoveredParty = {
  partyId: string;
  threshold: number;
  hosts: { participantId: string; permission: "Submission" | "Confirmation" | "Observation"; ucaBaseUrl?: string; rewardParty?: string }[];
};

// Discovery for parties created before UCA-2.
// GET {scan}/api/scan/v0/namespaces/{fingerprint}/parties
export async function discover(scanBaseUrl: string, fingerprint: string): Promise<DiscoveredParty[]> {
  const r = await fetch(`${scanBaseUrl}/api/scan/v0/namespaces/${encodeURIComponent(fingerprint)}/parties`);
  if (!r.ok) throw new Error(`discovery_failed:${r.status}`);
  const body = (await r.json()) as { parties?: DiscoveredParty[] };
  return body.parties ?? [];
}

// Import rule: deterministic party first, discovery second, never a silent new party.
export async function resolveParty(opts: {
  publicKeyHex: string;
  fingerprint: string;
  scanBaseUrl: string;
}): Promise<{ kind: "deterministic" | "discovered" | "none"; parties: DiscoveredParty[] }> {
  const found = await discover(opts.scanBaseUrl, opts.fingerprint);
  const det = found.filter((p) => followsUca2(p.partyId, opts.publicKeyHex));
  if (det.length) return { kind: "deterministic", parties: det };
  if (found.length) return { kind: "discovered", parties: found };
  return { kind: "none", parties: [] };
}
