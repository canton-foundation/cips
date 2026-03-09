Number: CIP-YYYY
Title: Party Identity Verification
Author(s): Paolo Domenighetti (Freename AG)
Type: Standards Track
Status: Draft
Created: 2026-03-02
License: CC0-1.0
Post-History: Canton Identity and Metadata Working Group (Jan–Feb 2026)
Requires: CIP-XXXX (Party Name Resolution), CN Credentials Standard (CIP TBD)
Related: CIP-XXXX (Party Name Resolution)

---

## Summary

This CIP defines the verification layer of the Canton Party Resolution Protocol (CPRP): the trust model, issuer classification, verification policies, and cryptographic mechanisms that determine whether a resolved party name qualifies as **verified** — the condition for removing the `.unverified` prefix.

The protocol introduces:

- A **four-tier issuer classification** (T1: SV consensus, T2: regulated providers, T3: featured resolvers, T4: self-attestation)
- **Application-configurable verification policies** where each app defines its minimum trust requirements
- A **trust evaluation algorithm** that checks credential on-ledger state, classifies issuers, and computes verification status
- **Credential mapping** to the CN Credentials Daml interface with standardized claim key conventions
- **DNS verification flow** via DNSSEC + TXT records with SV consensus
- **vLEI verification flow** via GLEIF API with QVI issuer validation
- **Post-quantum encrypted fields** for recipient-specific confidential metadata (ML-KEM-768 + AES-256-GCM)
- **Cross-chain identity linking** for Ethereum, ENS, SWIFT, and other external identifiers
- A **Featured Resolver Registry** governed by SV vote for T3 status
- **Revocation semantics** with mandatory propagation timelines

This CIP builds on CIP-XXXX (Party Name Resolution), which defines the naming format, resolver interface, resolution strategy, and composition engine. CIP-XXXX resolves names to Party IDs; this CIP determines whether those resolutions can be trusted.

A shared technical specification accompanies both CIPs: [CPRP-spec.md](./CPRP-spec.md).

---

## Motivation

### The Verification Problem

CIP-XXXX solves the mechanical problem of resolving names to Party IDs. But a resolved name is meaningless without trust: anyone can register `goldmansachs` on a permissionless resolver. The Working Group's central question — "How do we remove the `.unverified` prefix?" — is fundamentally a verification question, not a resolution question.

### Multi-Issuer Reality

Canton operates in a multi-jurisdictional financial ecosystem where no single identity authority serves all participants. A US bank verifies via SEC CRD numbers. A European bank verifies via LEI. A crypto-native firm verifies via ENS or Ethereum signatures. Verification must compose trust from multiple independent sources rather than depending on a single root.

### Application-Driven Trust

The Working Group explicitly rejected a foundation-mandated trust standard. Different applications have different risk tolerances: a block explorer might accept any name, while a settlement system requires vLEI + DNS verification. This CIP implements the "apps decide" principle for verification, just as CIP-XXXX implements it for resolution.

### Why Separate from Resolution

Resolution and verification are separable concerns:

- Resolution answers: "What Party ID does this name point to?"
- Verification answers: "Should I trust this mapping?"

An application might resolve a name without verifying it (e.g., displaying a Party ID hint in an explorer). Or it might verify a Party ID through a credential check without going through name resolution at all (e.g., validating a vLEI for a known counterparty). Keeping them separate follows the single-responsibility principle and enables independent evolution.

---

## Specification Overview

The full specification is in the shared companion document [CPRP-spec.md](./CPRP-spec.md). This section summarizes the verification-layer design elements.

### Trust Tier Classification

Every credential issuer is classified into one of four tiers based on its authority source:

| Tier | Authority Source | Governance | Weight Range | Examples |
|------|-----------------|-----------|-------------|---------|
| **T1** | DSO / SV Consensus | On-ledger SV vote | 1.0 | SV-verified DNS claims, CollisionArbitration |
| **T2** | Regulated Identity Providers | External regulatory framework | 0.8–0.95 | GLEIF vLEI issuers, national KYC registries |
| **T3** | Featured Resolvers | SV governance vote (annual renewal) | 0.6–0.8 | Freename, 7Trust, any SV-approved resolver |
| **T4** | Self-Attestation | None (party attests about itself) | 0.1–0.3 | Party-published profile, endpoints, capabilities |

