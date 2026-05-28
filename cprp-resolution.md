Number: CIP-XXXX

Title: Canton Party Resolution Protocol (CPRP) - Party Identity Resolution

Author(s): Paolo Domenighetti (Freename AG)

Status: Draft

Created: 2026-05-27

Post-History: Canton Identity and Metadata Working Group (Jan–Feb 2026)

Requires: CN Credentials Standard (CIP TBD), CNS 2.0 (CIP TBD)

Related: CIP-YYYY (Party Identity Verification)


## Summary

This CIP defines the resolution layer of the Canton Party Resolution Protocol (CPRP): the standardized mechanism by which Canton applications resolve human-readable names to Canton Party IDs, discover off-ledger API endpoints, and retrieve self-published party profile information.

The protocol introduces:

- A Fully Qualified Party Name (FQPN) addressing format with network discrimination
- A built-in `party` resolver ensuring every Canton party always has at least one FQPN
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

- Follows the `<network>:<resolver>:<registrar>:<name>` addressing pattern proposed by Simon Meier
- Implements the "apps decide resolution strategy" principle — no foundation-mandated resolution policy
- Avoids bloating the ACS of the DSO party (resolution queries are off-ledger)
- Avoids bloating the Scan API surface (additive changelog integration only)
- Supports integrating existing name providers (DNS, ENS, vLEI) as resolvers
- Supports local address books as a resolver type


## Specification Overview

The full specification is in the shared companion document [CPRP-spec.md](./CPRP-spec.md). This section summarizes the resolution-layer design elements.

### Fully Qualified Party Name (FQPN)

Names are structured as `<network>:<resolver>:<registrar>:<name>`, following the FQPN syntax proposed by Simon Meier in the Working Group:

| Component | Purpose | Example Values |
|-----------|---------|---------------|
| `network` | Prevents cross-environment confusion | `mainnet`, `testnet`, `devnet` |
| `resolver` | Identity source that backs the name | `dns`, `vlei`, `cns`, `freename`, `self` |
| `registrar` | Naming authority or registrant scope within the resolver (the component earlier drafts called the namespace) | `goldmansachs.com`, `acme-bank.canton`, `lloyds` |
| `name` | Specific name within the registrar | `default`, `treasury`, `trading-desk-3` |

