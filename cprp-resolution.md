Number: CIP-XXXX

Title: Canton Party Resolution Protocol (CPRP) - Party Identity Resolution

Author(s): Paolo Domenighetti (Freename AG)

Type: Standards Track

Status: Draft

Created: 2026-03-02

Post-History: Canton Identity and Metadata Working Group (Jan–Feb 2026)

Requires: CN Credentials Standard (CIP TBD), CNS 2.0 (CIP TBD)

Related: CIP-YYYY (Party Identity Verification)


## Summary

This CIP defines the resolution layer of the Canton Party Resolution Protocol (CPRP): the standardized mechanism by which Canton applications resolve human-readable names to Canton Party IDs, discover off-ledger API endpoints, and retrieve self-published party profile information.

The protocol introduces:

- A Fully Qualified Party Name (FQPN) addressing format with network discrimination
- A Resolver Interface that any identity provider can implement (DNS, vLEI, CN Credentials, ENS, application directories)
- An app-configurable Resolution Strategy where each application decides which resolvers to query and in what order
- A Composition Engine that merges results from multiple resolvers, detects collisions, and applies weighting
- Address book integration for institutional counterparty directories
- Name delegation for organizational hierarchies (e.g., `treasury.acme.com`)
- A three-layer display model for uniform party name rendering across Scan and all applications

This CIP focuses on the naming and resolution mechanics. Trust evaluation, issuer classification, verification policies, and encrypted metadata are defined in the companion CIP-YYYY (Party Identity Verification).

A shared technical specification accompanies both CIPs: [CPRP-spec.md](./CPRP-spec.md).


## Motivation

### The Naming Problem

The fundamental form of identity on Canton is a Party ID: a prefix (up to 185 characters) and a namespace (a 68-character hash of a public key). Party IDs are cryptographic identifiers designed for privacy and security, but they are unusable for human workflows. The namespace is a random hex sequence that cannot be memorized. The prefix is freely chosen and trivially spoofable. CNS 1.0 names (`name.unverified.cns`) are first-come-first-serve with no ownership validation beyond payment.

### Multiple Identity Sources

The Working Group has identified that Canton will have multiple identity sources — no single naming authority will serve all participants. DNS-verified names, vLEI/LEI credentials, CN Credentials, application directories, and third-party providers will coexist. Applications need a standard way to query across these sources and compose the results.

### The Missing Layer

Digital Asset is building credential formats and a registry (what the data looks like). PixelPlex is exploring credential storage (where the data lives). This CIP addresses how an application navigates from a human-readable name, across multiple identity sources, to a Canton Party ID — with configurable resolution strategies per application.

### Alignment with Working Group Principles

This CIP implements the resolution-specific design principles established in the WG:

- Follows the `<resolver>:<namespace>:<n>` addressing pattern proposed by Simon Meier
- Implements the "apps decide resolution strategy" principle — no foundation-mandated resolution policy
- Avoids bloating the ACS of the DSO party (resolution queries are off-ledger)
- Avoids bloating the Scan API surface (additive changelog integration only)
- Supports integrating existing name providers (DNS, ENS, vLEI) as resolvers
- Supports local address books as a resolver type


## Specification Overview

The full specification is in the shared companion document [CPRP-spec.md](./CPRP-spec.md). This section summarizes the resolution-layer design elements.

### Fully Qualified Party Name (FQPN)

Names are structured as `<network>/<resolver>:<namespace>:<n>`:

| Component | Purpose | Example Values |
|-----------|---------|---------------|
| `network` | Prevents cross-environment confusion | `mainnet`, `testnet`, `devnet` |
| `resolver` | Identity source that backs the name | `dns`, `vlei`, `freename`, `self` |
| `namespace` | Registrant's domain or organizational scope | `goldmansachs.com`, `acme-bank.canton` |
| `n` | Specific name within the namespace | `default`, `treasury`, `trading-desk-3` |

Examples:
- `mainnet/dns:goldmansachs.com:default`
- `mainnet/vlei:784F5XWPLTWKTBV3E584:default`
- `testnet/freename:acme-bank.canton:treasury`

Network discrimination is a security requirement: TestNet names must not be confusable with MainNet names.

### Resolver Interface

Any identity provider can become a CPRP resolver by implementing the following interface:

| Method | Input | Output | Purpose |
|--------|-------|--------|---------|
| `resolve` | namespace, name | `ResolutionResult` | Forward lookup: name → Party ID + metadata |
| `reverseResolve` | partyId | `ReverseResolutionResult` | Reverse lookup: Party ID → registered names |
| `resolveMulti` | queries[] | `ResolutionResult[]` | Batch resolution (latency optimization) |
| `changelog` | since timestamp | `ChangelogEntry[]` | Credential changes since a given time |

