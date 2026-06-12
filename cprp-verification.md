Number: CIP-YYYY

Title: Canton Party Identity Verification — Trust Framework

Status: Draft

Author: Paolo Domenighetti (Freename)

Created: 2026-05-31

## Abstract

This CIP defines the trust framework that determines whether a resolved Canton party identity qualifies as "verified" — the condition for removing the `.unverified` prefix carried by self-registered CNS 1.0 names. It specifies a four-tier classification of credential issuers (T1–T4), an application-configurable verification policy schema, a trust evaluation algorithm that yields a `VERIFIED` / `PARTIAL` / `UNVERIFIED` / `COLLISION` / `ERROR` judgment, the featured-resolver registry governed by Super Validator (SV) vote that grants T3 issuer status, and the revocation semantics that bound how quickly trust changes propagate.

This CIP does not define the resolution interface, the FQPN format, the composition engine, or the display model (specified in CIP-XXXX, Party Name Resolution). It does not specify per-source verification procedures such as DNS validation or vLEI verification (specified in CIP-ZZZZ, Imported Names). It does not define Canton-native naming or the `.canton` namespace (specified in the `.canton` CIP led by Axymos). It defines only the trust framework that all of those CIPs declare into and consume.

## Motivation

The Identity and Metadata Working Group's central framing question — "How do we remove the `.unverified` prefix?" — is fundamentally a trust question. CNS 1.0 names are first-come-first-serve with no ownership check, so a resolved name like `goldmansachs.unverified.cns` conveys no signal about whether it actually belongs to Goldman Sachs.

A workable answer must:

- Be uniform across applications, so that "verified" means the same thing in a block explorer, a settlement system, and a compliance tool.
- Be configurable per application, because different applications legitimately have different risk tolerances (an explorer accepts more than a settlement system).
- Compose with multiple identity sources at once (DNS, vLEI, ENS, native Canton naming) without locking the framework to any one.
- Be governance-light, requiring SV votes only at the boundary where authority is granted (featured resolvers) and not in normal-path operation.

Without this framework, every resolver and every application reinvents trust, and credentials issued by different operators have no comparable basis. This CIP fixes the trust vocabulary so the rest of the stack — resolution (CIP-XXXX), imported names (CIP-ZZZZ), Canton-native naming (`.canton` CIP), and party profiles (CIP-169 from PixelPlex) — can coordinate.

## Specification

### 1. Scope

This CIP specifies:

- The four trust tiers (T1–T4) and the criteria for issuing credentials at each tier.
- The verification policy schema by which an application declares its trust requirements.
- The trust evaluation algorithm that combines a composed resolution result (from CIP-XXXX) with an application's policy to produce a trust verdict.
- The featured-resolver registry, the SV governance vote that grants T3 issuer status, and the renewal cadence.
- The `ResolverFeaturedStatus` credential that encodes featured-resolver status on-ledger.
- Revocation semantics — the maximum time bounds for credential expiry, issuer revocation, and featured-status revocation to take effect.

The following are explicitly out of scope and deferred to other CIPs:

- Per-source verification procedures (DNSSEC mechanics, GLEIF queries, ENS resolution) — CIP-ZZZZ.
- The resolver interface and composition engine — CIP-XXXX.
- Encrypted-field cryptography — deferred to a follow-up CIP; a design summary is retained in Section 8.
- Governance-based arbitration of disputed names across featured resolvers — deferred to the future governance CIP.

### 2. Trust Tiers

Every credential consumed by trust evaluation MUST declare a tier via the `cprp/trust-anchor` claim. Tiers are assigned by the issuing authority and reflect the credential's authority source, not the publishing intermediary's reputation.

| Tier | Authority Source | Granted By | Weight Range | Example Issuers |
|------|------------------|------------|--------------|-----------------|
| T1 | DSO / SV Consensus | On-ledger SV vote | 1.0 | SV-verified DNS claims (future); DSO arbitration credentials (future governance CIP) |
| T2 | Regulated identity authority | External regulation (GLEIF, KYC registry, national ID) | 0.7–0.9 | vLEI issued under GLEIF; KYC-verified credentials from regulated providers |
| T3 | Featured resolver | SV governance vote (annual renewal) | 0.4–0.6 | Featured-resolver DNS verifications; featured-resolver ENS verifications; featured-resolver native registrations |
| T4 | Self-attested | None | 0.1–0.2 | Party-published profile claims; unverified LEI lookups; self-attested SWIFT BIC |

#### 2.1 Tier Issuance Rules

- T1 credentials are issued only by the DSO party as a result of on-ledger SV consensus.
- T2 credentials are issued by featured resolvers (T3) when the resolver acts as a faithful conduit for an external regulated authority's attestation (e.g. a GLEIF vLEI status check). The T2 tier reflects the external authority's trust, not the resolver's.
- T3 credentials are issued by featured resolvers under their own authority for the specific verification methods they are featured for (declared in their `cprp/featured-resolver` credential).
- T4 credentials are issued by any party, including a party publishing claims about itself.