Examples:
- `mainnet:dns:goldmansachs.com:default`
- `mainnet:vlei:784F5XWPLTWKTBV3E584:default`
- `testnet:freename:acme-bank.canton:treasury`
- `mainnet:self:acme-bank:default` (self-attested: the registrar is the party's own freely chosen Party ID prefix, hence T4 trust)
- `mainnet:party:<party-prefix>:default` (built-in, every party gets one automatically, derived from its Party ID)

The `self` and `party` resolvers are built-in and available in all networks; they are not registered on a per-network basis. The `network` segment of the FQPN performs the disambiguation, so `mainnet:party:...` and `devnet:party:...` are distinct names backed by the same built-in resolver. The `self` resolver returns claims a party publishes about itself with no external verification (T4, lowest trust); the `party` resolver guarantees that every Canton party always has at least one FQPN derived from its Party ID, even before any name is registered.

Because a Canton Party ID itself contains `::` separators, full Party IDs are referenced in FQPNs by their prefix (the human-chosen component) rather than embedded verbatim, so that the `:` field delimiter remains unambiguous.

Human-readable names such as `alice.canton` are provided through the `.canton` namespace, described in its own section below. Users type `alice.canton` directly — the full FQPN is infrastructure-level and invisible, like IP addresses behind DNS.

Network discrimination is a security requirement: TestNet names must not be confusable with MainNet names.

### Resolver Interface

Any identity provider can become a CPRP resolver by implementing the following logical interface (these are method signatures, not HTTP verbs — the HTTP mapping is defined in the companion specification §12):

| Method | Input | Output | Purpose |
|--------|-------|--------|---------|
| `resolve` | registrar, name | `ResolutionResult` | Forward lookup: name → Party ID + metadata |
| `reverseResolve` | partyId | `ReverseResolutionResult` | Reverse lookup: Party ID → registered names |
| `resolveMulti` | queries[] | `ResolutionResult[]` | Batch resolution (latency optimization) |
| `changelog` | since timestamp | `ChangelogEntry[]` | Credential changes since a given time |

Each resolver publishes backing credentials via the CN Credentials Daml interface and reports its type:

| Resolver Type | Registration | Trust Tier | Example |
|--------------|-------------|-----------|---------|
| Featured | SV governance vote (on-ledger credential published by DSO) | Elevated | Freename, 7Trust |
| Permissionless | No registration required; implements the interface | Base | Any third-party identity service |
| Address Book | Local to the application; no network registration | App-defined | Citadel internal directory |

Note: the trust weight and tier classification of resolvers is defined in CIP-YYYY (Party Identity Verification). This CIP defines the resolver types and their registration mechanism; CIP-YYYY defines what trust level each type carries. Applications that adopt only CIP-XXXX (without CIP-YYYY) treat all resolved identities as unverified.

### Claim Key Namespace Conventions

CPRP claim keys follow the `<authority>/<key>` format. Three authority prefixes are defined:

- `cprp/*` — protocol-level claims defined in this CIP and CIP-YYYY (e.g., `cprp/resolver`, `cprp/endpoint:api`)
- `cip-<nr>/*` — claims defined by other CIPs, notably the PixelPlex Party Profile Credentials CIP (e.g., profile display claims; `cns-2.0/*` is used as a working prefix until the CIP number is assigned)
- `<domain>/*` — third-party resolver claims scoped by the resolver's DNS domain (e.g., `freename.com/verified-since`, `7trust.c7.digital/reputation-score`), following K8s-style annotation conventions

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

`INSTITUTIONAL_DEFAULT` does not query the address book first because institutional flows require counterparty identity to be backed by an externally verifiable source (DNS or vLEI) rather than by a local, operator-subjective address book entry. The address book may still participate as a lower-weight fallback within the same strategy — this is a matter of resolver position and weight, not exclusion. `PERMISSIVE_DEFAULT` reverses the emphasis for consumer and explorer contexts, where a recognized local label is preferable to showing no name at all.

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

Address books provide display names and profile metadata (contact info, internal notes, custom labels) — but this data is locally scoped with no external trust weight. Address book claims cannot override trust tier or verification status (those come from CIP-YYYY). Typical use: an institution shows "GS Prime" instead of "Goldman Sachs" for internal convenience, while network resolvers still control verification status.

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

Examples of .canton names:

- `alice.canton` — an individual or small entity registers a .canton name through a featured resolver (e.g., xNS, Freename), similar to registering `alice.eth` on ENS
- `goldmansachs.canton` — an institution registers its canonical Canton-native name
- `treasury.acme.canton` — a delegated subname under `acme.canton` for a treasury desk

Users type `alice.canton` directly. The FQPN infrastructure is invisible — resolvers and registrars are handled by the SDK, just as DNS root servers and TLD delegation are invisible to web users.

### Three-Layer Display Model

Party identity is rendered in three progressive layers:

| Layer | Surface | Content |
|-------|---------|---------|
| L1: Inline | Transaction lists, counterparty fields | Display name + verification badge (✓ or ⚠) |
| L2: Hover | Tooltip/popover on hover or tap | Profile card: name, LEI, jurisdiction, issuer summary |
| L3: Full | Explorer profile page (Scan or third-party) | Complete profile: all credentials, trust path, endpoints, history, delegation chain |

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


## On-Ledger Representation

Resolution-layer data is encoded as standard CN Credentials — no custom Daml templates are required.

### PartyNameRegistration (as credential)

A name registration is a credential where publisher = resolver party, subject = registered party, holder = registered party. Claims include `cprp/resolver`, `cprp/registrar`, `cprp/name`, `cprp/network`, and a `cprp/record-version`. Updates are modeled as archiving the old credential and publishing a new one. Revocation is modeled as archival.

### NameDelegation (as credential)

A delegation is a credential where publisher = parent party, subject = child party (delegatee), holder = child party. Claims include `cprp/delegation: true`, `cprp/parent-fqpn`, `cprp/delegated-name`, and `cprp/delegation-scope` (`name-only` or `name-and-subdelegation`). Revocation by the parent archives the credential. Sub-delegation is modeled as the child publishing a new credential for a sub-delegatee if scope permits.

Estimated ACS impact: ~900 bytes per party for registration + ~800 bytes per delegation. Whether these credentials belong in the DSO registry or a separate app-layer registry is an implementation decision to be resolved during development.


## Backwards Compatibility

### CNS 1.0 Coexistence

CPRP is fully backward compatible with CNS 1.0:

- Existing `.unverified.cns` names continue to work unchanged
- A `cns-v1` resolver plugin wraps the existing `DsoAnsResolver` as a CPRP-compatible resolver
- The `cns-v1` plugin returns CNS 1.0 names as self-attested credentials with low weight (0.3)
- Parties can upgrade to verified names via `cprp-cli upgrade` while retaining CNS 1.0 aliases
- No migration is forced — adoption is entirely opt-in

Concrete examples of how existing names map under CPRP:

- `goldmansachs.unverified.cns` — the cns-v1 resolver plugin reads this from Scan and returns it as a CPRP resolution record. CPRP-enabled apps see it alongside any higher-trust results (e.g., DNS-verified). No change needed from the user or from CNS 1.0.
- `digital-asset.sv.cns` — the cns-v1 plugin exposes this as `cns-v1:sv.cns:digital-asset`. If the SV also registers via DNS verification, they additionally have `dns:digitalasset.com:default` at higher trust. Both names coexist in the composition result — the app's strategy decides which to display.

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

A reference implementation is proposed separately as a Canton Protocol Development Fund grant (PR to `canton-dev-fund`). Funding scope, milestones, and budget are defined in that grant proposal and are intentionally kept out of this CIP, so that standards review and funding review remain independent.


## Companion Documents

- CIP-YYYY: Party Identity Verification — Trust tier model, verification policies, credential mapping, encrypted fields, vLEI verification, cross-chain identity
- [CPRP-spec.md](./CPRP-spec.md) — Shared full technical specification (~3,400 lines) covering both CIPs, with appendices for use cases, architecture, and migration.
