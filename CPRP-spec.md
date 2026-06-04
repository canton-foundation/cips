# CPRP-spec.md — Retired

This companion specification has been retired. Following the Working Group decision of May 28, 2026, the Canton Party Resolution Protocol is now defined by three independent, self-sustaining CIPs that do not share a common specification:

- CIP-XXXX — Party Name Resolution: FQPN format, resolver interface, resolution strategy, composition engine, collision detection, address books, name delegation, display model, off-ledger Resolution Service API, asset-naming extension, and the relationship to the `.canton` namespace. See `cprp-resolution.md`.
- CIP-YYYY — Party Identity Verification: trust tier framework (T1–T4), trust evaluator, verification policies, featured-resolver registry (SV governance → T3), revocation semantics. See `cprp-verification.md`.
- CIP-ZZZZ — Imported Names: per-source verification procedures for DNS, LEI/vLEI, ENS, and cross-chain identity, with each method declaring the trust tier its credentials carry under CIP-YYYY. See `cprp-imported-names.md`.

The `.canton` namespace itself — its registrars, its allocation policy, and the governance under which `cns` registrars are approved — is defined in a separate, complementary CIP led by Axymos (PR #209), not in any of the above.

Each of the three CIPs is intended to be reviewed and adopted independently. Cross-references between them are explicit and minimal.