A resolver that is not featured (T3) MUST NOT issue T1 or T2 credentials. A featured resolver issuing a T2 credential MUST cite the external authority's attestation evidence in the credential's claims.

### 3. Verification Policies

A verification policy is an application-specific JSON document declaring how that application converts a composed resolution result into a trust verdict. The policy is part of the broader Resolution Strategy specified in CIP-XXXX; the verification portion is normative for this CIP.

#### 3.1 Policy Schema

```
{
  "verification_policy": {
    "minimum_tier"         : "T2",
    "minimum_resolvers"    : 1,
    "minimum_total_weight" : 0.7,
    "require_methods"      : ["dns", "vlei"],
    "collision_handling"   : "strict" | "permissive",
    "expiry_grace_period"  : "PT0S"
  }
}
```

- `minimum_tier`: the lowest tier credential that may contribute to a `VERIFIED` verdict.
- `minimum_resolvers`: the minimum number of distinct featured resolvers (or higher-tier issuers) that must agree on the binding.
- `minimum_total_weight`: the minimum cumulative weight (per the tier ranges in Section 2) required.
- `require_methods`: optional list of `cprp/verification-method` values that MUST be present.
- `collision_handling`: per CIP-XXXX collision policy.
- `expiry_grace_period`: ISO-8601 duration; how long past `cprp/valid-until` an otherwise-valid credential may still contribute.

#### 3.2 Reference Policies

Two reference policies are defined for common application types:

`INSTITUTIONAL_DEFAULT` — settlement, custody, regulated trading:
```
{ "minimum_tier": "T2", "minimum_resolvers": 1,
  "minimum_total_weight": 0.7, "collision_handling": "strict" }
```

`PERMISSIVE_DEFAULT` — block explorers, consumer wallets, informational UIs:
```
{ "minimum_tier": "T4", "minimum_resolvers": 1,
  "minimum_total_weight": 0.1, "collision_handling": "permissive" }
```

Applications that adopt only CIP-XXXX (resolution without verification) MAY omit the verification policy; all resolved identities will default to `UNVERIFIED` status.

### 4. Trust Evaluation Algorithm

Given a composed resolution result `R` from CIP-XXXX and a verification policy `P` from Section 3, the evaluator returns a verdict in `{ VERIFIED, PARTIAL, UNVERIFIED, COLLISION, ERROR }`.

The algorithm is:

1. If `R.status == COLLISION` and `P.collision_handling == "strict"`, return `COLLISION` with the candidates from `R`.
2. Otherwise, for the selected candidate in `R`, enumerate the credentials whose `cprp/valid-until` has not elapsed (with grace `P.expiry_grace_period`).
3. Compute cumulative weight by summing the weight of each credential per its `cprp/trust-anchor`.
4. If cumulative weight ≥ `P.minimum_total_weight`, at least one credential meets `P.minimum_tier`, the count of distinct featured-resolver issuers ≥ `P.minimum_resolvers`, and `P.require_methods` (if any) are all present, return `VERIFIED`.
5. If at least one credential exists but the thresholds are not met, return `PARTIAL`.
6. If no credentials exist, return `UNVERIFIED`.
7. If any required input is malformed or unreachable, return `ERROR` with diagnostic detail.

The evaluator MUST NOT alter resolution results from CIP-XXXX; it MAY only attach a trust verdict.

### 5. Featured Resolver Registry

#### 5.1 Featured Status

A resolver attains T3 issuer status by being granted "featured" status through an on-ledger SV governance vote. Featured status:

- Is granted for a defined set of `cprp/featured-registrars` (the registrars the resolver is approved to serve, e.g. specific domain scopes or LEI ranges).
- Is bound to specific `cprp/featured-methods` (the verification methods the resolver is approved to execute, e.g. `dnssec-txt`, `ens-txt`, `gleif-api`).
- Renews annually; the renewal vote may modify the registrar or method set.
- Is revocable by SV vote at any time, taking effect within the bounds of Section 7.

The SV governance procedure for granting, renewing, and revoking featured status is defined in the Splice on-ledger governance framework and is referenced, not duplicated, here.

#### 5.2 ResolverFeaturedStatus Credential

Featured-resolver status is encoded as a standard CN Credential — not as a custom Daml template — issued by the DSO party:

```
publisher : <DSO-party>
subject   : <resolver-operator-party>
holder    : <resolver-operator-party>
claims    : {
  "cprp/featured-resolver"  : "true",
  "cprp/featured-since"     : "<ISO-8601-timestamp>",
  "cprp/featured-cip"       : "<CIP-number-that-approved>",
  "cprp/featured-registrars": "<comma-separated-registrar-list>",
  "cprp/featured-methods"   : "<comma-separated-method-list>",
  "cprp/featured-renewal"   : "<ISO-8601-timestamp>",
  "cprp/trust-anchor"       : "T1"
}
```

The credential itself is published at T1 (it is the product of SV consensus). Revocation is performed by the DSO archiving the credential.

#### 5.3 Issuer Tier Inference

The trust evaluator infers the tier of an incoming credential by:

1. Reading the credential's declared `cprp/trust-anchor`.
2. Looking up the publishing party's `ResolverFeaturedStatus` credential (if any).
3. Cross-checking that the declared tier is consistent with the publisher's featured status: a T2 or T3 credential MUST be published by a party holding a current `ResolverFeaturedStatus`, otherwise the credential is treated as T4.

### 6. Revocation Semantics

| Event | Maximum Propagation Time |
|-------|-------------------------|
| Credential past `cprp/valid-until` | Immediate (client-side, on read) |
| Issuer-initiated credential revocation (archival) | ≤60 seconds via Scan changelog |
| `ResolverFeaturedStatus` revocation by DSO | ≤60 seconds via Scan changelog |
| DNS record removal (Phase-1 DNS credentials) | ≤7 days (per CIP-ZZZZ re-verification cadence) |
| vLEI status change at GLEIF | ≤24 hours (per CIP-ZZZZ re-verification cadence) |

Trust evaluators MUST honor these bounds. Caching is permitted but MUST observe the credential's `cprp/valid-until` and the changelog subscription for revocations.

### 7. CollisionArbitration (deferred)

Governance-based arbitration of disputed name-to-party mappings across featured resolvers is deferred to the future governance CIP (registrar governance and dispute resolution). This CIP specifies the trust tiers and the evaluator that surface a dispute (returning `COLLISION` under strict policy); the credential encoding for binding arbitration decisions and the escalation process will be specified by that CIP.

### 8. Encrypted Fields (deferred)

Confidential metadata exchange between Canton parties (e.g. settlement instructions, private endpoints) requires encryption that remains secure for the multi-decade time horizons of institutional assets. The cryptographic design — ML-KEM-768 for key encapsulation, AES-256-GCM for content encryption, HKDF-SHA256 for key derivation — is documented but its on-ledger encoding and credential format are deferred to a follow-up CIP. The core trust framework specified in this CIP ships without encrypted fields.

### 9. Architectural Alignment

- This CIP defines the trust tier framework that CIP-ZZZZ (Imported Names) declares into — every imported credential cites a tier defined here.
- This CIP defines the verification policy schema and evaluator that operate over composed results from CIP-XXXX (Party Name Resolution). The composition engine of CIP-XXXX never alters trust verdicts; the evaluator of this CIP never alters resolution results.
- The featured-resolver registry specified here is the T3 issuer mechanism; it is not the arbitration governance for resolver disputes, which is deferred.
- All on-ledger data is encoded as standard CN Credentials. There are no custom Daml templates defined by this CIP.

### 10. Backward Compatibility

This CIP is additive. The CN Credentials interface is used as-is; new claim keys (`cprp/trust-anchor`, `cprp/featured-resolver`, `cprp/featured-registrars`, etc.) are additive. Trust tier classification is a CPRP-internal concept that applications opt into via their verification policy. Existing out-of-band KYC and bilateral verification workflows continue to work; this CIP provides a standardized in-network alternative, not a replacement.

## Rationale

### Why four tiers

The tiers map cleanly to Canton's existing governance layers: SV consensus (T1), external regulation (T2), SV-approved participants (T3), and permissionless (T4). Fewer tiers would conflate distinct authority sources; more tiers would add complexity without adding governance clarity. The chosen weight ranges allow finer differentiation within a tier (e.g. a particularly trusted T3 resolver at 0.6 vs a marginal one at 0.4) without inventing new tiers.

### Why apps decide

Different applications legitimately have different risk tolerances. A consumer wallet that rejected anything below T2 would be unusable; a settlement system that accepted T4 would be reckless. Centralizing trust policy in the foundation would either pick one bad answer for everyone or require constant exception management. Pushing the decision to applications keeps the framework neutral and the operational complexity local.

### Why declare tier on the credential

Inferring a credential's tier solely from the publisher's identity is fragile: a publisher's featured status can change, and trust evaluators would need to consult multiple ledger states for every credential. Declaring `cprp/trust-anchor` on the credential makes evaluation local and fast, with the cross-check against `ResolverFeaturedStatus` (Section 5.3) preventing publisher upgrade attacks.

### Why the featured-resolver vote is annual

SV consensus is expensive and slow; daily renewals would burden governance for no benefit. A featured resolver's verification quality is a long-running operational property; annual review provides accountability without operational drag. Revocation between renewals remains available for cause.

### Why separate from resolution

Resolution (returning a Party ID) and verification (deciding whether to trust it) are independently useful. An explorer resolves without verifying. A compliance tool may receive a Party ID directly and only need to verify the trust path. Coupling them in one CIP would force unnecessary dependencies in both consumers.

## Companion CIPs

- CIP-XXXX (Party Name Resolution) — defines the FQPN format, resolver interface, composition engine, and display model. The trust evaluator specified here operates over composed results from CIP-XXXX.
- CIP-ZZZZ (Imported Names) — defines per-source verification procedures (DNS, vLEI, ENS, cross-chain). Each procedure declares the trust tier its credentials carry.
- `.canton` CIP (Axymos, PR #209) — defines Canton-native naming and its registrars. Native names compose alongside imported names; the framework specified here applies uniformly.