The tier determines the default weight in composition (CIP-XXXX) and the verification status in trust evaluation. Higher tiers require stronger governance: T1 requires active SV consensus, T2 requires external regulatory verification, T3 requires periodic SV renewal votes.

**T2 classification note:** T2 reflects the trust authority of the *verification source* (GLEIF, SEC, national KYC registry), not of the intermediary resolver that publishes the credential. A featured resolver (T3) that verifies a party against the GLEIF API publishes a T2 credential because the trust anchor is GLEIF (a regulated body), not the resolver itself. The publishing resolver MUST be at least T3 to issue T2 credentials.

### Credential Mapping

All CPRP verification data uses the CN Credentials Daml interface:

```daml
interface Credential with viewtype = CredentialView
  publisher : Party        -- issuer / resolver operator
  subject   : Party        -- the party being described
  claims    : Map Text Text -- key-value claims
  validUntil : Optional Time
```

CPRP defines standardized claim keys under the `cprp/` authority prefix:

| Claim Key | Purpose | Set By |
|-----------|---------|--------|
| `cprp/resolver` | Resolver that produced this credential | Resolver |
| `cprp/namespace` | Namespace within the resolver | Resolver |
| `cprp/name` | Registered name | Resolver |
| `cprp/trust-anchor` | Issuer tier and authority chain | Resolver |
| `cprp/network` | Network discriminator (mainnet/testnet/devnet) | Resolver |
| `cprp/endpoint:<service>` | Off-ledger API endpoint URL | Party (self-attested) |
| `cprp/enc-field:<field>` | Encrypted field envelope | Party |
| `cprp/delegation` | Delegation authorization | Parent party |
| `cprp/chain-id:<chain>` | Cross-chain identity link | Party |

Profile claims reuse the `cns-2.0/` namespace: `cns-2.0/name`, `cns-2.0/email`, `cns-2.0/lei`, `cns-2.0/avatar`, `cns-2.0/website`, `cns-2.0/entity-type`, `cns-2.0/jurisdiction`, `cns-2.0/capabilities`. Social contact claims use the extensible `cprp/social:<platform>` convention (e.g., `cprp/social:telegram`, `cprp/social:x`, `cprp/social:github`, `cprp/social:discord`).

**Informational-only note:** Profile claims (including social handles) are **informational only** and MUST NOT be interpreted as verified identity attributes or used for name/recipient resolution. A party's `cns-2.0/name` being "Goldman Sachs" does not make them Goldman Sachs — only the trust evaluation algorithm (this CIP, Section 5) determines verification status. This distinction is critical for Canton's institutional audience and aligns with the PixelPlex Party Profile Credentials CIP's guidance.

**Cross-CIP note:** Extended metadata claims (`cprp/jurisdiction`, `cprp/entity-type`, `cprp/capability`, `cprp/chain-id:*`) are defined in the shared specification and used by both CIP-XXXX (for profile display and endpoint discovery) and this CIP (for verification context). Neither CIP exclusively owns these claims.

Third-party resolvers use their DNS domain as the authority prefix (e.g., `freename.com/collision-score`), following K8s-style annotation conventions.

### Claim Key Registry Conventions

Claim keys follow the `<authority>/<key>` format:

| Authority | Governance | Examples |
|-----------|-----------|---------|
| `cprp/` | This CIP (protocol-level) | `cprp/resolver`, `cprp/trust-anchor` |
| `cns-2.0/` | CNS 2.0 specification | `cns-2.0/name`, `cns-2.0/lei` |
| `<domain>/` | Domain owner (third-party) | `freename.com/verified-since` |

New `cprp/` keys require a CIP. New `cns-2.0/` keys follow the CNS 2.0 governance. Third-party keys are permissionless.

### Trust Evaluation Algorithm

Given a `ComposedResolutionResult` from CIP-XXXX's composition engine, the trust evaluator:

1. For each credential in the result, checks on-ledger state (active, archived, expired)
2. Classifies the credential's issuer into T1/T2/T3/T4
3. Applies the application's `VerificationPolicy`:

```json
{
  "minimum_tier": "T3",
  "required_credential_types": ["dns_claim"],
  "reject_if_any": ["revoked", "sanctioned"],
  "required_active_credentials": 1
}
```

4. Returns a `VerificationStatus`: `VERIFIED`, `PARTIAL`, `UNVERIFIED`, `COLLISION`, or `ERROR`

