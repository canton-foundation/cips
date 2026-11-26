# Universal Canton Accounts: reference code

Reference code for the six parts of the CIP draft. Tested; not production software.

| File | Part | What it does |
|---|---|---|
| `ts/uca1-derive.ts` | UCA-1 | BIP-39 seed, SLIP-0010 ed25519; namespace key `m/44'/6767'/a'/0'/0'`, signing keys `m/44'/6767'/a'/1'/i'`; legacy scheme registry, raw key import |
| `ts/uca2-party.ts` | UCA-2 | Deterministic hint `hex(sha256(pubkey))[0:48]`, discovery client, import rule |
| `ts/uca2-credential.ts` | UCA-2 | Account credential signed by the namespace key; covers parties created with any hint; issuer-free verification |
| `ts/uca3-auth.ts` | UCA-3 | Party-signed requests: sign (wallet) and verify with 60 s window and replay guard (host) |
| `ts/uca3-host-service.ts` | UCA-3 | Host data service skeleton on the Ledger JSON API v2 (holdings, contracts, pending, packages, optional prepare/execute) |
| `ts/uca6-split.ts` | UCA-6 | Reward beneficiary split, 70/30 default, Daml Decimal precision, sums to exactly 1.0 |
| `ts/test.ts` | all | SLIP-0010 official vector 1, UCA vectors, signing branch, credential (valid, tampered, wrong namespace), auth (valid, replay, stale, bad signature), split |
| `py/uca1_derive.py` | UCA-1, UCA-2 | Independent Python implementation, checked against `vectors.json` |
| `py/uca2_credential.py` | UCA-2 | Python credential; same canonical form, identical signatures to TypeScript |
| `py/uca3_auth.py` | UCA-3 | Python signer; its signatures verify in the TypeScript host |
| `vectors.json` | UCA-1, UCA-2 | Test vectors from the public BIP-39 test mnemonic: namespace keys, signing keys, legacy schemes |
| `credential-fixture.json` | UCA-2 | Credential for a legacy party, produced by the test run |

UCA-4 (portable hosting) and UCA-5 (package registry) are operational procedures on top of Canton party replication and package vetting; they are described in the architecture document, not in code.

## Run

```
npm i
npx tsc -p . && npx tsx ts/test.ts
pip install cryptography && python3 py/uca1_derive.py vectors.json && python3 py/uca2_credential.py credential-fixture.json
```

Results on 2026-11-26: `ALL TESTS PASS`; `python matches vectors: 4 keys, 2 signing keys`; `python verifies credential: True`, and a Python-issued credential has the identical signature; Python-signed request verified by the TypeScript host.