Each resolver publishes backing credentials via the CN Credentials Daml interface and reports its type:

| Resolver Type | Registration | Trust Tier | Example |
|--------------|-------------|-----------|---------|
| Featured | SV governance vote (on-ledger `ResolverFeaturedStatus`) | T3 | Freename, 7Trust |
| Permissionless | No registration required; implements the interface | T4 | Any third-party identity service |
| Address Book | Local to the application; no network registration | App-defined | Citadel internal directory |

### Resolution Strategy

Each Canton application configures a Resolution Strategy — a JSON document that governs resolution behavior. The strategy spans both CIPs: resolution parameters (`resolvers`, `mode`, `collision_policy`, `cache_ttl_seconds`, `address_books`, `display_rule`) are defined here; verification parameters (`verification_policy`) are defined in CIP-YYYY. Applications that adopt only CIP-XXXX may omit the verification policy; all resolved identities will default to `UNVERIFIED` status.

```json
{
  "mode": "parallel",
  "resolvers": [
    { "id": "dns",        "weight": 1.0 },
    { "id": "vlei",       "weight": 0.9 },
    { "id": "freename",   "weight": 0.8 },
    { "id": "self",       "weight": 0.3 }
  ],
  "collision_policy": "strict",
  "cache_ttl_seconds": 300,
  "address_books": [],
  "display_rule": "highest_trust_tier"
}
```

Three resolution modes:

| Mode | Behavior | Use Case |
|------|----------|----------|
| Priority | Resolvers queried sequentially by weight; first match wins | Low-latency applications |
| Parallel | All resolvers queried simultaneously; results composed by weight | Maximum verification depth |
| Quorum | Resolution succeeds only when N resolvers agree on the same Party ID | High-security applications |

Two reference strategies are defined in the spec:
- `INSTITUTIONAL_DEFAULT` — parallel mode, strict collision policy, requires DNS or vLEI
- `PERMISSIVE_DEFAULT` — parallel mode, permissive collision policy, address-book-first

### Composition Engine

When multiple resolvers return results for the same query, the Composition Engine:

1. Groups results by `party_id`
2. For same-resolver duplicates: selects by Ledger Effective Time (last-write-wins, per CNS 2.0)
3. For cross-resolver duplicates: merges metadata, selects display name by weight
4. For conflicting `party_id` values: triggers collision handling per the strategy's `collision_policy`
5. Merges credential arrays, endpoint maps, and profile claims across all sources
6. Records per-claim provenance (`claim_sources`): for each metadata key, tracks which resolver and issuer contributed the value — enabling institutional audit trails

### Profile Rendering Guidelines

Profile claims (`cns-2.0/name`, `cns-2.0/avatar`, `cns-2.0/email`, `cns-2.0/website`) are informational only and MUST NOT be interpreted as verified identity attributes. Verification status is determined exclusively by CIP-YYYY's trust evaluation, not by profile content. Display names SHOULD be ≤64 Unicode characters. Avatars SHOULD be `https://` URLs; applications MAY additionally support `ipfs://` URIs.

Social contact claims use the extensible `cprp/social:<platform>` convention (e.g., `cprp/social:telegram`, `cprp/social:x`, `cprp/social:github`, `cprp/social:discord`). These are T4 (self-attested) by default and are compatible with the PixelPlex Party Profile Credentials CIP.

### Collision Management

When the same name maps to different parties across resolvers:

| Policy | Behavior |
|--------|----------|
| Strict | Returns status `COLLISION` with both candidates; app must present disambiguation UI |
| Permissive | Selects the highest-weight result; attaches collision warning to the response |

Governance-based arbitration is available for disputes between featured resolvers via a `CollisionArbitration` Daml contract (T1 authority).

### Address Books

Local and organization-scoped address books integrate as a special resolver type:

- In-process: SDK loads entries from a local database or config file
- Org-scoped: Corporate LDAP/directory service exposed via the resolver interface
- Validator-configured: Pre-loaded at the validator level for all apps on that node

Address books provide display names only — they cannot override trust tier or verification status (those come from CIP-YYYY).

### Name Delegation

Name owners can authorize sub-parties to register subnames. Delegation is modeled as a CN Credential:

- Parent publishes a `NameDelegation` Daml contract specifying `delegatee`, `parent_fqpn`, `allowed_subnames`, and `scope` (`name-only` or `name-and-subdelegation`)
- Counterparties verify the delegation chain: subname → parent name → parent's credential
- Trust tier inherits from the parent's verified tier
- DNS TXT delegation records provide an additional off-chain anchor

### The .canton Namespace