`PARTIAL` is returned when at least one resolver confirms the identity but cumulative weight is below the policy's `min_total_weight` threshold (specifically: weight ≥ 50% of threshold but < threshold). Applications SHOULD display a partial verification indicator and allow the user to inspect the trust path.

The key principle: **the evaluator never changes resolution results** — it only attaches a trust judgment. An `UNVERIFIED` result still contains all resolved data; the app decides what to do with it.

### DNS Verification Flow

The highest-trust automated verification path for institutions:

1. Party publishes DNS TXT record: `_canton.<domain> TXT "party=<party_id>"`
2. SV nodes verify the DNSSEC chain and confirm the record exists
3. DSO publishes a T1 `CnsDnsClaim` credential on-ledger (publisher = DSO, subject = party)
4. DNS resolver plugin indexes this credential and serves it for resolution queries
5. Trust evaluator classifies as T1 (SV consensus) → VERIFIED

Re-verification runs periodically (default: 7 days). If the TXT record is removed or changes, the credential is archived.

### vLEI Verification Flow

For Legal Entity Identifier verification:

1. Party presents a vLEI credential referencing its LEI
2. vLEI resolver plugin calls the GLEIF API (`api.gleif.org`) to verify:
   - The LEI is active and not lapsed
   - The legal name matches the party's `cns-2.0/name` claim
   - The Qualified vLEI Issuer (QVI) is in GLEIF's trusted issuer list
3. If valid, the resolver publishes a T2 credential on-ledger
4. Trust evaluator classifies as T2 (regulated provider) → VERIFIED

Supports both Legal Entity vLEI (LE) and Official Organizational Role vLEI (OOR).

### Encrypted Fields

For publishing recipient-specific confidential metadata (settlement instructions, private API endpoints, compliance data):

**Cryptographic specification:**

| Component | Algorithm | Standard |
|-----------|-----------|---------|
| Key Encapsulation | ML-KEM-768 (Kyber-768) | NIST FIPS 203 |
| Symmetric Encryption | AES-256-GCM | NIST SP 800-38D |
| Key Derivation | HKDF-SHA256 | RFC 5869 |

**Flow:**

1. Sender generates a random 256-bit data key
2. Sender encrypts the field value with AES-256-GCM using the data key
3. For each recipient: sender encapsulates the data key under the recipient's ML-KEM-768 public key
4. Sender publishes the encrypted field as a `cprp/enc-field:<field-name>` credential claim containing the ciphertext and per-recipient encapsulated keys
5. Recipient decapsulates the data key with their private key, derives the AES key via HKDF, decrypts

ML-KEM-768 provides NIST-standardized post-quantum security (IND-CCA2). This is critical for Canton's institutional users who hold assets with multi-decade time horizons and need protection against future quantum adversaries.

### Cross-Chain Identity

Parties can link Canton identity to external chains via self-attested claims:

| Claim | Content | Verification Path |
|-------|---------|------------------|
| `cprp/chain-id:ethereum` | Ethereum address | Signature by the Ethereum private key → T3 |
| `cprp/chain-id:ens` | ENS name | ENS TXT record pointing to Canton Party ID → T3 |
| `cprp/chain-id:swift` | SWIFT BIC code | Self-attested (no automated verification) → T4 |

Cross-chain resolvers can verify the first two automatically. SWIFT remains T4 (self-attested) until a SWIFT verification oracle is available.

### Featured Resolver Registry

Featured resolvers (T3) are registered on-ledger via SV governance vote:

- **Registration:** Any resolver operator submits a CIP requesting featured status. SVs vote.
- **On-ledger:** Approved resolvers receive a `ResolverFeaturedStatus` Daml contract (publisher = DSO, subject = resolver operator)
- **Renewal:** Annual SV confirmation vote. If not renewed, the resolver loses T3 status and drops to T4.
- **Revocation:** SVs can revoke featured status at any time via Daml choice.

The Tech & Ops Committee can also designate a resolver as featured through their administrative authority.

### Revocation Semantics

| Revocation Type | Mechanism | Propagation Time |
|----------------|-----------|-----------------|
| Credential expiry | `validUntil` field on the CN Credential | Immediate (client-side check) |
| Issuer revocation | Issuer archives the credential via Daml choice | ≤ 60 seconds (changelog propagation) |
| Featured status revocation | SV archives `ResolverFeaturedStatus` | ≤ 60 seconds |
| DNS record removal | Re-verification detects missing TXT record | ≤ re-verification period (default 7 days) |

