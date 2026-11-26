import assert from "node:assert/strict";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { slip10Ed25519, deriveAll, deriveStandard, deriveSigning, fromRawKey, registerContextScheme } from "./uca1-derive";
import { issueCredential, verifyCredential, accountId } from "./uca2-credential";
import { writeFileSync } from "node:fs";
import { partyHint, followsUca2 } from "./uca2-party";
import { signRequest, makeVerifier } from "./uca3-auth";
import { rewardSplit } from "./uca6-split";

// SLIP-0010 ed25519 test vector 1
const seed = hexToBytes("000102030405060708090a0b0c0d0e0f");
let r = slip10Ed25519(seed, []);
assert.equal(bytesToHex(r.key), "2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7");
assert.equal(bytesToHex(r.chainCode), "90046a93de5380a72b5e45010748567d5ea02bbf6522f979e05c0d8d8ca9fffb");
r = slip10Ed25519(seed, [0]);
assert.equal(bytesToHex(r.key), "68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3");
assert.equal(bytesToHex(r.chainCode), "8b59aa11380b624e81507a27fedda59fea6d0b779a778918a2fd3590e16e9c69");

// UCA vector (BIP-39 test mnemonic, public)
const M = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
registerContextScheme("vendor-native-v1", "VENDOR_CONTEXT");
const all = deriveAll(M, 2);
const std = deriveStandard(M, 0);
assert.equal(all[0].privateKey, std.privateKey);
assert.equal(fromRawKey(std.privateKey).publicKey, std.publicKey);
const hint = partyHint(std.publicKey);
assert.equal(hint.length, 48);
assert.ok(followsUca2(`${hint}::1220${"ab".repeat(32)}`, std.publicKey));
// Namespace and signing keys are on separate branches.
const sig0 = deriveSigning(M, 0, 0);
const sig1 = deriveSigning(M, 0, 1);
assert.notEqual(sig0.privateKey, std.privateKey);
assert.notEqual(sig0.privateKey, sig1.privateKey);
assert.equal(sig0.path, "m/44'/6767'/0'/1'/0'");
console.log(JSON.stringify({ mnemonic: M, keys: all.map((k) => ({ ...k, hint: partyHint(k.publicKey) })), signingKeys: [sig0, sig1] }, null, 2));

// UCA-3 auth
const party = `${hint}::1220${"ab".repeat(32)}`;
const verify = makeVerifier(async (p) => (p === party ? std.publicKey : null));
const now = Date.now();
const path = `/uca/v1/parties/${party}/holdings`;
const h = signRequest(std.privateKey, party, "GET", path, "", now);
const lower = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
(async () => {
  assert.deepEqual(await verify(lower, "GET", path, "", now), { ok: true, party });
  assert.deepEqual(await verify(lower, "GET", path, "", now), { ok: false, reason: "replay" });
  const h2 = Object.fromEntries(Object.entries(signRequest(std.privateKey, party, "GET", path, "", now)).map(([k, v]) => [k.toLowerCase(), v]));
  assert.deepEqual(await verify(h2, "GET", path, "", now + 61_000), { ok: false, reason: "stale" });
  const h3 = Object.fromEntries(Object.entries(signRequest(std.privateKey, party, "GET", path, "", now + 5)).map(([k, v]) => [k.toLowerCase(), v]));
  assert.deepEqual(await verify({ ...h3, "x-uca-ts": String(now + 6) }, "GET", path, "", now), { ok: false, reason: "bad_signature" });

  // UCA-6 split
  const s3 = rewardSplit({ walletProvider: "w", walletValidatorHostsParty: false, hostRewardParties: ["h1", "h2", "h3"] });
  const sum = s3.reduce((a, b) => a + BigInt(b.weight.replace(".", "")), 0n);
  assert.equal(sum, 10_000_000_000n);
  assert.equal(s3[0].weight, "0.7000000000");
  assert.deepEqual(rewardSplit({ walletProvider: "w", walletValidatorHostsParty: true, hostRewardParties: ["h1"] }), [{ beneficiary: "w", weight: "1.0000000000" }]);
  console.log("split", JSON.stringify(s3));
  // UCA-2 credential: a legacy party (random hint) is covered by a credential signed with its namespace key.
  const legacyParty = `legacy-wallet-7f3a::1220${"cd".repeat(32)}`;
  const owns = async (nsPk: string, p: string) => nsPk === std.publicKey && p === legacyParty;
  const cred = issueCredential(std.privateKey, {
    partyId: legacyParty, signingPublicKeys: [sig0.publicKey], threshold: 1,
    hosts: ["PAR::thehub-validator-2::1220" + "ef".repeat(32)], issuedAt: "2026-11-26T20:00:00Z",
  });
  assert.equal(cred.claims.accountId, accountId(std.publicKey));
  assert.equal(cred.claims.accountId, hint);
  assert.deepEqual(await verifyCredential(cred, owns), { ok: true });
  assert.deepEqual(await verifyCredential({ ...cred, claims: { ...cred.claims, threshold: 2 } }, owns), { ok: false, reason: "bad_signature" });
  assert.deepEqual(await verifyCredential({ ...cred, claims: { ...cred.claims, partyId: "other::1220" + "00".repeat(32) } }, owns), { ok: false, reason: "bad_signature" });
  const other = issueCredential(all[2].privateKey, { partyId: legacyParty, signingPublicKeys: [], threshold: 1, hosts: [], issuedAt: "2026-11-26T20:00:00Z" });
  assert.deepEqual(await verifyCredential(other, owns), { ok: false, reason: "namespace_not_owner" });
  writeFileSync("credential-fixture.json", JSON.stringify(cred, null, 2));
  console.log("credential", cred.claims.accountId);
  console.log("ALL TESTS PASS");
})();