`.canton` is defined as a Canton-native naming convention — not a DNS TLD. Properties:

- Network-scoped (exists independently per MainNet/TestNet/DevNet)
- Verification-independent (verification comes from credentials, not from the name itself)
- Resolver-agnostic (multiple resolvers can serve `.canton` names)
- Registration model defined by each resolver's own policy

### Three-Layer Display Model

Party identity is rendered in three progressive layers:

| Layer | Surface | Content |
|-------|---------|---------|
| L1: Inline | Transaction lists, counterparty fields | Display name + verification badge (✓ or ⚠) |
| L2: Hover | Tooltip/popover on hover or tap | Profile card: name, LEI, jurisdiction, issuer summary |
| L3: Full | Scan profile page | Complete profile: all credentials, trust path, endpoints, history, delegation chain |

Fallback chain: display name → CNS 1.0 entry → party ID prefix → truncated party ID.

### Off-Ledger API

The Resolution Service exposes:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/resolve` | POST | Single resolution query |
| `/v1/resolve/batch` | POST | Batch resolution (up to 100 queries) |
| `/v1/resolve/reverse` | POST | Reverse resolution (Party ID → names) |
| `/v1/changelog` | GET | Credential change stream |
| `/v1/resolvers` | GET | List available resolvers and their status |
| `/v1/health` | GET | Service health check |


## Daml Contracts

Two on-ledger contract templates support the resolution layer:

### PartyNameRegistration

Binds a name to a Party ID within a resolver/namespace. Fields: `resolver_id`, `namespace`, `name`, `party_id`, `network`, `record_version`. Choices: `UpdateRegistration`, `RevokeRegistration`.

### NameDelegation

Authorizes subname delegation. Fields: `parent_party`, `delegatee_party`, `parent_fqpn`, `allowed_subnames`, `delegation_scope`, `network`. Choices: `RevokeDelegation`, `SubDelegate` (if scope permits).

Estimated ACS impact for resolution-only contracts: ~900 bytes per party for registration + ~800 bytes per delegation.


## Backwards Compatibility

### CNS 1.0 Coexistence

CPRP is fully backward compatible with CNS 1.0:

- Existing `.unverified.cns` names continue to work unchanged
- A `cns-v1` resolver plugin wraps the existing `DsoAnsResolver` as a CPRP-compatible resolver
- The `cns-v1` plugin returns CNS 1.0 names as T4 (self-attested) credentials with low weight (0.3)
- Parties can upgrade to verified names via `cprp-cli upgrade` while retaining CNS 1.0 aliases
- No migration is forced — adoption is entirely opt-in

### CN Credentials

Uses the standard Daml Credential interface unchanged. CPRP claim keys use the `cprp/` authority prefix.

### Scan Integration

Additive only — no breaking changes to existing Scan functionality. The three-layer display model is layered on top of existing Scan UI.

### Existing Applications

CPRP adoption is opt-in. Non-adopting apps continue to use raw Party IDs or CNS 1.0 names exactly as before.


## Security Considerations

| Threat | Mitigation |
|--------|-----------|
| Query privacy (resolution leaks counterparty interest) | Mandatory TLS 1.3, batch resolve endpoint, local TTL caching, optional mTLS |
| Name squatting on permissionless resolvers | T4 credentials are rejected by institutional policies; collision detection catches conflicts |
| Network confusion attacks (TestNet name on MainNet) | Network discriminator in FQPNs; resolution engine rejects cross-network results |
| Delegation chain forgery | Mandatory chain verification back to a verified parent; dual-signature requirement |
| Denial of service against Resolution Service | Rate limiting (1,000 req/min default), DDoS mitigation, degradation to cached results |
| Stale cache serving revoked names | Changelog subscription for proactive invalidation; 60-second max revocation propagation |

Trust-layer threats (credential replay, issuer impersonation, encrypted field attacks) are addressed in CIP-YYYY.


## Implementation

A reference implementation is proposed as a Canton Protocol Development Fund grant (PR to `canton-dev-fund`). The resolution layer is delivered across milestones A1 (CIP design + resolver interface), A2 (resolver prototype + TestNet), and A3 (resolution SDK + adoption) — see Grant A: Party Name Resolution ($250k).


## Companion Documents

- CIP-YYYY: Party Identity Verification — Trust tier model, verification policies, credential mapping, encrypted fields, vLEI verification, cross-chain identity
- [CPRP-spec.md](./CPRP-spec.md) — Shared full technical specification (~3,400 lines) covering both CIPs, with appendices for use cases, architecture, migration, and milestones


## Copyright

This CIP is licensed under CC0-1.0: Creative Commons CC0 1.0 Universal.