All resolvers must implement the `changelog` method (CIP-XXXX) to enable timely propagation of revocations to caching clients.

---

## Daml Contracts

Two on-ledger contract templates support the verification layer:

### ResolverFeaturedStatus

Records SV-approved featured resolver status. Fields: `resolver_operator` (Party), `resolver_id` (Text), `approved_by` (DSO Party), `approved_date` (Time), `renewal_deadline` (Time), `network` (Text). Choices: `RevokeStatus`, `RenewStatus`.

### CollisionArbitration

Records governance decisions on disputed name mappings between featured resolvers. Fields: `arbitrated_name` (Text), `winning_party_id` (Text), `losing_resolver_id` (Text), `decision_rationale` (Text), `arbitrated_by` (DSO Party). Published as T1 authority.

---

## Rationale

**Why four tiers:** Maps to Canton's existing governance layers — SV consensus (T1), external regulation (T2), SV-approved participants (T3), and permissionless (T4). Adding more tiers would increase complexity without adding governance clarity.

**Why app-driven verification:** Centralizing trust policy would require the Canton Foundation to define a global verification standard — a governance burden the WG explicitly wants to avoid. Different applications legitimately have different risk tolerances.

**Why post-quantum encryption:** Canton's institutional users (DTCC, Goldman Sachs, HSBC) hold assets with multi-decade time horizons. ML-KEM-768 provides NIST-standardized post-quantum security for encrypted metadata that may remain sensitive for decades.

**Why separate from resolution:** Resolution and verification are independently useful and independently evolvable. An explorer resolves without verifying. A compliance tool verifies without resolving (it receives a Party ID directly). Coupling them would force unnecessary dependencies.

**Why credential-native:** Using the existing CN Credentials interface means CPRP verification data is stored, indexed, and queried exactly like other Canton credentials — no new storage layer, no new indexing infrastructure.

---

## Backwards Compatibility

- **CN Credentials:** Uses the standard Daml Credential interface unchanged. New claim keys (`cprp/`) are additive.
- **Trust model:** Does not modify any existing Canton trust mechanism. The tier classification is a CPRP-internal concept that apps opt into.
- **Scan:** Verification badges and profile cards are additive UI elements. Existing Scan functionality is unchanged.
- **Existing verification workflows:** Out-of-band KYC and bilateral verification continue to work. CPRP provides a standardized alternative, not a replacement.

---

## Security Considerations

| Threat | Mitigation |
|--------|-----------|
| Credential replay (using archived/expired credentials) | On-ledger state verification on every trust evaluation; `validUntil` client-side check |
| Issuer impersonation (fake T1/T2 credentials) | T1 requires DSO as publisher; T2 requires GLEIF API confirmation; publisher Party ID verified on-ledger |
| Featured resolver compromise | SV revocation via Daml choice; annual renewal prevents indefinite T3 status |
| Encrypted field key compromise | Per-recipient keys; compromising one recipient's key does not expose other recipients' data |
| Harvest-now-decrypt-later (quantum threat) | ML-KEM-768 (NIST FIPS 203) provides IND-CCA2 security against quantum adversaries |
| vLEI lapse not detected | Periodic re-verification (configurable, default 30 days); GLEIF API checked on first resolution |
| DNS hijacking / DNSSEC bypass | SV consensus verification (multiple SVs must agree); re-verification cycle |
| Collision exploitation (attacker registers same name on permissionless resolver) | T4 credentials rejected by institutional verification policies; collision detection in CIP-XXXX |

---

## Implementation

A reference implementation is proposed as a Canton Protocol Development Fund grant (PR to `canton-dev-fund`). The verification layer is delivered across milestones B1 (CIP design + trust model), B2 (trust evaluator + vLEI + encrypted fields + Scan integration), and B3 (verification SDK extensions + reference custody app) — see Grant B: Party Identity Verification ($200k). B1 runs in parallel with the resolution grant's A2 milestone.

---

## Companion Documents

- **CIP-XXXX: Party Name Resolution** — FQPN format, resolver interface, resolution strategy, composition engine, address books, name delegation, display model
- **[CPRP-spec.md](./CPRP-spec.md)** — Shared full technical specification (~3,400 lines) covering both CIPs, with appendices for use cases, architecture, migration, and milestones

---

## Copyright

This CIP is licensed under CC0-1.0: Creative Commons CC0 1.0 Universal.
