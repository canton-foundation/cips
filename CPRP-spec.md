```
CIP: N/A (Companion Specification)

Title: Canton Party Resolution Protocol (CPRP) — Full Specification

Author: Paolo Domenighetti (Freename AG)

Companion to: CIP-XXXX (Party Name Resolution), CIP-YYYY (Party Identity Verification)

Status: Draft

Created: 2026-03-15

Post-History: Canton Identity and Metadata Working Group (Jan–Feb 2026)

Requires: CN Credentials Standard, CNS 2.0
```

## Abstract

This CIP defines the Canton Party Resolution Protocol (CPRP), a multi-resolver identity resolution framework for the Canton Network. CPRP provides a standardized mechanism by which applications resolve human-readable names to verified Canton Party IDs, discover off-ledger API endpoints, and retrieve self-published party profile information. The protocol supports multiple concurrent identity sources (DNS, vLEI, CN Credentials, application directories, local address books, and third-party providers), with application-configurable trust policies that determine when a resolved identity qualifies as "verified." CPRP builds on the CN Credentials standard and the CNS 2.0 naming infrastructure, providing the composition and verification layer that makes them usable by applications. It also specifies a post-quantum-secure encrypted field mechanism for publishing recipient-specific confidential metadata, a hybrid resolver registry model, and native support for collision management, cross-chain identity resolution, and hierarchical name delegation.

### Scope

CPRP addresses party identity resolution: the mapping from human-readable names to verified Canton Party IDs. The protocol is designed to be extensible to asset naming (human-readable names for on-chain assets and tokens) and API naming (discovery of off-ledger services). However, asset-specific and API-specific naming semantics are explicitly out of scope for this CIP and are expected to be addressed in follow-up CIPs that build on the CPRP framework. Where relevant, this CIP documents extension points for these future use cases.


## Motivation

### The Identity Gap

The fundamental form of identity on the Canton Network is a Party ID, consisting of a prefix (up to 185 characters) and a namespace (a 68-character hash of a public key). Party IDs are cryptographic identifiers designed for privacy and security, but they are unusable for human workflows:

- The namespace is a random hex sequence that cannot be memorized or visually compared.
- The prefix is freely chosen by the party administrator and trivially spoofable by an attacker.
- CNS 1.0 names (`name.unverified.cns`) are first-come-first-serve with no ownership validation beyond payment.

The Canton Identity and Metadata Working Group has identified three concrete problems requiring standards-based solutions:

P1 — Trustworthy human-readable names. App providers need to display and accept trustworthy names for parties, both for display and for accepting names as input to determine party values for user actions.

P2 — Off-ledger API endpoint discovery. Applications need to discover the off-ledger API endpoints for CIP-56 token admins and other services operated by a party.

P3 — Self-published profile information. Parties need to publish profile information that can be displayed uniformly across all Canton applications.

### The Multi-Source Reality

The Working Group has established that Canton will have multiple identity sources. No single naming authority will serve all participants. The system must support DNS-verified names, vLEI/LEI credentials from GLEIF, CN Credentials from any issuer, application-local directories, and third-party identity providers — simultaneously and composably.

### The Missing Layer

The CN Credentials standard (in development by Digital Asset) defines credential formats and a registry. PixelPlex is exploring credential storage. This CIP addresses the layer that neither covers: the resolution mechanism that navigates from a human-readable name, across multiple identity sources, to a verified Canton Party ID — with configurable trust policies per application.


## Specification

### 1. Terminology and Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

Party ID. A Canton ledger identity consisting of a prefix and a namespace. The namespace is a 68-character hash of the party administrator's public key.

Party Administrator. The entity controlling the private key corresponding to the Party ID namespace.

Network. A Canton deployment environment: `mainnet`, `testnet`, or `devnet`. See Section 1.1.

Fully Qualified Party Name (FQPN). A structured identifier of the form `<network>/<resolver>:<namespace>:<name>` that uniquely identifies a party within the scope of a specific resolver, namespace, and network. Examples: `mainnet/dns:acme.com:treasury`, `testnet/vlei:5493001KJTIIGC8Y1R12:default`, `mainnet/freename:acme-bank.canton:treasury`. See Section 1.1 for the network prefix.

Short FQPN. When the network context is unambiguous (e.g., the application is connected to a specific network), the network prefix MAY be omitted: `dns:acme.com:treasury`. Implementations MUST internally normalize short FQPNs to full FQPNs using the connected network.

Resolver. A service that maps FQPNs to Party IDs and associated metadata. Each resolver implements the Resolver Interface defined in Section 2.

Address Book. A local or organization-scoped name-to-party mapping maintained by an application or organization. See Section 2.6.

Resolution Strategy. An application-specific configuration that defines which resolvers to query, in what priority order, and what trust requirements must be met before a resolution result is considered "verified."

Trust Policy. A set of rules within a Resolution Strategy that determines the minimum conditions under which the `.unverified` prefix is removed from a resolved name.

Credential. A claim published via the CN Credentials standard Daml interface, of the form: `<publisher> asserts that <subject> has <claims>`.

Issuer. A party that publishes credentials about other parties. Issuers are classified into tiers (T1–T4) as defined in Section 5.

Featured Resolver. A resolver registered on-ledger via SV governance vote, granting it elevated trust status in the hybrid registry model.

Permissionless Resolver. A resolver that implements the Resolver Interface but is not registered on-ledger. Applications MAY choose to trust permissionless resolvers at their discretion.

Resolution Record. The structured response returned by a resolver for a given FQPN query, containing the resolved Party ID, backing credentials, metadata, and confidence level.

Encrypted Field. A metadata value within a credential that is encrypted for specific recipients using AES-256-GCM with ML-KEM-768 key encapsulation, accessible only to designated counterparties.

Collision. A state where the same human-readable name maps to different parties across different resolvers or chains. The Collision Management protocol (Section 8) defines how applications handle this.

Delegation. The authorization by a name owner for sub-parties to register subnames within their namespace. See Section 2.7.

#### 1.1 Network Discriminator

Names MUST be scoped to a specific Canton network to prevent confusion between TestNet, DevNet, and MainNet identities. This is a security requirement: an attacker could register `goldmansachs` on TestNet to create confusion with the MainNet identity.

The network discriminator is expressed as a prefix in the FQPN:

```
<network>/<resolver>:<namespace>:<name>

Where <network> is one of:
  mainnet   — Canton MainNet (production)
  testnet   — Canton TestNet
  devnet    — Canton DevNet
```

Rules:

1. All on-ledger credentials MUST include the `cprp/network` claim key set to the network identifier.
2. A resolver MUST NOT return results from a different network than the one the querying application is connected to.
3. Applications MUST reject resolution results where `cprp/network` does not match the application's connected network.
4. Display of party names SHOULD include a network indicator when the application supports multiple networks (e.g., `[testnet] acme.com` or a visual badge).
5. Cross-network resolution (e.g., resolving a MainNet name from a TestNet application) is NOT SUPPORTED in this version of the protocol.

#### 1.2 Claim Key Namespace Convention

Following the CN Credentials standard convention established by Digital Asset, CPRP uses a DNS-style namespace prefix for claim keys:

```
<authority>/<key>

Where <authority> is either:
  - A DNS domain controlled by the standard author (e.g., "freename.com")
  - A well-known standard identifier (e.g., "cns-2.0", "cprp")
```

CPRP reserves the following authority prefixes:

| Authority | Controlled By | Purpose |
|-----------|--------------|---------|
| `cprp` | This CIP | Resolution-specific claims |
| `cns-2.0` | CN Credentials Standard | Profile and naming claims (reused) |

Third-party resolvers SHOULD use their own DNS domain as the authority prefix for custom claim keys (e.g., `freename.com/collision-score`, `7trust.c7.digital/reputation`). This follows the Kubernetes-style convention described in the CNS 2.0 design.


### 2. Resolver Interface

#### 2.1 Overview

Any identity provider MAY become a CPRP resolver by implementing the Resolver Interface. The interface is deliberately minimal to lower the barrier to adoption while providing sufficient structure for interoperability.

A resolver MUST:

- Maintain a mapping from `(namespace, name)` pairs to Party IDs.
- Publish backing credentials via the CN Credentials Daml interface.
- Expose a resolution API conforming to the schemas defined in this section.
- Report a `resolver_id` that is unique within the Canton Network.
- Include the `cprp/network` claim in all published credentials.

A resolver SHOULD:

- Support reverse resolution (Party ID → names).
- Expose a changelog endpoint for Scan integration.
- Publish its own Party Resolution Record as a self-description.
- Support name delegation (Section 2.7).

#### 2.2 Resolver Identity

Each resolver is itself a Canton party and MUST publish a self-describing credential with the following claims:

```
publisher: <resolver_party>
subject:   <resolver_party>
claims: {
  "cprp/resolver-id":       "<unique_ascii_identifier>",
  "cprp/resolver-version":  "1.0",
  "cprp/resolver-endpoint": "<base_url>",
  "cprp/resolver-type":     "featured" | "permissionless" | "address-book",
  "cprp/network":           "mainnet" | "testnet" | "devnet",
  "cprp/namespaces":        "<comma_separated_supported_namespaces>",
  "cprp/capabilities":      "<comma_separated_capabilities>"
}
```

The `resolver_id` MUST be a lowercase ASCII string of 1–32 characters matching the pattern `[a-z0-9][a-z0-9-]*[a-z0-9]`. Examples: `dns`, `vlei`, `freename`, `7trust`, `app-local`.

Supported capabilities:

| Capability | Description |
|-----------|-------------|
| `resolve` | Forward resolution (name → party) |
| `reverse` | Reverse resolution (party → names) |
| `changelog` | Changelog endpoint for Scan/indexer integration |
| `delegation` | Supports hierarchical name delegation |
| `encrypted-fields` | Supports publishing/decrypting encrypted metadata |
| `cross-chain` | Supports cross-chain identity verification |

#### 2.3 Core Resolution

##### 2.3.1 resolve

Resolves a name within a namespace to a Resolution Record.

Request:

```json
{
  "method": "cprp.resolve",
  "params": {
    "namespace": "<string>",
    "name":      "<string>"
  }
}
```

Response:

```json
{
  "result": {
    "resolver_id":  "<string>",
    "network":      "<mainnet|testnet|devnet>",
    "namespace":    "<string>",
    "name":         "<string>",
    "party_id":     "<canton_party_id>",
    "credentials":  [ <CredentialRef>, ... ],
    "metadata":     { "<key>": "<value>", ... },
    "confidence":   "<HIGH|MEDIUM|LOW>",
    "valid_from":   "<ISO8601>",
    "valid_until":  "<ISO8601|null>",
    "record_hash":  "<sha256_hex>",
    "delegated_by": "<fqpn|null>"
  }
}
```

Response — not found:

```json
{
  "result": null
}
```

Fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `resolver_id` | string | REQUIRED | The resolver's unique identifier |
| `network` | string | REQUIRED | The Canton network this record belongs to |
| `namespace` | string | REQUIRED | The namespace queried |
| `name` | string | REQUIRED | The name queried |
| `party_id` | string | REQUIRED | The resolved Canton Party ID |
| `credentials` | array | REQUIRED | References to backing CN Credential contracts |
| `metadata` | object | REQUIRED | Key-value metadata claims (see Section 4) |
| `confidence` | enum | REQUIRED | Resolver's self-reported confidence: `HIGH`, `MEDIUM`, or `LOW` |
| `valid_from` | string | REQUIRED | ISO 8601 timestamp of record activation |
| `valid_until` | string | OPTIONAL | ISO 8601 timestamp of record expiry, or null for no expiry |
| `record_hash` | string | REQUIRED | SHA-256 hash of the canonical serialization of this record (see below) |
| `delegated_by` | string | OPTIONAL | If this name was delegated, the FQPN of the parent name owner |

Canonical serialization for `record_hash`: The record is serialized as a JSON object with keys sorted lexicographically (Unicode code point order), no insignificant whitespace, UTF-8 encoded. The `record_hash` field itself MUST be excluded from the serialization before hashing. Implementations MUST use this deterministic serialization to ensure that different implementations produce identical hashes for the same record.

CredentialRef:

```json
{
  "contract_id":  "<daml_contract_id>",
  "publisher":    "<canton_party_id>",
  "claim_key":    "<string>",
  "claim_value":  "<string>",
  "ledger_effective_time": "<ISO8601>"
}
```

Note: `ledger_effective_time` (LET) is included in every CredentialRef to support LET-based conflict resolution (see Section 3.4).

##### 2.3.2 resolveMulti

Resolves a name within a namespace and returns results from multiple matching entries, if any. This is used when a resolver manages multiple credential-backed bindings for the same name (e.g., a name delegated to sub-parties).

Request:

```json
{
  "method": "cprp.resolveMulti",
  "params": {
    "namespace": "<string>",
    "name":      "<string>",
    "limit":     <integer, default 10>,
    "offset":    <integer, default 0>
  }
}
```

Response:

```json
{
  "results": [ <ResolutionRecord>, ... ],
  "total":   <integer>
}
```

##### 2.3.3 reverseResolve

Resolves a Canton Party ID to all names registered for that party within this resolver.

Request:

```json
{
  "method": "cprp.reverseResolve",
  "params": {
    "party_id": "<canton_party_id>"
  }
}
```

Response:

```json
{
  "results": [
    {
      "resolver_id": "<string>",
      "network":     "<string>",
      "namespace":   "<string>",
      "name":        "<string>",
      "confidence":  "<HIGH|MEDIUM|LOW>",
      "delegated_by": "<fqpn|null>"
    },
    ...
  ]
}
```

##### 2.3.4 changelog

Returns credential updates since a given timestamp, for Scan and third-party indexer integration.

Request:

```json
{
  "method": "cprp.changelog",
  "params": {
    "since":  "<ISO8601>",
    "limit":  <integer, default 100>,
    "cursor": "<opaque_string|null>"
  }
}
```

Response:

```json
{
  "updates": [
    {
      "type":       "created" | "updated" | "revoked" | "delegated",
      "timestamp":  "<ISO8601>",
      "namespace":  "<string>",
      "name":       "<string>",
      "party_id":   "<canton_party_id>",
      "credential_ref": <CredentialRef>,
      "delegated_by":   "<fqpn|null>"
    },
    ...
  ],
  "next_cursor": "<opaque_string|null>"
}
```

The changelog endpoint MUST return updates in chronological order. Consumers SHOULD use cursor-based pagination for large result sets. A resolver MUST retain changelog entries for a minimum of 90 days.

#### 2.4 Error Handling

All resolver methods MUST use the following error response format:

```json
{
  "error": {
    "code":    <integer>,
    "message": "<string>"
  }
}
```

Standard error codes:

| Code | Meaning |
|------|---------|
| 1001 | Namespace not supported by this resolver |
| 1002 | Name not found |
| 1003 | Party ID not found (reverse resolve) |
| 1004 | Invalid request parameters |
| 1005 | Resolver temporarily unavailable |
| 1006 | Rate limit exceeded |
| 1007 | Authentication required |
| 1008 | Insufficient permissions for encrypted field decryption |
| 1009 | Network mismatch |
| 1010 | Delegation not authorized |
| 1011 | Encrypted field decapsulation failed (key mismatch or corrupted ciphertext) |
| 1012 | Encrypted field decryption failed (integrity check / authentication tag mismatch) |

#### 2.5 Transport

Resolvers MUST expose their API over HTTPS (TLS 1.3 minimum). Resolvers SHOULD additionally support gRPC with the same method signatures for performance-sensitive integrations. The canonical serialization format is JSON. Resolvers MAY support additional serialization formats (e.g., CBOR, Protobuf) as documented in their resolver identity credential.

#### 2.6 Address Book Resolver

A local or organization-scoped address book is a special resolver type that provides application-local or organization-local name mappings. Address books integrate with CPRP as resolvers with `resolver-type: address-book`.

##### 2.6.1 Characteristics

Address book resolvers differ from network resolvers in the following ways:

| Property | Network Resolver | Address Book Resolver |
|----------|-----------------|----------------------|
| Scope | Network-wide | Local to an app or organization |
| On-ledger credentials | REQUIRED | NOT REQUIRED |
| Resolver Interface API | REQUIRED | RECOMMENDED (may be in-process) |
| Trust tier | T1–T4 based on type | Configurable per strategy |
| Changelog | REQUIRED | OPTIONAL |
| Discovery | Via registry or config | Via app/validator configuration |

##### 2.6.2 Integration Model

An address book resolver MAY be:

1. In-process: Embedded directly in the application, backed by a local database or configuration file. No network API is required; the application invokes the resolver interface programmatically.
2. Organization-scoped service: A shared service within an organization (e.g., backed by LDAP or an internal directory), exposed via the standard resolver API to all apps within the organization.
3. Validator-configured: Configured in the Validator App configuration, making it available to all apps connected to that validator.

##### 2.6.3 Address Book Data Model

An address book entry MAY be as simple as:

```json
{
  "namespace":    "internal",
  "name":         "acme-treasury",
  "party_id":     "party::122a8f9f...",
  "display_name": "ACME Treasury Desk",
  "notes":        "Primary counterparty for repo trades"
}
```

Address book entries do not require on-ledger credentials. They are inherently trusted by the application that maintains them but carry no external trust weight. When included in a Resolution Strategy, the application explicitly sets the weight and position of the address book resolver relative to network resolvers.

##### 2.6.4 Resolution Priority

Following the CNS 2.0 design principle, applications have two common patterns for address book integration:

Pattern A — App-first (Etherscan model):
1. First, check the address book for a match.
2. Only if no match, query network resolvers.

Pattern B — Network-first (Institutional model):
1. First, query trusted network resolvers (DNS, vLEI).
2. Only if no match, fall back to the address book.

Both patterns are expressed naturally in the Resolution Strategy by setting the address book resolver's position and weight in the resolver list.

#### 2.7 Name Delegation

##### 2.7.1 Overview

Name delegation allows a name owner to authorize sub-parties to register subnames within their namespace. This supports organizational hierarchies: `acme.com` can delegate `treasury.acme.com`, `trading.acme.com`, etc.

Delegation follows the credential model established in the CNS 2.0 design:

> "dsoParty asserts that acmeParty told them to assign the name treasury to the party acmeTreasuryParty within their acme.com domain."

##### 2.7.2 Delegation Credential

A delegation is expressed as a CN Credential:

```
publisher: <parent_party>
subject:   <child_party>
claims: {
  "cprp/delegation":        "true",
  "cprp/parent-fqpn":       "<parent_fqpn>",
  "cprp/delegated-name":    "<subname>",
  "cprp/delegation-scope":  "name-only" | "name-and-subdelegation",
  "cprp/network":           "<network>"
}
```

Delegation scope:
- `name-only`: The child can use the delegated name but cannot further delegate subnames.
- `name-and-subdelegation`: The child can use the delegated name AND delegate further subnames within it.

##### 2.7.3 Delegation Verification

When a resolver returns a result with `delegated_by` set, the resolution engine MUST verify the delegation chain:

```
FUNCTION verifyDelegation(record: ResolutionRecord) -> Boolean

  1. LET parent_fqpn = record.delegated_by
  2. RESOLVE parent_fqpn to parent_record.
     IF parent_record is null: RETURN FALSE

  3. FIND a delegation credential where:
     publisher = parent_record.party_id
     subject = record.party_id
     claims["cprp/delegated-name"] = record.name
     credential is active (not archived, not expired)

  4. IF parent_record is itself delegated:
     VERIFY parent delegation scope includes "name-and-subdelegation"
     RECURSIVELY verify parent delegation chain.

  5. IF all checks pass: RETURN TRUE
     ELSE: RETURN FALSE
```

##### 2.7.4 Delegation Daml Contract

```daml
template NameDelegation with
    dso           : Party
    parent        : Party
    child         : Party
    parentFqpn    : Text
    delegatedName : Text
    scope         : DelegationScope  -- NameOnly | NameAndSubdelegation
    network       : Text
  where
    signatory parent, child
    observer dso

    ensure delegatedName /= ""

    choice Delegation_Revoke : ()
      controller parent
      do return ()

    choice Delegation_SubDelegate : ContractId NameDelegation
      with
        subChild      : Party
        subName       : Text
        subScope      : DelegationScope
      controller child
      do
        assert (scope == NameAndSubdelegation)
        create NameDelegation with
          dso, parent = child, child = subChild,
          parentFqpn = parentFqpn <> ":" <> delegatedName,
          delegatedName = subName, scope = subScope, network
```


### 3. Resolution Strategy and Composition

#### 3.1 Overview

Each Canton application configures a Resolution Strategy that governs how it queries resolvers and composes results. The Resolution Strategy is the application's answer to "what does verified mean for me?" — different applications will have different trust requirements.

This design directly implements the Working Group's principle that "every app decides on the name-resolution strategy to use in their app UI."

#### 3.2 Strategy Schema

A Resolution Strategy is a JSON document conforming to the following schema:

> Cross-CIP note: The Resolution Strategy is a unified per-application configuration document that spans both CIP-XXXX (resolution parameters: `resolvers`, `address_books`, `resolution_mode`, `display_name_rule`, `cache_policy`) and CIP-YYYY (verification parameters: `verification_policy`). Both CIPs contribute fields to the same schema. Applications that adopt only CIP-XXXX (resolution without verification) MAY omit the `verification_policy` section; all resolved identities will default to `UNVERIFIED` status.

```json
{
  "strategy_version": "1.0",
  "strategy_id":      "<string>",
  "network":          "<mainnet|testnet|devnet>",

  "resolvers": [
    {
      "resolver_id":  "<string>",
      "weight":       <number, 0.0–1.0>,
      "required":     <boolean>,
      "timeout_ms":   <integer>,
      "namespaces":   ["<string>", ...]
    },
    ...
  ],

  // NOTE: The resolver_id "*" is a wildcard that matches any featured or
  // permissionless resolver not already listed in the strategy. This allows
  // applications to query all available resolvers without enumerating them.

  "address_books": [
    {
      "id":       "<string>",
      "type":     "local" | "organization" | "validator",
      "weight":   <number, 0.0–1.0>,
      "position": "before_resolvers" | "after_resolvers"
    },
    ...
  ],

  "resolution_mode": "priority" | "parallel" | "quorum",

  "display_name_rule": {
    "source": "highest_weight" | "specific_resolver" | "address_book_first",
    "resolver_id": "<string, if source=specific_resolver>",
    "claim_key":   "cns-2.0/name"
  },

  "verification_policy": {
    "min_resolvers":       <integer>,
    "min_total_weight":    <number>,
    "required_resolver_ids": ["<string>", ...],
    "required_credential_types": ["<string>", ...],
    "reject_if_revoked":   <boolean>,
    "reject_if_collision": <boolean>
  },

  "cache_policy": {
    "ttl_seconds":     <integer>,
    "max_entries":     <integer>,
    "refresh_ahead":   <boolean>
  }
}
```

#### 3.3 Resolution Modes

Priority mode. Resolvers are queried sequentially in weight order (highest first). Resolution stops at the first resolver that returns a result. This is the DEFAULT mode.

Parallel mode. All configured resolvers are queried simultaneously. Results are composed by weight. This mode provides the richest resolution at the cost of higher latency.

Quorum mode. Resolvers are queried in parallel and resolution succeeds only when `min_resolvers` from the verification policy have returned consistent results (same Party ID for the same name). This provides the highest assurance.

#### 3.4 Composition Algorithm

When multiple resolvers return results for the same query, the composition algorithm produces a unified `ComposedResolutionResult`:

```
FUNCTION compose(results: [ResolutionRecord], strategy: ResolutionStrategy)
  -> ComposedResolutionResult

  1. GROUP results by party_id.
     IF results map to multiple distinct party_ids:
       SET collision = TRUE
       IF strategy.verification_policy.reject_if_collision:
         RETURN status=COLLISION, party_id=null
       ELSE:
         SELECT the party_id with the highest cumulative resolver weight.

  2. MERGE metadata across all results:
     INITIALIZE claim_sources = {}
     FOR each metadata key present in multiple results:
       a. IF results are from the SAME resolver at different times:
          USE the value with the most recent ledger_effective_time (LET).
          This maintains CNS 2.0 compatibility: "UIs resolve duplicate
          metadata entries using last-write-wins by default using LET."
       b. IF results are from DIFFERENT resolvers:
          USE the value from the highest-weight resolver.
       c. Applications MAY override this behavior by setting a custom
          display_name_rule in their strategy.
     FOR each metadata key in the merged result:
       RECORD claim_sources[key] = { resolver_id, issuer, let } of the
       winning source. This enables per-claim provenance auditing.

  3. AGGREGATE credentials from all results into a deduplicated list.

  4. COMPUTE display_name:
     IF strategy.display_name_rule.source == "address_book_first":
       CHECK address books first. IF match: USE address book display_name.
     IF strategy.display_name_rule.source == "highest_weight":
       USE the cns-2.0/name claim from the highest-weight resolver.
     ELIF strategy.display_name_rule.source == "specific_resolver":
       USE the cns-2.0/name claim from the specified resolver.
     FALLBACK to the raw name from the FQPN.

  5. COMPUTE ascii_form:
     "<resolver_id>:<namespace>:<name>" from the highest-weight resolver.

  6. IF strategy includes a verification_policy (CIP-YYYY):
       EVALUATE trust (see Section 5).
     ELSE:
       SET status = UNVERIFIED (no verification layer configured).

  RETURN ComposedResolutionResult {
    display_name, ascii_form, party_id, status, trust_path,
    metadata, claim_sources, credentials, collision, resolvers_consulted
  }
```

#### 3.5 ComposedResolutionResult Schema

```json
{
  "display_name":        "<string>",
  "ascii_form":          "<resolver:namespace:name>",
  "party_id":            "<canton_party_id>",
  "network":             "<mainnet|testnet|devnet>",
  "status":              "VERIFIED" | "UNVERIFIED" | "PARTIAL" | "REVOKED" | "COLLISION",
  "trust_path":          [ <TrustPathEntry>, ... ],
  "metadata":            { "<key>": "<value>", ... },
  "endpoints":           { "<key>": "<url>", ... },
  "profile":             { "<key>": "<value>", ... },
  "credentials":         [ <CredentialRef>, ... ],
  "delegation_chain":    [ "<fqpn>", ... ] | null,
  "collision":           <boolean>,
  "collision_details":   [ <CollisionEntry>, ... ] | null,
  "resolvers_consulted": [ "<resolver_id>", ... ],
  "claim_sources":       { "<claim_key>": { "resolver_id": "<string>", "issuer": "<party_id>", "let": "<ISO8601>" }, ... },
  "resolved_at":         "<ISO8601>",
  "cache_ttl_seconds":   <integer>
}
```

The optional `claim_sources` map provides per-claim provenance: for each metadata key in the result, it records which resolver contributed the value and the credential's ledger effective time. This supports institutional audit trails where compliance teams need to trace the origin of each piece of displayed information. Applications MAY expose `claim_sources` in UI to show claim provenance (e.g., "Display name provided by DNS resolver, LEI provided by vLEI resolver").

TrustPathEntry:

```json
{
  "resolver_id":     "<string>",
  "issuer":          "<canton_party_id>",
  "issuer_tier":     "T1" | "T2" | "T3" | "T4",
  "credential_type": "<string>",
  "status":          "active" | "expired" | "revoked",
  "verified_at":     "<ISO8601>"
}
```

#### 3.6 Default Resolution Strategies

This CIP defines two reference strategies that applications MAY use as defaults:

INSTITUTIONAL_DEFAULT:

```json
{
  "strategy_version": "1.0",
  "strategy_id": "institutional_default",
  "network": "mainnet",
  "resolvers": [
    { "resolver_id": "dns",     "weight": 1.0, "required": false, "timeout_ms": 5000, "namespaces": ["*"] },
    { "resolver_id": "vlei",    "weight": 0.9, "required": false, "timeout_ms": 5000, "namespaces": ["*"] },
    { "resolver_id": "cn-cred", "weight": 0.8, "required": false, "timeout_ms": 3000, "namespaces": ["*"] }
  ],
  "address_books": [
    { "id": "org-directory", "type": "organization", "weight": 0.7, "position": "after_resolvers" }
  ],
  "resolution_mode": "parallel",
  "display_name_rule": { "source": "highest_weight", "claim_key": "cns-2.0/name" },
  "verification_policy": {
    "min_resolvers": 1,
    "min_total_weight": 0.9,
    "required_resolver_ids": [],
    "required_credential_types": ["dns-verified"],
    "reject_if_revoked": true,
    "reject_if_collision": true
  },
  "cache_policy": { "ttl_seconds": 3600, "max_entries": 10000, "refresh_ahead": true }
}
```

PERMISSIVE_DEFAULT:

```json
{
  "strategy_version": "1.0",
  "strategy_id": "permissive_default",
  "network": "mainnet",
  "resolvers": [
    { "resolver_id": "dns",     "weight": 1.0, "required": false, "timeout_ms": 5000, "namespaces": ["*"] },
    { "resolver_id": "cn-cred", "weight": 0.8, "required": false, "timeout_ms": 3000, "namespaces": ["*"] },
    { "resolver_id": "*",       "weight": 0.5, "required": false, "timeout_ms": 3000, "namespaces": ["*"] }
  ],
  "address_books": [
    { "id": "local", "type": "local", "weight": 0.6, "position": "before_resolvers" }
  ],
  "resolution_mode": "priority",
  "display_name_rule": { "source": "address_book_first", "claim_key": "cns-2.0/name" },
  "verification_policy": {
    "min_resolvers": 1,
    "min_total_weight": 0.5,
    "required_resolver_ids": [],
    "required_credential_types": [],
    "reject_if_revoked": true,
    "reject_if_collision": false
  },
  "cache_policy": { "ttl_seconds": 600, "max_entries": 5000, "refresh_ahead": false }
}
```

The wildcard resolver_id `"*"` matches any featured or permissionless resolver not already listed.


### 4. Credential Mapping

#### 4.1 Overview

CPRP is credential-native: all resolution data is ultimately backed by CN Credentials published through the standard Daml interface. This section defines how CPRP concepts map to CN Credential claims.

#### 4.2 Credential Interface

CPRP resolvers MUST publish their data using the CN Credentials Daml interface:

```daml
interface Credential with viewtype = CredentialView
  publisher : Party
  subject   : Party
  claims    : Map Text Text
  validUntil : Optional Time
```

The `publisher` is the resolver or issuer party. The `subject` is the party being resolved. The `claims` map contains key-value pairs using the namespaced keys defined below.

#### 4.3 CPRP Claim Keys

CPRP claims use the `cprp/` authority prefix. Third-party resolvers use their own DNS domain as the authority prefix per the convention in Section 1.2.

Core identity claims:

| Claim Key | Value Type | Description |
|-----------|-----------|-------------|
| `cprp/resolver` | string | Resolver ID that backs this credential |
| `cprp/namespace` | string | The namespace within the resolver |
| `cprp/name` | string | The registered name |
| `cprp/fqpn` | string | Full FQPN including network prefix |
| `cprp/network` | string | Network discriminator: `mainnet`, `testnet`, `devnet` |

Trust and verification claims:

| Claim Key | Value Type | Description |
|-----------|-----------|-------------|
| `cprp/trust-anchor` | string | Issuer tier classification: `T1`, `T2`, `T3`, `T4` |
| `cprp/verification-method` | string | How verification was performed: `dns-txt`, `vlei-check`, `kyc-provider`, `sv-vote`, `self-attested` |
| `cprp/verification-timestamp` | ISO 8601 | When verification was last performed |

Delegation claims:

| Claim Key | Value Type | Description |
|-----------|-----------|-------------|
| `cprp/delegation` | string | "true" if this is a delegation credential |
| `cprp/parent-fqpn` | string | FQPN of the delegating parent |
| `cprp/delegated-name` | string | The subname being delegated |
| `cprp/delegation-scope` | string | `name-only` or `name-and-subdelegation` |

Endpoint discovery claims (solves P2):

| Claim Key | Value Type | Description |
|-----------|-----------|-------------|
| `cprp/endpoint:<service>` | URL | Off-ledger API endpoint for a named service |
| `cprp/endpoint:api` | URL | Primary API endpoint |
| `cprp/endpoint:settlement` | URL | Settlement service endpoint |
| `cprp/endpoint:token-admin` | URL | CIP-56 token admin endpoint |

Profile claims (solves P3):

These reuse the `cns-2.0/` namespace defined by the CN Credentials standard:

| Claim Key | Value Type | Description |
|-----------|-----------|-------------|
| `cns-2.0/name` | string | Human-readable display name |
| `cns-2.0/email` | string | Contact email |
| `cns-2.0/lei` | string | Legal Entity Identifier |
| `cns-2.0/avatar` | URL | Profile image URL |
| `cns-2.0/website` | URL | Organization website |

Profile claim rendering guidelines:

- `cns-2.0/name` SHOULD be ≤64 Unicode characters. Applications SHOULD gracefully truncate longer values and MUST NOT treat the display name as an identifier or verified attribute.
- `cns-2.0/avatar` SHOULD be an `https://` URL. Applications MAY additionally support `ipfs://` URIs for decentralized avatar hosting. Applications MUST validate the URI scheme before rendering.
- Profile claims are informational only and MUST NOT be interpreted as verified identity attributes. Verification status is determined exclusively by the trust evaluation algorithm (Section 5), not by the presence or content of profile claims.

Social and contact claims:

| Claim Key | Value Type | Description |
|-----------|-----------|-------------|
| `cprp/social:telegram` | string | Telegram handle (without `@` prefix) |
| `cprp/social:x` | string | X (Twitter) handle (without `@` prefix) |
| `cprp/social:github` | string | GitHub username or organization |
| `cprp/social:discord` | string | Discord handle or user ID |

Social claims are T4 (self-attested) by default. Applications MAY render social handles with platform-appropriate formatting (e.g., prepending `@` for display, linking to `https://github.com/<value>`). Additional social platforms can be added using the `cprp/social:<platform>` convention without requiring a CIP amendment. This convention is compatible with the profile claim namespace defined in the PixelPlex Party Profile Credentials CIP.

Extended metadata claims:

> Cross-CIP note: The claims below (`cprp/jurisdiction`, `cprp/entity-type`, `cprp/capability`, `cprp/chain-id:*`) are defined in this shared specification and used by both CIP-XXXX (for profile display and endpoint discovery) and CIP-YYYY (for verification context). Neither CIP exclusively "owns" these claims.

| Claim Key | Value Type | Description |
|-----------|-----------|-------------|
| `cprp/jurisdiction` | ISO 3166-1 alpha-2 | Regulatory jurisdiction |
| `cprp/entity-type` | string | Entity classification: `bank`, `custodian`, `exchange`, `asset-manager`, `issuer`, `validator`, `other` |
| `cprp/capability` | comma-separated | Declared capabilities: `custody`, `settlement`, `issuance`, `trading`, `lending` |
| `cprp/chain-id:<chain>` | string | Cross-chain identity on another network (see Section 9) |

Encrypted field claims:

| Claim Key | Value Type | Description |
|-----------|-----------|-------------|
| `cprp/enc-field:<field_name>` | EncryptedFieldEnvelope (JSON) | Encrypted metadata field (see Section 6) |
| `cprp/enc-key` | string | Party's Kyber-768 public key for receiving encrypted fields |

#### 4.4 Credential Lifecycle

A resolver MUST manage the lifecycle of its published credentials:

1. Creation: When a party registers a name, the resolver publishes a credential with the appropriate CPRP claims.
2. Update: When metadata changes, the resolver publishes a new credential and archives (via Daml choice) the previous one. The resolution engine uses `validUntil` and on-ledger contract state to determine the current credential.
3. Revocation: When a name is deregistered or verification fails, the resolver archives the credential. Archival is immediate and MUST be reflected in the resolver's changelog within 60 seconds.
4. Expiry: Credentials with a `validUntil` value automatically become inactive after that time. Resolvers SHOULD set `validUntil` to enforce periodic re-verification.

Conflict resolution for duplicate claims:

When the same claim key appears in multiple active credentials from the same issuer, the credential with the most recent ledger effective time (LET) wins. This is consistent with the CNS 2.0 design: "UIs resolve duplicate metadata entries using last-write-wins by default using LET."


### 5. Trust Model

#### 5.1 Overview

The trust model defines how the resolution engine determines whether a resolved identity qualifies as "verified" — that is, whether the `.unverified` prefix can be removed. Trust is not binary; it is composed from multiple independent attestations from issuers of varying authority.

#### 5.2 Issuer Tiers

CPRP classifies identity issuers into four tiers:

Tier 1 (T1) — DSO / SV Consensus. Attestations produced by a supermajority of Super Validator nodes, or by the DSO party directly. Examples: `CnsDnsClaim` contracts verified by SV consensus, SV-endorsed credentials. T1 attestations carry the highest trust because they are backed by Canton's own governance mechanism.

Tier 2 (T2) — Regulated Identity Providers. Attestations from regulated entities operating under legal obligations of accuracy. Examples: GLEIF (vLEI issuers), SEC (CRD numbers), national financial regulators, licensed KYC providers. T2 attestations carry legal weight and regulatory accountability.

Tier 3 (T3) — Featured Resolvers. Attestations from resolvers registered on-ledger via SV governance vote (see Section 7). Examples: C7 7Trust, 5NorthID, Axynos XNS, Freename. T3 resolvers have been reviewed and approved by the Canton community but are not regulated identity providers.

Tier 4 (T4) — Self-Attestation. Credentials self-published by the party about itself. Examples: profile information, endpoint declarations, capability listings. T4 attestations carry no external trust but are useful for metadata discovery (P2, P3).

An issuer MUST declare its tier via the `cprp/trust-anchor` claim when publishing credentials. The resolution engine MUST verify that the declared tier matches the issuer's actual status:

- T1: publisher is the DSO party or a current Super Validator.
- T2: the credential's `cprp/verification-method` indicates regulated-source verification (e.g., `vlei-check`, `kyc-provider`), AND the publisher has verified the claim against the regulated source's authoritative API (e.g., GLEIF for vLEI). The publisher MUST itself be at least T3 (featured resolver) or T1. T2 reflects the trust authority of the *verification source* (GLEIF, SEC, etc.), not of the intermediary resolver.
- T3: publisher is registered in the Featured Resolver Registry (Section 7).
- T4: publisher == subject (self-attestation).

#### 5.3 Trust Evaluation Algorithm

The trust evaluation algorithm is applied by the resolution engine after composing results from multiple resolvers:

```
FUNCTION evaluateTrust(
  composed: ComposedResolutionResult,
  policy:   VerificationPolicy
) -> VerificationStatus

  1. COLLECT all credentials from composed.credentials.
  2. FOR EACH credential:
     a. VERIFY the credential is active on-ledger (not archived, not past validUntil).
     b. CLASSIFY the issuer into T1–T4.
     c. IF any credential has status "revoked": SET has_revocation = TRUE.

  3. IF policy.reject_if_revoked AND has_revocation:
     RETURN REVOKED

  4. COUNT active_resolvers = number of distinct resolver_ids with at least one active credential.
     IF active_resolvers < policy.min_resolvers:
       RETURN UNVERIFIED

  5. SUM total_weight = sum of weights of resolvers with active credentials.
     IF total_weight < policy.min_total_weight:
       RETURN UNVERIFIED

  6. FOR EACH required_id in policy.required_resolver_ids:
     IF no active credential from this resolver:
       RETURN UNVERIFIED

  7. FOR EACH required_type in policy.required_credential_types:
     IF no active credential with matching cprp/verification-method:
       RETURN UNVERIFIED

  8. IF active_resolvers >= policy.min_resolvers
     AND total_weight >= (policy.min_total_weight * 0.5)
     AND total_weight < policy.min_total_weight:
     RETURN PARTIAL
     (At least one resolver confirms the identity, but cumulative weight
      is below the policy threshold. Applications SHOULD display a partial
      verification indicator and allow the user to inspect the trust path.)

  9. RETURN VERIFIED
```

#### 5.4 Trust Path

The resolution engine MUST include a `trust_path` in every `ComposedResolutionResult`. The trust path is an ordered list of `TrustPathEntry` records documenting how the verification status was derived. This serves as an audit trail for compliance purposes and allows applications to present trust reasoning to users.


### 6. Encrypted Fields

Note: encrypted fields are specified here for completeness but are deferred to a follow-up CIP for initial deployment. The core CPRP value — names, trust tiers, DNS/vLEI verification — ships without encrypted fields. The cryptographic design below is documented for future implementation when the core protocol is proven.

#### 6.1 Overview

Certain metadata fields are confidential and MUST NOT be exposed to unauthorized parties. CPRP defines an Encrypted Field mechanism that allows parties to publish recipient-specific encrypted metadata within their CN Credentials. This is critical for Canton's institutional audience, where API endpoints, banking details, and compliance metadata are sensitive.

#### 6.2 Cryptographic Primitives

CPRP specifies the following cryptographic primitives for encrypted fields:

Symmetric Encryption: AES-256-GCM (NIST SP 800-38D)
- 256-bit key
- 96-bit initialization vector (IV)
- 128-bit authentication tag
- Output: `{iv, ciphertext, tag}`

Key Encapsulation: ML-KEM-768 (Kyber-768) (NIST FIPS 203)
- IND-CCA2 security
- Post-quantum secure
- KEM interface: `(ciphertext, shared_secret) = Encapsulate(pk)`
- Shared secret is used to derive the AES-256 key via HKDF-SHA256

Key Derivation: HKDF-SHA256 (RFC 5869)
- Input: Kyber-768 shared secret
- Salt: `"CPRP-v1-enc-field"`
- Info: `<field_name>|<sender_fqpn>|<recipient_fqpn>`
- Output: 256-bit AES key

Public Key Distribution: Each party that wishes to receive encrypted fields MUST publish its Kyber-768 public key as a CN Credential claim:

```
claims: {
  "cprp/enc-key": "<base64_encoded_kyber768_public_key>"
}
```

#### 6.3 Encrypted Field Envelope

An encrypted field is stored as a JSON-serialized envelope within a CN Credential claim using the `cprp/enc-field:<field_name>` key:

```json
{
  "version":    1,
  "field_name": "<string>",
  "enc_alg":    "AES-256-GCM",
  "kem_alg":    "ML-KEM-768",
  "kdf_alg":    "HKDF-SHA256",
  "kdf_salt":   "CPRP-v1-enc-field",
  "recipients": {
    "<recipient_fqpn>": {
      "kem_ct":  "<base64_kyber_ciphertext>",
      "iv":      "<base64_96bit_iv>",
      "ct":      "<base64_aes_ciphertext>",
      "tag":     "<base64_128bit_tag>"
    },
    ...
  }
}
```

Each recipient entry contains independently encrypted data: the same plaintext is encrypted with a different AES key derived from a fresh Kyber-768 encapsulation for each recipient. This ensures that compromise of one recipient's key does not affect other recipients.

#### 6.4 Encryption Procedure

```
FUNCTION encryptField(
  field_name:  Text,
  plaintext:   Bytes,
  sender_fqpn: Text,
  recipients:  [(fqpn: Text, pk: KyberPublicKey)]
) -> EncryptedFieldEnvelope

  envelope = { version: 1, field_name, enc_alg: "AES-256-GCM",
               kem_alg: "ML-KEM-768", kdf_alg: "HKDF-SHA256",
               kdf_salt: "CPRP-v1-enc-field", recipients: {} }

  FOR EACH (recipient_fqpn, recipient_pk) in recipients:
    (kem_ct, shared_secret) = KyberEncapsulate(recipient_pk)
    info = field_name + "|" + sender_fqpn + "|" + recipient_fqpn
    aes_key = HKDF_SHA256(shared_secret, salt="CPRP-v1-enc-field", info=info, length=32)
    iv = SecureRandom(12)
    (ct, tag) = AES_256_GCM_Encrypt(aes_key, iv, plaintext, aad=field_name)
    envelope.recipients[recipient_fqpn] = { kem_ct, iv, ct, tag }

  RETURN envelope
```

#### 6.5 Decryption Procedure

```
FUNCTION decryptField(
  envelope:       EncryptedFieldEnvelope,
  recipient_fqpn: Text,
  recipient_sk:   KyberSecretKey,
  sender_fqpn:    Text
) -> Bytes | Error

  entry = envelope.recipients[recipient_fqpn]
  IF entry is null: RETURN Error(1008, "Not an authorized recipient")

  shared_secret = KyberDecapsulate(recipient_sk, entry.kem_ct)
  IF decapsulation fails: RETURN Error(1011, "Decapsulation failed — key mismatch or corrupted ciphertext")

  info = envelope.field_name + "|" + sender_fqpn + "|" + recipient_fqpn
  aes_key = HKDF_SHA256(shared_secret, salt="CPRP-v1-enc-field", info=info, length=32)
  plaintext = AES_256_GCM_Decrypt(aes_key, entry.iv, entry.ct, entry.tag, aad=envelope.field_name)
  IF authentication tag verification fails: RETURN Error(1012, "Decryption failed — integrity check failed")

  RETURN plaintext
```

#### 6.6 Field Revocation

To revoke access to an encrypted field for a specific recipient, the publisher MUST re-encrypt the field without that recipient and update the credential. The previous credential MUST be archived. Due to the nature of symmetric encryption, the publisher SHOULD also rotate the underlying plaintext value when revoking a recipient, as the recipient may have cached the decrypted value.


### 7. Resolver Registry (Hybrid Model)

#### 7.1 Overview

CPRP uses a hybrid resolver registration model:

- Featured Resolvers are registered on-ledger via SV governance vote, granting them T3 issuer status and elevated visibility.
- Permissionless Resolvers implement the resolver interface without on-ledger registration. Applications MAY choose to trust them, but they cannot claim T3 status.
- Address Book Resolvers are local to an application or organization and do not participate in the registry.

This design balances openness (anyone can build a resolver) with institutional trust (featured resolvers are community-vetted).

#### 7.2 Featured Resolver Registration

A Featured Resolver is registered via a dedicated CIP following the standard governance process:

1. The resolver operator submits a CIP proposing featured status.
2. The CIP specifies: resolver identity, namespaces served, verification methodology, operational commitments, and expected contribution to the Canton ecosystem.
3. Super Validators vote on the CIP.
4. Upon approval, the DSO party publishes a credential:

```
publisher: <dso_party>
subject:   <resolver_party>
claims: {
  "cprp/featured-resolver":       "true",
  "cprp/featured-since":          "<ISO8601>",
  "cprp/featured-cip":            "<cip_number>",
  "cprp/featured-namespaces":     "<comma_separated>",
  "cprp/featured-renewal":        "<ISO8601>",
  "cprp/network":                 "<network>"
}
```

Featured status MUST be renewed annually via a lightweight re-confirmation vote. Failure to renew results in automatic demotion to permissionless status.

#### 7.3 Permissionless Resolvers

Any party MAY operate a permissionless resolver by:

1. Implementing the Resolver Interface (Section 2).
2. Publishing a resolver identity credential (Section 2.2) with `"cprp/resolver-type": "permissionless"`.
3. Advertising their resolver endpoint to potential consumers.

Permissionless resolvers MUST NOT set `cprp/trust-anchor` to T1, T2, or T3. Their credentials are classified as T4 unless the application's Resolution Strategy explicitly grants them higher trust.

#### 7.4 Resolver Discovery

Applications discover resolvers through two mechanisms:

1. On-ledger query: Query the CN Credentials registry for all credentials with `cprp/featured-resolver: true` published by the DSO party. This returns all featured resolvers.
2. Configuration: Applications include resolver endpoints directly in their Resolution Strategy configuration. This supports both featured and permissionless resolvers.


### 8. Collision Management

#### 8.1 Overview

A collision occurs when the same human-readable name resolves to different Canton Party IDs across different resolvers. For example, `dns:acmebank.com` might resolve to Party A, while `freename:acme-bank.canton` resolves to Party B. Collisions are an inherent consequence of the multi-resolver architecture and MUST be handled gracefully.

#### 8.2 Collision Detection

The composition algorithm (Section 3.4) detects collisions at step 1 by grouping results by `party_id`. If results map to more than one distinct `party_id`, the `collision` flag is set to `true`.

#### 8.3 Collision Resolution Strategies

Applications configure collision handling via the `reject_if_collision` flag in their verification policy:

Strict mode (`reject_if_collision: true`): The resolution returns status `COLLISION` with no resolved party. The application MUST present the conflicting results to the user for manual disambiguation. This is RECOMMENDED for institutional applications.

Permissive mode (`reject_if_collision: false`): The composition algorithm selects the `party_id` with the highest cumulative resolver weight. The `collision_details` array in the response documents all conflicting mappings. This is suitable for explorers and informational displays.

#### 8.4 Collision Details

When a collision is detected, the response MUST include collision details:

```json
{
  "collision_details": [
    {
      "party_id":    "<canton_party_id>",
      "resolver_id": "<string>",
      "namespace":   "<string>",
      "name":        "<string>",
      "weight":      <number>,
      "confidence":  "<HIGH|MEDIUM|LOW>"
    },
    ...
  ]
}
```

#### 8.5 Cross-Resolver Collision Arbitration

For featured resolvers, the Canton Foundation MAY establish a collision arbitration process via the Tech & Ops Committee. Disputed name-to-party mappings across featured resolvers can be escalated for governance review. The arbitration decision is published as a T1 credential that overrides conflicting resolver results.


### 9. Cross-Chain Identity Resolution

#### 9.1 Overview

Canton participants frequently operate across multiple blockchain networks. A bank active on Canton may also have identities on Ethereum, Solana, and traditional systems. CPRP defines a standard mechanism for linking and resolving cross-chain identities, providing a unified view of an entity across ecosystems.

#### 9.2 Cross-Chain Identity Claims

A party MAY publish cross-chain identity links as CN Credential claims:

```
claims: {
  "cprp/chain-id:ethereum":  "0x1234...abcd",
  "cprp/chain-id:solana":    "ABC123...xyz",
  "cprp/chain-id:polygon":   "0x5678...efgh",
  "cprp/chain-id:ens":       "acmebank.eth",
  "cprp/chain-id:swift":     "ACMEUS33"
}
```

The key format is `cprp/chain-id:<chain_identifier>` where `chain_identifier` is a lowercase string identifying the target chain or system.

#### 9.3 Cross-Chain Verification

Cross-chain identity claims are self-attested (T4) by default. To elevate them to verified status, the party MUST provide proof of control on the target chain. Resolvers MAY implement chain-specific verification:

Ethereum/EVM chains: The party signs a message containing their Canton Party ID with the private key of the claimed Ethereum address. The resolver verifies the signature and publishes a T3 credential.

DNS: Standard DNSSEC + TXT record verification as defined in the CNS 2.0 DNS path.

ENS: The party sets a TXT record on their ENS name containing their Canton Party ID. The resolver verifies via ENS resolution.

Domain mirroring: A traditional domain is tokenized on the target blockchain and linked to the Canton Party ID. The resolver verifies the on-chain token ownership matches the party administrator.

#### 9.4 Unified Resolution

When a CPRP resolution returns cross-chain identity claims, the application receives a unified view:

```json
{
  "party_id": "party::122a8f9f...",
  "display_name": "ACME Bank",
  "cross_chain": {
    "ethereum":  { "address": "0x1234...", "verified": true, "method": "signature" },
    "ens":       { "name": "acmebank.eth", "verified": true, "method": "txt-record" },
    "swift":     { "bic": "ACMEUS33", "verified": false, "method": "self-attested" }
  }
}
```


### 10. Verification Flows

#### 10.1 DNS Verification

The DNS resolver is a CPRP resolver that verifies Canton party identities using the Domain Name System. It implements the ENS-style DNS verification path agreed upon by the Working Group:

1. The entity enables DNSSEC on their authoritative DNS zone.
2. The entity publishes a TXT record: `_canton.<domain> TXT "party=<canton_party_id>"`.
3. SV nodes verify the TXT record and DNSSEC chain, and publish a `CnsDnsClaim` credential (T1).
4. The DNS resolver indexes the `CnsDnsClaim` and makes it available via the resolver API.

Subname delegation via DNS: A party that has claimed `acme.com` can delegate subnames by publishing additional TXT records:

```
_canton-delegate.treasury.acme.com TXT "party=<treasury_party_id>&delegated_by=acme.com"
```

SV nodes verify the delegation chain (the parent domain must have a valid `CnsDnsClaim`) and publish a delegation credential.

#### 10.2 vLEI Verification

The vLEI resolver verifies Canton party identities using Verifiable Legal Entity Identifiers issued by GLEIF-qualified vLEI issuers.

Verification flow:

1. The party presents its vLEI credential (OOR or ECR vLEI) containing its LEI.
2. The vLEI resolver queries the GLEIF API (`https://api.gleif.org/api/v1/lei-records/{lei}`) to verify:
   a. The LEI is active (entity status = ACTIVE, registration status = ISSUED).
   b. The legal name and jurisdiction match the party's self-attested profile.
3. The resolver verifies the vLEI credential's digital signature against the issuer's published key.
4. The resolver verifies the issuer is a GLEIF-qualified vLEI issuer (QVI).
5. Upon successful verification, the resolver publishes a credential:

```
publisher: <vlei_resolver_party>
subject:   <verified_party>
claims: {
  "cprp/resolver":             "vlei",
  "cprp/namespace":            "<lei>",
  "cprp/name":                 "default",
  "cprp/trust-anchor":         "T2",
  "cprp/verification-method":  "vlei-check",
  "cprp/verification-timestamp": "<ISO8601>",
  "cns-2.0/lei":               "<lei>",
  "cns-2.0/name":              "<legal_name_from_gleif>",
  "cprp/jurisdiction":         "<country_code>",
  "cprp/network":              "<network>"
}
```

Re-verification: The vLEI resolver MUST re-verify credentials periodically (RECOMMENDED: every 30 days) by re-querying the GLEIF API. If the LEI has been retired, the resolver MUST revoke the credential.

Organization Official vLEIs: When a party presents an Organization Official (OO) vLEI, the resolver can additionally verify that a specific individual is authorized to act on behalf of the legal entity. This maps to Canton's party administrator concept.

#### 10.3 DNS as Metadata Fallback

Beyond name verification, DNS MAY serve as a fallback distribution channel for CPRP metadata. This is OPTIONAL and provides resilience when the Canton ledger or Scan API is temporarily unavailable.

A party MAY publish CPRP metadata as structured DNS TXT records under typed subdomains:

```
_cprp-id.<domain>              TXT "<canton_party_id>"
_cprp-endpoint-api.<domain>    TXT "<api_endpoint_url>"
_cprp-endpoint-settle.<domain> TXT "<settlement_endpoint_url>"
_cprp-profile.<domain>         TXT "<json_encoded_profile>"
_cprp-enc-key.<domain>         TXT "<base64_kyber768_public_key>"
```

DNS-published metadata is considered T4 (self-attested) unless independently verified by a T1–T3 issuer. DNSSEC MUST be enabled for DNS-published metadata to be considered valid.

When the primary on-ledger resolution path is available, DNS metadata SHOULD be treated as a cache that MAY be used to accelerate resolution but MUST NOT override on-ledger credential state (e.g., revocations).

#### 10.4 Encrypted Metadata via DNS

A party MAY publish encrypted fields via DNS using the same Encrypted Field Envelope format (Section 6.3), base64-encoded in TXT records:

```
_cprp-enc-endpoint-api.<domain> TXT "<base64_encrypted_field_envelope>"
```

This enables the full CPRP encrypted metadata model to operate over DNS as an alternative distribution channel, providing resilience and reducing on-ledger storage requirements.


### 11. On-Ledger Representation

#### 11.1 Overview

CPRP on-ledger data is encoded as standard CN Credentials — no custom Daml templates are required for production use. The credential-based approach uses the existing CN Credentials Daml interface (publisher, subject, holder, claims, validUntil) with CPRP-specific claim keys. Updates are modeled as archiving the old credential and publishing a new one. Revocation is modeled as credential archival.

The Daml contract templates below are provided as reference implementations showing the field structure and lifecycle operations. Implementors MAY use these templates directly or encode the same data as standard credentials — the choice depends on whether the DSO registry or a separate app-layer registry is used.

#### 11.2 PartyNameRegistration

```daml
template PartyNameRegistration with
    dso        : Party
    resolver   : Party
    subject    : Party
    namespace  : Text
    name       : Text
    fqpn       : Text
    network    : Text
    recordHash : Text
  where
    signatory resolver, subject
    observer dso

    ensure namespace /= "" && name /= "" && network /= ""

    choice Registration_Update : ContractId PartyNameRegistration
      with
        newRecordHash : Text
      controller resolver
      do create this with recordHash = newRecordHash

    choice Registration_Revoke : ()
      controller resolver
      do return ()
```

#### 11.3 NameDelegation

```daml
data DelegationScope = NameOnly | NameAndSubdelegation
  deriving (Eq, Show)

template NameDelegation with
    dso           : Party
    parent        : Party
    child         : Party
    parentFqpn    : Text
    delegatedName : Text
    scope         : DelegationScope
    network       : Text
  where
    signatory parent, child
    observer dso

    ensure delegatedName /= ""

    choice Delegation_Revoke : ()
      controller parent
      do return ()

    choice Delegation_SubDelegate : ContractId NameDelegation
      with
        subChild : Party
        subName  : Text
        subScope : DelegationScope
      controller child
      do
        assert (scope == NameAndSubdelegation)
        create NameDelegation with
          dso, parent = child, child = subChild,
          parentFqpn = parentFqpn <> ":" <> delegatedName,
          delegatedName = subName, scope = subScope, network
```

#### 11.4 ResolverFeaturedStatus

```daml
template ResolverFeaturedStatus with
    dso           : Party
    resolver      : Party
    resolverId    : Text
    cipNumber     : Text
    featuredSince : Time
    renewalDate   : Time
    namespaces    : [Text]
    network       : Text
  where
    signatory dso
    observer resolver

    choice FeaturedStatus_Renew : ContractId ResolverFeaturedStatus
      with
        newRenewalDate : Time
      controller dso
      do create this with renewalDate = newRenewalDate

    choice FeaturedStatus_Revoke : ()
      controller dso
      do return ()
```

#### 11.5 CollisionArbitration

```daml
template CollisionArbitration with
    dso        : Party
    name       : Text
    network    : Text
    resolvedTo : Party
    details    : Text
    decidedAt  : Time
  where
    signatory dso

    choice Arbitration_Supersede : ContractId CollisionArbitration
      with
        newResolvedTo : Party
        newDetails    : Text
        newDecidedAt  : Time
      controller dso
      do create CollisionArbitration with
           dso, name, network, resolvedTo = newResolvedTo,
           details = newDetails, decidedAt = newDecidedAt
```

#### 11.6 ACS Impact Assessment

The on-ledger footprint of CPRP is designed to be minimal to comply with the WG constraint of "avoid bloating ACS size of DSO party."

Per-party on-ledger contracts:

| Contract Type | Count per Party | Estimated Size |
|--------------|----------------|---------------|
| PartyNameRegistration | 1 per registered name | ~500 bytes |
| CN Credential (CPRP claims) | 1–5 per resolver per party | ~1–3 KB each |
| NameDelegation | 0–10 per organization | ~400 bytes each |

Network-wide contracts:

| Contract Type | Count Total | Estimated Size |
|--------------|-------------|---------------|
| ResolverFeaturedStatus | ~10–30 (featured resolvers) | ~500 bytes each |
| CollisionArbitration | Rare (dispute cases only) | ~500 bytes each |

Estimated total ACS impact for 1,000 parties:

- Registration contracts: 1,000 × 500 bytes = 500 KB
- Credential contracts (avg 3 per party): 3,000 × 2 KB = 6 MB
- Delegation contracts (avg 2 per party): 2,000 × 400 bytes = 800 KB
- Total: ~7.3 MB for 1,000 parties

For comparison, the DSO party's existing ACS includes Amulet contracts for all Canton Coin holdings and activity records. CPRP adds approximately 7 KB per party, which is comparable to a single Amulet contract and unlikely to materially impact ACS performance.

Mitigation strategies:

1. Resolution queries are off-ledger (Scan API / resolver API) — the ACS is only used for trust anchoring.
2. Expired credentials are archived, removing them from the ACS.
3. Bulk metadata is stored off-ledger; only credential references are on-ledger.

On-ledger fee model: The party requesting name registration is responsible for Canton Coin fees associated with credential creation. For T1 credentials (DSO-published via SV consensus), the fee is absorbed by the existing SV reward mechanism. For T3 credentials, the featured resolver operator may pass fees through to the registering party per their commercial terms. Delegation credentials require fees from the delegating parent party.


### 12. Off-Ledger Resolution Service API

#### 12.1 OpenAPI Specification

The CPRP Resolution Service exposes an HTTP JSON API. The base path is `/{version}/cprp/` (e.g., `/v1/cprp/`).

Endpoints:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/cprp/resolve` | Resolve an FQPN |
| POST | `/v1/cprp/resolve-multi` | Resolve with multiple results |
| POST | `/v1/cprp/reverse-resolve` | Reverse resolve a Party ID |
| GET  | `/v1/cprp/changelog` | Get credential updates |
| GET  | `/v1/cprp/resolver-info` | Get resolver self-description |
| POST | `/v1/cprp/batch-resolve` | Resolve multiple FQPNs in a single request |

Batch resolve allows applications to resolve multiple names in a single request, which both improves performance and provides query privacy (observers cannot correlate individual name lookups):

```json
{
  "queries": [
    { "namespace": "acme.com", "name": "treasury" },
    { "namespace": "acme.com", "name": "trading" },
    { "namespace": "bankb.com", "name": "default" }
  ]
}
```

#### 12.2 Authentication

Resolution Service endpoints MUST support mutual TLS (mTLS) for authenticated queries. Resolvers MAY additionally support Canton party-based authentication where the querying party proves its identity via a signed challenge-response.

Public endpoints (resolver-info, changelog) MAY be unauthenticated. Resolution endpoints SHOULD require authentication to enable encrypted field decryption and to comply with data access policies.


### 13. Scan Integration and Display Model

#### 13.1 Changelog Consumption

Canton Scan (and third-party block explorers) integrate with CPRP by subscribing to resolver changelog endpoints. Scan SHOULD poll changelogs from all featured resolvers and index the results for display.

#### 13.2 Three-Layer Display Model

Following the CNS 2.0 design, CPRP defines three layers of party identity display. Applications SHOULD implement all three layers for consistent user experience:

##### Layer 1: Display Name (inline)

The display name is shown wherever a party is referenced inline — transaction lists, counterparty fields, validator listings. This is the most compact representation.

Computation: Use the `cns-2.0/name` claim from the highest-priority issuer as configured in the app's Resolution Strategy.

Format: `<display_name>` with a verification status indicator.

| Status | Display |
|--------|---------|
| VERIFIED | `ACME Corp.` + verification badge (e.g., checkmark icon) |
| PARTIAL | `ACME Corp.` + partial verification indicator (e.g., yellow badge) |
| UNVERIFIED | `acme.unverified.cns` (retain the .unverified prefix) |
| COLLISION | `ACME Corp.` + collision warning indicator |
| REVOKED | `ACME Corp.` + revoked indicator (e.g., strikethrough or red badge) |

Fallback chain: If no `cns-2.0/name` claim is available: use the address book display name → use the raw FQPN → use the Party ID prefix (first 20 chars) + `...`.

Applications MUST include a copy button to copy the full Party ID to clipboard (consistent with CNS 1.0 behavior).

##### Layer 2: Hover Profile (tooltip/popover)

When a user hovers over or taps a display name, a compact profile card is shown with:

1. Display name and verification status badge.
2. ASCII form (e.g., `dns:acme.com:treasury`).
3. Issuer summary: "Verified by: DNS (SV-confirmed), GLEIF (vLEI)".
4. Key metadata: jurisdiction, entity type, LEI (if available).
5. Link to full profile page.

##### Layer 3: Full Profile Page (hosted on Scan)

A dedicated page showing complete party identity information:

1. Display name and all registered names across resolvers.
2. Verification status with full trust path visualization.
3. Profile metadata (legal name, jurisdiction, entity type, capabilities, website, email).
4. Endpoint directory (public endpoints only; encrypted endpoints are not shown).
5. Cross-chain identities with verification status for each.
6. Credential list with issuer, tier, status, and timestamps for each credential.
7. Resolver coverage showing which resolvers have records for this party.
8. Delegation tree showing subnames and their delegation chain.
9. History of credential changes (from changelog data).

#### 13.3 Display Name Computation

Scan computes display names following the algorithm in Section 3.4, using a Scan-specific Resolution Strategy. The RECOMMENDED Scan strategy is `PERMISSIVE_DEFAULT`, allowing all featured resolvers to contribute names while flagging collisions for user review.


### 14. The .canton Namespace

#### 14.1 Overview

The `.canton` extension is a human-readable namespace for Canton Network parties. The WG has asked: "How to standardize what this means?" This section defines the semantics and governance of the `.canton` namespace within CPRP.

#### 14.2 Definition

A `.canton` name is a human-readable identifier of the form `<name>.canton` that maps to a Canton Party ID. Examples: `acme-bank.canton`, `goldmansachs.canton`, `dtcc.canton`.

The `.canton` namespace is NOT a DNS domain (there is no `.canton` TLD in the DNS root). It is a Canton-native naming convention managed through the CPRP resolver ecosystem.

#### 14.3 Semantics

A `.canton` name carries the following semantics:

1. Uniqueness: Within a single resolver, a `.canton` name MUST map to exactly one Party ID. Across resolvers, collisions are handled per Section 8.
2. Network-scoped: A `.canton` name is scoped to a specific Canton network. `acme-bank.canton` on MainNet is distinct from `acme-bank.canton` on TestNet.
3. Verification-independent: A `.canton` name can be unverified (self-registered), partially verified, or fully verified. The verification status is determined by the trust model (Section 5), not by the `.canton` suffix itself.
4. Resolver-agnostic: Multiple resolvers MAY offer `.canton` names. Freename might offer `acme-bank.canton` while another resolver offers the same name. Collision management (Section 8) handles this.

#### 14.4 Registration

`.canton` names can be registered through any resolver that supports the `.canton` namespace. There is no single authority for `.canton` names. The trust tier of the registering resolver determines the trust level of the name:

- A `.canton` name registered through a T1 process (SV-verified DNS claim) carries the highest trust.
- A `.canton` name registered through a T3 featured resolver (e.g., Freename) carries community-vetted trust.
- A `.canton` name self-registered via CNS 1.0 remains `.unverified.cns` until verified through CPRP.

#### 14.5 Relationship to CNS 1.0

Existing CNS 1.0 names (`name.unverified.cns`) are preserved. CPRP does not modify CNS 1.0. However, a party with a CNS 1.0 name can upgrade to a verified `.canton` name by:

1. Registering a `.canton` name with a CPRP resolver.
2. Completing the resolver's verification process.
3. Optionally retaining the CNS 1.0 name as a legacy alias.

#### 14.6 Future Governance

The Canton Foundation MAY, via a future CIP, establish a governance process for reserved `.canton` names (e.g., protecting names of systemically important institutions). This is out of scope for the current CIP.


### 15. Extensibility: Asset and API Naming

#### 15.1 Overview

Wayne Collier noted in the WG that the scope should include "not just identity" but also assets and APIs. CPRP is designed to be extensible to these use cases while keeping the current CIP focused on party identity.

#### 15.2 Extension Points

CPRP provides the following extension points for future asset and API naming CIPs:

Asset naming: The FQPN format `<resolver>:<namespace>:<name>` can accommodate asset identifiers by introducing asset-specific resolvers. For example: `token-registry:canton:acme-bond-2026` could resolve to an asset contract ID rather than a Party ID. A future CIP would define:
- An asset-specific variant of the `resolve` method.
- Asset metadata claim keys (e.g., `cprp-asset/isin`, `cprp-asset/cusip`, `cprp-asset/token-standard`).
- Asset-specific trust requirements.

API naming: The `cprp/endpoint:*` claim keys already provide basic API discovery. A future CIP could extend this with:
- Service-level metadata (capabilities, version, SLA).
- API schemas (OpenAPI references).
- Service health and status monitoring.

#### 15.3 Design Principle

Future naming CIPs SHOULD reuse the CPRP resolver interface, resolution strategy framework, and trust model wherever applicable. This ensures a consistent resolution experience across party, asset, and API naming.


## Rationale

### Why Multi-Resolver

A single naming authority would be simpler but fails Canton's institutional reality. Financial institutions operate across jurisdictions, each with different identity regimes. A European bank may have a vLEI from GLEIF, a DNS domain, and a local regulator-issued identifier. A Chinese institution may have none of these but have a CFCA-issued identity. The multi-resolver architecture accommodates this diversity without requiring global consensus on a single identity standard.

### Why App-Driven Trust

Centralizing trust policy would require the Canton Foundation to define a global verification standard — a governance burden the WG explicitly wants to avoid. By pushing trust decisions to applications, CPRP keeps the protocol neutral while allowing each application to enforce the trust level appropriate for its use case and regulatory environment.

### Why Full Post-Quantum Encryption

Canton's institutional users hold assets with multi-decade time horizons. U.S. Treasury securities tokenized on Canton may have 30-year maturities. Metadata about these assets — counterparty relationships, settlement instructions, compliance details — must remain confidential for the full asset lifecycle. ML-KEM-768 (Kyber-768) provides NIST-standardized post-quantum security, ensuring that encrypted fields remain secure even against future quantum adversaries.

### Why DNS Fallback

DNS provides a universally accessible, highly available, and well-understood distribution channel. By allowing CPRP metadata to be optionally published via DNS, the protocol gains resilience against Canton-specific outages and lowers the barrier for entities that already manage DNS infrastructure. This does not replace on-ledger credentials as the source of truth — it provides a cache layer that institutional participants understand and trust.

### Why Collision Management in the Core Spec

In a multi-resolver system, collisions are inevitable. Leaving collision handling undefined would result in inconsistent behavior across applications and potential security issues (an attacker could register a name on a low-trust resolver to confuse applications querying a high-trust resolver). By making collision detection, reporting, and arbitration part of the core specification, CPRP ensures that all implementations handle this case consistently.

### Why Cross-Chain in the Core Spec

Canton's participants do not operate exclusively on Canton. Cross-chain identity is not an edge case — it is the norm for the institutional audience. Making it an optional extension would lead to fragmented implementations. By specifying cross-chain identity claims in the core protocol, CPRP ensures that every resolver and every application handles cross-chain identities consistently.

### Why Network Discrimination

TestNet and DevNet names must not be confusable with MainNet names. This is a security requirement identified by Simon Meier. Without network discrimination, an attacker could register `goldmansachs.canton` on TestNet and exploit applications that do not distinguish networks. The network prefix in FQPNs and the `cprp/network` claim key make network boundaries explicit and enforceable.

### Why Address Book Integration

Local address books are how institutions manage counterparty information today. Simon Meier explicitly noted the need to "support local address books." Ignoring this requirement would make CPRP incompatible with existing institutional workflows. By modeling address books as a special resolver type, CPRP integrates them naturally into the resolution framework without requiring architectural exceptions.


## Backwards Compatibility

CPRP is a new protocol and does not modify existing Canton functionality. It is fully backward compatible:

- CNS 1.0: Existing `name.unverified.cns` names continue to work. CPRP resolvers MAY index CNS 1.0 names as a data source. Parties can upgrade to verified `.canton` names while retaining CNS 1.0 names.
- CN Credentials: CPRP uses the standard Daml Credential interface. No changes to the interface are required.
- Scan: CPRP integration is additive. Scan can adopt resolver data incrementally without breaking existing functionality.
- Applications: CPRP adoption is opt-in. Applications that do not implement a Resolution Strategy continue to function as before.
- DSO/SV names: Existing automatic names (`dso.cns`, `name.sv.cns`) resolved by `DsoAnsResolver` continue to work independently of CPRP.


## Security Considerations

### Query Privacy

Resolution queries reveal counterparty interest. CPRP mitigates this through:
- Mandatory TLS 1.3 for all resolution traffic.
- Batch resolve endpoint to obscure individual name lookups.
- Local caching to reduce query frequency.
- Optional mTLS for mutual authentication.

### Name Squatting

Without controls, an attacker could register names resembling legitimate institutions on permissionless resolvers. CPRP mitigates this through:
- The trust tier system: permissionless resolver credentials are T4, which institutional trust policies will reject.
- The collision management system: if a legitimate institution registers the same name on a featured resolver, the collision is detected and the higher-trust registration prevails.
- Governance-based collision arbitration for disputed names across featured resolvers.

### Network Confusion Attacks

An attacker could register identical names on TestNet and MainNet to cause confusion. CPRP mitigates this through:
- The network discriminator in FQPNs (Section 1.1).
- The `cprp/network` claim in all credentials.
- Resolution engines MUST reject cross-network results.

### Delegation Chain Attacks

An attacker could create a fraudulent delegation chain to impersonate a legitimate subname. CPRP mitigates this through:
- Mandatory delegation chain verification (Section 2.7.3).
- Delegation credentials require both parent and child signatures.
- Delegation scope limits prevent unauthorized sub-delegation.

### Encrypted Field Security

The post-quantum encryption scheme is designed for long-term confidentiality:
- ML-KEM-768 provides IND-CCA2 security against both classical and quantum adversaries.
- AES-256-GCM provides authenticated encryption, preventing tampering.
- Per-recipient keys ensure that compromise of one recipient does not affect others.
- HKDF with context-binding (field name, sender, recipient) prevents key reuse across fields.

### Credential Replay

Archived credentials could theoretically be replayed. CPRP mitigates this by:
- Requiring resolvers to verify on-ledger contract state (active vs. archived) at query time.
- Including `valid_from` and `valid_until` in all resolution records.
- Requiring the changelog to reflect revocations within 60 seconds.

### Denial of Service

Resolution services are potential DoS targets. Implementors SHOULD:
- Rate limit resolution queries (error code 1006).
- Deploy behind standard DDoS mitigation infrastructure.
- Support graceful degradation to DNS fallback mode when the primary service is under attack.


## Appendix A: Use Case Flows

This appendix presents eight end-to-end flows demonstrating how CPRP solves the concrete problems identified by the Canton Identity and Metadata Working Group. Flows 1–3 correspond directly to Simon Meier's three required CIP outcomes (P1, P2, P3). Flows 4–8 demonstrate institutional, integration, and edge-case scenarios.

All JSON payloads, credential structures, and API calls in this appendix use the interfaces and schemas defined in the specification above. Party IDs, contract IDs, and timestamps are illustrative.


### Flow 1: Removing the ".unverified" Prefix (P1 — Trustworthy Names)

Scenario: Goldman Sachs currently appears as `goldmansachs.unverified.cns` across Canton applications. They want to appear as `Goldman Sachs ✓` with full verification. This is the exact question Yury Korzun raised in the WG: "How do we determine that a given issuer is reliable? How can we remove the '.unverified' prefix?"

Actors:
- Goldman Sachs IT team (party administrator)
- Goldman Sachs DNS administrators
- Canton Super Validator nodes (SV1, SV2, ... SV13)
- DSO party
- Scan explorer
- A Canton trading application ("TradeApp")

#### Step 1: Goldman Sachs publishes a DNS TXT record

Goldman Sachs DNS administrators add a DNSSEC-signed TXT record to their authoritative zone:

```
_canton.goldmansachs.com.  300  IN  TXT  "party=party::goldman1::1220abcd...ef01"
```

They also ensure DNSSEC is enabled on the `goldmansachs.com` zone with a valid chain of trust to the root.

#### Step 2: SV nodes verify the DNS claim

Each Super Validator node independently:

1. Queries `_canton.goldmansachs.com` TXT records via a DNSSEC-validating resolver.
2. Validates the DNSSEC chain (DS → DNSKEY → RRSIG → TXT).
3. Extracts the Party ID from the TXT record value.
4. Confirms the Party ID exists on the Canton ledger.

When a supermajority (e.g., 9 of 13) of SV nodes have verified the claim, the DSO party publishes a `CnsDnsClaim` credential on-ledger:

```
publisher: party::dso::1220ffff...0001
subject:   party::goldman1::1220abcd...ef01
claims: {
  "cprp/resolver":              "dns",
  "cprp/namespace":             "goldmansachs.com",
  "cprp/name":                  "default",
  "cprp/fqpn":                  "mainnet/dns:goldmansachs.com:default",
  "cprp/network":               "mainnet",
  "cprp/trust-anchor":          "T1",
  "cprp/verification-method":   "dns-txt",
  "cprp/verification-timestamp": "2026-03-15T14:30:00Z",
  "cns-2.0/name":               "Goldman Sachs",
  "cns-2.0/website":            "https://www.goldmansachs.com",
  "cns-2.0/lei":                "784F5XWPLTWKTBV3E584"
}
validUntil: 2027-03-15T14:30:00Z
```

This credential is a T1 attestation — the highest trust level — because the DSO party (backed by SV consensus) is the publisher.

#### Step 3: The DNS resolver indexes the credential

The DNS resolver (a CPRP resolver implementing the interface in Section 2) detects the new credential via the Scan changelog and indexes it. The resolver now responds to queries:

Request:
```json
{
  "method": "cprp.resolve",
  "params": {
    "namespace": "goldmansachs.com",
    "name":      "default"
  }
}
```

Response:
```json
{
  "result": {
    "resolver_id":  "dns",
    "network":      "mainnet",
    "namespace":    "goldmansachs.com",
    "name":         "default",
    "party_id":     "party::goldman1::1220abcd...ef01",
    "credentials": [{
      "contract_id":  "00abcd1234...cred01",
      "publisher":    "party::dso::1220ffff...0001",
      "claim_key":    "cns-2.0/name",
      "claim_value":  "Goldman Sachs",
      "ledger_effective_time": "2026-03-15T14:30:00Z"
    }],
    "metadata": {
      "cns-2.0/name":    "Goldman Sachs",
      "cns-2.0/website": "https://www.goldmansachs.com",
      "cns-2.0/lei":     "784F5XWPLTWKTBV3E584"
    },
    "confidence":   "HIGH",
    "valid_from":   "2026-03-15T14:30:00Z",
    "valid_until":  "2027-03-15T14:30:00Z",
    "record_hash":  "e3b0c44298fc1c14...",
    "delegated_by": null
  }
}
```

#### Step 4: TradeApp resolves the party using its Resolution Strategy

TradeApp has the `INSTITUTIONAL_DEFAULT` strategy (Section 3.6). When a user enters "Goldman Sachs" or the app needs to display a counterparty, the resolution engine executes:

```
1. QUERY dns resolver for (goldmansachs.com, default)    → result A (weight 1.0)
2. QUERY vlei resolver for (784F5XWPLTWKTBV3E584, default) → result B (weight 0.9)
3. QUERY cn-cred resolver for any matching credentials    → result C (weight 0.8)
4. CHECK org-directory address book                       → no match

Results A, B, C all map to party::goldman1::1220abcd...ef01 → no collision.
```

The composition algorithm (Section 3.4) runs:

```
grouped_by_party: { "party::goldman1::1220abcd...ef01": [A, B, C] }
collision: false

merged_metadata:
  "cns-2.0/name"    → "Goldman Sachs"     (from A, highest weight 1.0)
  "cns-2.0/lei"     → "784F5XWPLTWKTBV3E584" (from A)
  "cns-2.0/website" → "https://www.goldmansachs.com" (from A)

display_name: "Goldman Sachs" (highest_weight rule → dns resolver → cns-2.0/name)
```

The trust evaluation algorithm (Section 5.3) runs:

```
credentials: [CnsDnsClaim from DSO (T1), vLEI credential (T2)]
has_revocation: false
active_resolvers: 2 (dns, vlei)     → min_resolvers=1 ✓
total_weight: 1.0 + 0.9 = 1.9      → min_total_weight=0.9 ✓
required_credential_types: ["dns-verified"] → dns result present ✓

→ VERIFIED
```

#### Step 5: TradeApp displays the verified identity

Before CPRP: `goldmansachs.unverified.cns`

After CPRP:

| Display Layer | What the User Sees |
|---------------|-------------------|
| Layer 1 (inline) | `Goldman Sachs` ✓ (green verification badge) |
| Layer 2 (hover) | Goldman Sachs ✓ · `dns:goldmansachs.com:default` · Verified by: DNS (SV-confirmed), GLEIF (vLEI) · LEI: 784F5XWPLTWKTBV3E584 · [View full profile →] |
| Layer 3 (Scan page) | Full profile: legal name, website, LEI, jurisdiction, all credentials with timestamps, trust path visualization, resolver coverage |

The `.unverified` prefix is gone. The verification badge is backed by a T1 credential (SV-verified DNS) and a T2 credential (GLEIF vLEI), satisfying institutional trust policies.

#### Step 6: Ongoing verification

The DNS resolver re-checks the TXT record periodically (RECOMMENDED: every 7 days; DNS TXT records change infrequently and aggressive polling provides minimal security benefit). If Goldman Sachs removes the TXT record or DNSSEC validation fails:

1. The DNS resolver publishes a changelog entry: `{ "type": "revoked", ... }`.
2. SV nodes archive the `CnsDnsClaim` credential on-ledger.
3. TradeApp's next resolution returns `status: REVOKED`.
4. Display reverts to `Goldman Sachs` ✗ (revoked badge) or falls back to `goldmansachs.unverified.cns` depending on the app's display policy.


### Flow 2: Discovering a CIP-56 Token Admin Endpoint (P2 — API Discovery)

Scenario: "SettleApp" needs to find the off-ledger API endpoint for the token admin of a Canton-native bond token issued by DTCC. This is Simon's P2 problem: "How to discover the off-ledger API endpoints for CIP-56 token admins."

Actors:
- DTCC (token issuer, party administrator for a Canton-native bond token)
- SettleApp (a settlement application needing to call the token admin API)
- Freename resolver (featured T3 resolver where DTCC registered `dtcc.canton`)

#### Step 1: DTCC publishes endpoint credentials

DTCC registers its party with the Freename resolver and publishes endpoint metadata as CN Credentials:

```
publisher: party::freename::1220cccc...0001
subject:   party::dtcc1::1220dddd...0001
claims: {
  "cprp/resolver":              "freename",
  "cprp/namespace":             "dtcc.canton",
  "cprp/name":                  "default",
  "cprp/fqpn":                  "mainnet/freename:dtcc.canton:default",
  "cprp/network":               "mainnet",
  "cprp/trust-anchor":          "T3",
  "cns-2.0/name":               "DTCC",
  "cns-2.0/lei":                "549300HMQBIKME8LIL78",
  "cprp/endpoint:api":          "https://api.dtcc.com/canton/v1",
  "cprp/endpoint:token-admin":  "https://api.dtcc.com/canton/v1/token-admin",
  "cprp/endpoint:settlement":   "https://api.dtcc.com/canton/v1/settlement"
}
validUntil: 2027-01-01T00:00:00Z
```

DTCC also publishes a self-attested (T4) credential with additional detail:

```
publisher: party::dtcc1::1220dddd...0001
subject:   party::dtcc1::1220dddd...0001
claims: {
  "cprp/trust-anchor":          "T4",
  "cprp/endpoint:token-admin":  "https://api.dtcc.com/canton/v1/token-admin",
  "cprp/entity-type":           "custodian",
  "cprp/capability":            "custody,settlement,issuance",
  "cprp/jurisdiction":          "US"
}
```

#### Step 2: SettleApp resolves DTCC

SettleApp's Resolution Strategy includes the Freename resolver. The resolution engine queries:

Request:
```json
{
  "method": "cprp.resolve",
  "params": {
    "namespace": "dtcc.canton",
    "name":      "default"
  }
}
```

Response:
```json
{
  "result": {
    "resolver_id":  "freename",
    "network":      "mainnet",
    "namespace":    "dtcc.canton",
    "name":         "default",
    "party_id":     "party::dtcc1::1220dddd...0001",
    "credentials":  [
      {
        "contract_id":  "00ffaa1234...cred01",
        "publisher":    "party::freename::1220cccc...0001",
        "claim_key":    "cprp/endpoint:token-admin",
        "claim_value":  "https://api.dtcc.com/canton/v1/token-admin",
        "ledger_effective_time": "2026-03-10T09:00:00Z"
      }
    ],
    "metadata": {
      "cns-2.0/name":               "DTCC",
      "cns-2.0/lei":                "549300HMQBIKME8LIL78",
      "cprp/endpoint:api":          "https://api.dtcc.com/canton/v1",
      "cprp/endpoint:token-admin":  "https://api.dtcc.com/canton/v1/token-admin",
      "cprp/endpoint:settlement":   "https://api.dtcc.com/canton/v1/settlement",
      "cprp/entity-type":           "custodian",
      "cprp/capability":            "custody,settlement,issuance",
      "cprp/jurisdiction":          "US"
    },
    "confidence":   "HIGH",
    "valid_from":   "2026-03-10T09:00:00Z",
    "valid_until":  "2027-01-01T00:00:00Z",
    "record_hash":  "a1b2c3d4...",
    "delegated_by": null
  }
}
```

#### Step 3: SettleApp extracts the endpoint

After composition and trust evaluation, the `ComposedResolutionResult` includes:

```json
{
  "display_name": "DTCC",
  "party_id":     "party::dtcc1::1220dddd...0001",
  "status":       "VERIFIED",
  "endpoints": {
    "api":          "https://api.dtcc.com/canton/v1",
    "token-admin":  "https://api.dtcc.com/canton/v1/token-admin",
    "settlement":   "https://api.dtcc.com/canton/v1/settlement"
  },
  "trust_path": [
    {
      "resolver_id":     "freename",
      "issuer":          "party::freename::1220cccc...0001",
      "issuer_tier":     "T3",
      "credential_type": "featured-resolver",
      "status":          "active",
      "verified_at":     "2026-03-10T09:00:00Z"
    }
  ]
}
```

SettleApp programmatically extracts the `token-admin` endpoint:

```python
result = cprp_client.resolve("freename", "dtcc.canton", "default")
token_admin_url = result.endpoints["token-admin"]
# → "https://api.dtcc.com/canton/v1/token-admin"

# SettleApp can now call the CIP-56 token admin API directly:
response = requests.post(
    f"{token_admin_url}/transfer",
    json={"from": sender_party, "to": receiver_party, "amount": "1000000", "asset": "US-TBOND-2056"},
    cert=settle_app_mtls_cert
)
```

#### Step 4: What happens when DTCC rotates its endpoint

DTCC migrates its API to a new infrastructure. They update the credential:

1. DTCC asks Freename to update the `cprp/endpoint:token-admin` claim to `https://api-v2.dtcc.com/canton/v1/token-admin`.
2. Freename publishes a new credential and archives the previous one.
3. The changelog reflects the update: `{ "type": "updated", "namespace": "dtcc.canton", "name": "default", ... }`.
4. SettleApp's next resolution (or cache refresh) picks up the new endpoint.
5. No downtime — SettleApp follows the new URL on its next call.

Without CPRP: SettleApp would need a manual configuration update, a bilateral communication channel with DTCC, or a hard-coded endpoint that breaks on migration.


### Flow 3: Publishing and Displaying Party Profiles (P3 — Self-Published Profiles)

Scenario: ACME Asset Management wants to publish a rich profile that is displayed uniformly across all Canton apps — Scan explorer, trading platforms, fund administration tools. This is Simon's P3: "How to enable parties to self-publish profile information that can be displayed uniformly across apps."

Actors:
- ACME Asset Management (the party publishing its profile)
- DNS resolver (verifies ACME's domain)
- Freename resolver (provides `.canton` name)
- Scan explorer
- Three Canton applications: TradingApp, FundAdminApp, CustodyApp

#### Step 1: ACME publishes profile credentials

ACME registers with both the DNS resolver (via DNS verification) and Freename (for a `.canton` name). Then ACME self-publishes (T4) its profile information:

```
publisher: party::acme-am::1220aaaa...0001
subject:   party::acme-am::1220aaaa...0001
claims: {
  "cprp/trust-anchor":          "T4",
  "cprp/network":               "mainnet",
  "cns-2.0/name":               "ACME Asset Management",
  "cns-2.0/email":              "canton-ops@acme-am.com",
  "cns-2.0/lei":                "529900EXAMPLE00LEI01",
  "cns-2.0/avatar":             "https://acme-am.com/logo-256.png",
  "cns-2.0/website":            "https://www.acme-am.com",
  "cprp/entity-type":           "asset-manager",
  "cprp/jurisdiction":          "CH",
  "cprp/capability":            "trading,issuance,lending",
  "cprp/endpoint:api":          "https://api.acme-am.com/canton/v1",
  "cprp/endpoint:settlement":   "https://api.acme-am.com/canton/v1/settle"
}
```

Note: The profile claims use the `cns-2.0/` namespace (defined by the CN Credentials standard) for interoperability. Any Canton app that understands CN Credentials can render these claims, even without CPRP-specific code.

#### Step 2: DNS and Freename resolvers provide verified names

The DNS resolver has a T1 credential from SV consensus:
```
publisher: party::dso::1220ffff...0001
subject:   party::acme-am::1220aaaa...0001
claims: {
  "cprp/resolver": "dns", "cprp/namespace": "acme-am.com", "cprp/name": "default",
  "cprp/trust-anchor": "T1", "cns-2.0/name": "ACME Asset Management",
  "cprp/network": "mainnet"
}
```

Freename has a T3 credential:
```
publisher: party::freename::1220cccc...0001
subject:   party::acme-am::1220aaaa...0001
claims: {
  "cprp/resolver": "freename", "cprp/namespace": "acme-am.canton",
  "cprp/name": "default", "cprp/trust-anchor": "T3",
  "cns-2.0/name": "ACME Asset Management", "cprp/network": "mainnet"
}
```

#### Step 3: Composition produces a unified profile

When any app resolves ACME, the composition algorithm merges data from all three sources (DNS T1, Freename T3, self-attested T4):

```json
{
  "display_name":   "ACME Asset Management",
  "ascii_form":     "dns:acme-am.com:default",
  "party_id":       "party::acme-am::1220aaaa...0001",
  "network":        "mainnet",
  "status":         "VERIFIED",

  "trust_path": [
    { "resolver_id": "dns",      "issuer_tier": "T1", "status": "active" },
    { "resolver_id": "freename", "issuer_tier": "T3", "status": "active" }
  ],

  "metadata": {
    "cns-2.0/name":     "ACME Asset Management",
    "cns-2.0/email":    "canton-ops@acme-am.com",
    "cns-2.0/lei":      "529900EXAMPLE00LEI01",
    "cns-2.0/avatar":   "https://acme-am.com/logo-256.png",
    "cns-2.0/website":  "https://www.acme-am.com"
  },

  "endpoints": {
    "api":        "https://api.acme-am.com/canton/v1",
    "settlement": "https://api.acme-am.com/canton/v1/settle"
  },

  "profile": {
    "entity_type":  "asset-manager",
    "jurisdiction": "CH",
    "capabilities": ["trading", "issuance", "lending"]
  },

  "collision": false,
  "resolvers_consulted": ["dns", "freename"]
}
```

#### Step 4: Three-layer display across all apps

Every Canton application that implements CPRP renders the same party consistently.

Layer 1 — Inline display name (shown in transaction lists, counterparty fields):

TradingApp: `[ ACME Asset Management ✓ ]` — green badge, clickable
FundAdminApp: `[ ACME Asset Management ✓ ]` — identical
CustodyApp: `[ ACME Asset Management ✓ ]` — identical

Layer 2 — Hover profile (tooltip on hover/tap):

```
┌─────────────────────────────────────────────┐
│  🏢  ACME Asset Management          ✓      │
│  dns:acme-am.com:default                    │
│                                             │
│  Verified by: DNS (SV-confirmed), Freename  │
│  LEI: 529900EXAMPLE00LEI01                  │
│  Jurisdiction: Switzerland 🇨🇭               │
│  Type: Asset Manager                        │
│                                             │
│  [View full profile →]                      │
└─────────────────────────────────────────────┘
```

Layer 3 — Full profile page on Scan (or in-app):

```
═══════════════════════════════════════════════
  ACME Asset Management                    ✓
  Party ID: party::acme-am::1220aaaa...0001
═══════════════════════════════════════════════

  NAMES
  ├── dns:acme-am.com:default          (T1, SV-verified)
  └── freename:acme-am.canton:default  (T3, featured resolver)

  PROFILE
  │  Legal name:    ACME Asset Management
  │  LEI:           529900EXAMPLE00LEI01
  │  Website:       https://www.acme-am.com
  │  Email:         canton-ops@acme-am.com
  │  Jurisdiction:  CH (Switzerland)
  │  Entity type:   Asset Manager
  │  Capabilities:  Trading, Issuance, Lending

  ENDPOINTS
  │  API:           https://api.acme-am.com/canton/v1
  │  Settlement:    https://api.acme-am.com/canton/v1/settle

  TRUST PATH
  │  ✓ DNS resolver     T1  DSO/SV consensus    Active  2026-03-15
  │  ✓ Freename         T3  Featured resolver    Active  2026-03-10

  CREDENTIALS (3)
  │  #00abc...01  DSO → ACME  dns-txt verification      Active
  │  #00abc...02  Freename → ACME  featured resolver     Active
  │  #00abc...03  ACME → ACME  self-attested profile     Active

  HISTORY
  │  2026-03-15  DNS credential created (SV consensus)
  │  2026-03-10  Freename credential created
  │  2026-03-10  Self-attested profile published
═══════════════════════════════════════════════
```

#### Why this solves P3

The key insight is separation of concerns: ACME publishes its profile data once, as CN Credentials with `cns-2.0/*` claim keys. The CPRP composition layer then merges profile data with verification data from multiple resolvers. Every app gets the same composed result. No app needs to implement its own profile rendering logic beyond the three display layers — and even those are standardized.

If ACME updates its email address, it publishes a new self-attested credential. The old one is archived. Every app sees the update on its next resolution or cache refresh. No bilateral notification channel required.


### Flow 4: Cross-Institution Repo Trade with Encrypted Settlement Instructions

Scenario: JPMorgan and Barclays execute a repo trade on Canton. They need to resolve each other's identity, exchange encrypted settlement instructions (visible only to each other), and execute settlement. This demonstrates the institutional use case combining P1 (names), P2 (endpoints), and encrypted fields (Section 6).

#### Step 1: Mutual resolution

JPMorgan's TradeApp resolves Barclays:

```json
{
  "method": "cprp.resolve",
  "params": { "namespace": "barclays.com", "name": "fixed-income" }
}
```

Result: `party::barclays-fi::1220bbbb...0001`, status VERIFIED (T1 DNS + T2 vLEI).

Barclays' TradeApp resolves JPMorgan:

```json
{
  "method": "cprp.resolve",
  "params": { "namespace": "jpmorgan.com", "name": "repo-desk" }
}
```

Result: `party::jpm-repo::1220cccc...0001`, status VERIFIED (T1 DNS + T2 vLEI).

#### Step 2: Encrypted settlement instruction exchange

JPMorgan publishes settlement instructions encrypted for Barclays only, using the encrypted field mechanism (Section 6):

1. JPMorgan retrieves Barclays' Kyber-768 public key from their `cprp/enc-key` credential.
2. JPMorgan encrypts settlement details:

```json
{
  "version": 1,
  "field_name": "settlement-instructions",
  "enc_alg": "AES-256-GCM",
  "kem_alg": "ML-KEM-768",
  "kdf_alg": "HKDF-SHA256",
  "kdf_salt": "CPRP-v1-enc-field",
  "recipients": {
    "mainnet/dns:barclays.com:fixed-income": {
      "kem_ct": "base64...",
      "iv":     "base64...",
      "ct":     "base64(encrypted JSON: { 'nostro_account': 'GB29NWBK60161331926819', 'bic': 'CHASGB2L', 'settlement_date': '2026-03-17T16:00:00Z', 'collateral_type': 'US-TBOND' })",
      "tag":    "base64..."
    }
  }
}
```

3. The encrypted envelope is published as a credential claim: `cprp/enc-field:settlement-instructions`.

#### Step 3: Barclays decrypts and settles

Barclays' settlement system:

1. Resolves JPMorgan → extracts `cprp/enc-field:settlement-instructions`.
2. Decrypts using its Kyber-768 private key (Section 6.5).
3. Obtains the plaintext settlement instructions.
4. Calls JPMorgan's settlement endpoint (discovered via `cprp/endpoint:settlement`).
5. Executes the repo trade on-ledger.

No other party on the network — not even the SV nodes — can read the settlement instructions. The encrypted field is visible on-ledger as an opaque blob; only Barclays has the key.


### Flow 5: Subname Delegation (Organization Hierarchy)

Scenario: ACME Corp (`acme.com`) has three internal desks: Treasury, Trading, and Compliance. Each desk has its own Canton party. ACME wants to delegate subnames so counterparties can address `treasury.acme.com`, `trading.acme.com`, and `compliance.acme.com`.

#### Step 1: ACME claims its domain

ACME completes DNS verification (as in Flow 1). The DSO publishes a T1 credential:
```
dns:acme.com:default → party::acme-hq::1220aaaa...0001  (T1, VERIFIED)
```

#### Step 2: ACME delegates subnames

ACME creates delegation credentials for each desk:

```
publisher: party::acme-hq::1220aaaa...0001
subject:   party::acme-treasury::1220aaaa...0002
claims: {
  "cprp/delegation":       "true",
  "cprp/parent-fqpn":      "mainnet/dns:acme.com:default",
  "cprp/delegated-name":   "treasury",
  "cprp/delegation-scope": "name-only",
  "cprp/network":          "mainnet"
}
```

This creates the `NameDelegation` Daml contract (Section 11.3), signed by both ACME HQ and the Treasury desk party.

ACME also publishes DNS TXT records for SV verification:

```
_canton-delegate.treasury.acme.com TXT "party=party::acme-treasury::1220aaaa...0002&delegated_by=acme.com"
_canton-delegate.trading.acme.com  TXT "party=party::acme-trading::1220aaaa...0003&delegated_by=acme.com"
```

#### Step 3: Counterparties resolve subnames

A counterparty resolves `treasury.acme.com`:

```json
{
  "method": "cprp.resolve",
  "params": { "namespace": "acme.com", "name": "treasury" }
}
```

Response includes `delegated_by: "mainnet/dns:acme.com:default"`. The resolution engine verifies the delegation chain (Section 2.7.3):

```
treasury.acme.com → delegated by acme.com → acme.com has T1 DNS credential → chain valid ✓
```

Result:
```json
{
  "display_name":     "ACME Corp — Treasury",
  "party_id":         "party::acme-treasury::1220aaaa...0002",
  "status":           "VERIFIED",
  "delegation_chain": [
    "mainnet/dns:acme.com:default",
    "mainnet/dns:acme.com:treasury"
  ]
}
```

The trust tier of the subname inherits from the parent's verification. The delegation chain is visible in the trust path, allowing counterparties to confirm the organizational relationship.


### Flow 6: Collision Detection and Resolution

Scenario: Two resolvers return different parties for the name "acme-bank." Freename maps it to Party A (a legitimate fintech called ACME Bank), while a permissionless resolver maps it to Party B (an unrelated entity that registered the same name). This is the multi-resolver collision case.

#### Step 1: Parallel resolution returns conflicting results

TradingApp queries with `resolution_mode: parallel`:

```
DNS resolver:          no result for "acme-bank"
Freename resolver:     acme-bank.canton → party::acme-fintech::1220aaaa...0001  (T3, weight 0.8)
Permissionless resolver: acme-bank → party::imposter::1220xxxx...9999            (T4, weight 0.3)
```

#### Step 2: Composition detects the collision

```
GROUP by party_id:
  party::acme-fintech::1220aaaa...0001  → [Freename result, weight 0.8]
  party::imposter::1220xxxx...9999      → [Permissionless result, weight 0.3]

→ collision = TRUE
```

#### Step 3a: Strict mode (institutional app)

TradingApp has `reject_if_collision: true`:

```json
{
  "display_name":   null,
  "party_id":       null,
  "status":         "COLLISION",
  "collision":      true,
  "collision_details": [
    { "party_id": "party::acme-fintech::...", "resolver_id": "freename",  "weight": 0.8, "confidence": "HIGH" },
    { "party_id": "party::imposter::...",     "resolver_id": "anon-res",  "weight": 0.3, "confidence": "LOW" }
  ]
}
```

The app presents both options to the user: "Multiple parties found for 'acme-bank.' Please select the correct counterparty." The user selects the Freename-backed result and the app proceeds.

#### Step 3b: Permissive mode (explorer)

Scan has `reject_if_collision: false`:

```json
{
  "display_name":   "ACME Bank",
  "party_id":       "party::acme-fintech::1220aaaa...0001",
  "status":         "VERIFIED",
  "collision":      true,
  "collision_details": [...]
}
```

Scan selects the higher-weight result (Freename, 0.8 > 0.3) and displays it with a collision warning indicator. The full profile page shows the conflicting registration.

#### Step 4: Arbitration (optional)

If the collision involves two featured resolvers, either party may escalate to the Tech & Ops Committee. The committee reviews the claim and publishes a `CollisionArbitration` credential (T1), permanently resolving the dispute.


### Flow 7: Address Book Meets Network Resolver

Scenario: Citadel Securities maintains an internal counterparty directory (address book) with custom nicknames for frequent counterparties. When their app resolves a party, the address book names are preferred for display, but network verification is still required.

#### Step 1: Citadel configures their Resolution Strategy

```json
{
  "strategy_id": "citadel_internal",
  "network": "mainnet",
  "resolvers": [
    { "resolver_id": "dns",  "weight": 1.0, "required": true, "timeout_ms": 5000 },
    { "resolver_id": "vlei", "weight": 0.9, "required": false, "timeout_ms": 5000 }
  ],
  "address_books": [
    { "id": "citadel-dir", "type": "organization", "weight": 0.7, "position": "before_resolvers" }
  ],
  "resolution_mode": "parallel",
  "display_name_rule": {
    "source": "address_book_first",
    "claim_key": "cns-2.0/name"
  },
  "verification_policy": {
    "min_resolvers": 1,
    "min_total_weight": 0.9,
    "required_resolver_ids": ["dns"],
    "reject_if_collision": true
  }
}
```

Key: `display_name_rule.source` is `address_book_first`, and `required_resolver_ids` includes `dns`. This means Citadel's nicknames are shown, but DNS verification is still required for VERIFIED status.

#### Step 2: Resolution flow

Citadel's app resolves counterparty `party::goldmansachs::1220abcd...ef01`:

```
1. CHECK citadel-dir address book:
   → match: { name: "GS Prime", notes: "Primary PB relationship" }

2. QUERY dns resolver:
   → goldmansachs.com:default → party::goldmansachs::1220abcd...ef01  (T1)

3. QUERY vlei resolver:
   → 784F5XWPLTWKTBV3E584 → same party  (T2)
```

#### Step 3: Display

```
display_name_rule = address_book_first
→ address book has a match → use "GS Prime"

Trust evaluation:
→ dns required and present (T1) ✓
→ total_weight = 1.0 ✓
→ VERIFIED
```

Citadel's app shows: `GS Prime ✓`

Hover reveals: `GS Prime ✓ · Goldman Sachs (dns:goldmansachs.com) · LEI: 784F5XWPLTWKTBV3E584 · Internal notes: Primary PB relationship`

The address book provides the familiar internal name; the network resolvers provide the verification guarantee. If Citadel's address book maps a party that DNS doesn't verify, the status drops to UNVERIFIED — the address book cannot override network trust, only display names.


### Flow 8: Cross-Chain Identity Linking

Scenario: ACME Bank operates on Canton and Ethereum. They want counterparties on Canton to know their Ethereum address is `0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18` and their ENS name is `acmebank.eth`.

#### Step 1: ACME publishes cross-chain claims

ACME self-publishes (T4):

```
publisher: party::acme-bank::1220aaaa...0001
subject:   party::acme-bank::1220aaaa...0001
claims: {
  "cprp/chain-id:ethereum": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
  "cprp/chain-id:ens":      "acmebank.eth",
  "cprp/chain-id:swift":    "ACMEUS33"
}
```

At this point, these are unverified self-attestations.

#### Step 2: Cross-chain verification

ACME asks a cross-chain resolver (e.g., Freename with `cross-chain` capability) to verify:

Ethereum verification: ACME signs the message `"Canton Party ID: party::acme-bank::1220aaaa...0001"` with the private key of `0x742d35Cc...`. The resolver verifies the signature against the claimed address. Upon success, the resolver publishes a T3 credential:

```
claims: {
  "cprp/chain-id:ethereum": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
  "cprp/verification-method": "ethereum-signature",
  "cprp/trust-anchor": "T3"
}
```

ENS verification: The resolver queries ENS for `acmebank.eth`, checks if a TXT record contains ACME's Canton Party ID. Upon success:

```
claims: {
  "cprp/chain-id:ens": "acmebank.eth",
  "cprp/verification-method": "ens-txt-record",
  "cprp/trust-anchor": "T3"
}
```

SWIFT: Verification requires out-of-band confirmation. Remains T4 (self-attested) unless a regulated provider (T2) confirms the BIC.

#### Step 3: Unified cross-chain view

When counterparties resolve ACME, the composed result includes:

```json
{
  "display_name": "ACME Bank",
  "party_id":     "party::acme-bank::1220aaaa...0001",
  "status":       "VERIFIED",
  "cross_chain": {
    "ethereum": {
      "address":  "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
      "verified": true,
      "method":   "ethereum-signature",
      "tier":     "T3"
    },
    "ens": {
      "name":     "acmebank.eth",
      "verified": true,
      "method":   "ens-txt-record",
      "tier":     "T3"
    },
    "swift": {
      "bic":      "ACMEUS33",
      "verified": false,
      "method":   "self-attested",
      "tier":     "T4"
    }
  }
}
```

A Canton app that also integrates with Ethereum can now correlate identities across chains: "The entity at `0x742d35Cc...` on Ethereum is the same entity as `party::acme-bank::...` on Canton, verified by signature."


### Appendix B: Software Architecture

#### B.1 System Overview

```
+=========================================================================+
|                        CPRP SOFTWARE STACK                              |
+=========================================================================+
|                                                                         |
|  +--------------------------+    +---------------------------+          |
|  |   APPLICATION LAYER      |    |    OPERATOR TOOLS         |          |
|  |  (Canton Apps, Wallets)  |    |  (CLI, Admin Dashboard)   |          |
|  +-----------+--------------+    +------------+--------------+          |
|              |                                |                         |
|              v                                v                         |
|  +-----------------------------------------------------------+         |
|  |                    CPRP SDK                                |         |
|  |                                                            |         |
|  |  +-------------+  +-------------+  +------------------+   |         |
|  |  | Resolution  |  |   Trust     |  |    Encrypted     |   |         |
|  |  |   Client    |  |  Evaluator  |  |  Field Manager   |   |         |
|  |  +------+------+  +------+------+  +--------+---------+   |         |
|  |         |                |                   |             |         |
|  |  +------+------+  +-----+-------+  +--------+---------+  |         |
|  |  | Composition |  | Credential  |  |   Kyber-768      |  |         |
|  |  |   Engine    |  |  Verifier   |  |   KEM Module     |  |         |
|  |  +------+------+  +------+------+  +--------+---------+  |         |
|  |         |                |                   |            |         |
|  |  +------+----------------+-------------------+--------+   |         |
|  |  |              Cache Manager                         |   |         |
|  |  +----------------------------+-----------------------+   |         |
|  +----------------------------------------+------------------+         |
|                                           |                            |
|              +----------------------------+---+                        |
|              |     RESOLVER PLUGIN INTERFACE   |                       |
|              +--+--------+--------+--------+--+                        |
|                 |        |        |        |                           |
|           +-----+--+ +--+---+ +--+---+ +--+------+                   |
|           |  DNS   | | vLEI | | CN   | | Address  |                   |
|           |Resolver| |Rsolvr| | Cred | |  Book    |                   |
|           | Plugin | |Plugin| |Plugin| |  Plugin  |                   |
|           +---+----+ +--+---+ +--+---+ +--+------+                   |
|               |         |        |        |                            |
+=========================================================================+
|               |         |        |        |                            |
|  +------------+---------+--------+--------+------------------------+   |
|  |                 CANTON NETWORK LAYER                             |   |
|  |                                                                  |   |
|  |  +----------------+  +-------------+  +---------------------+   |   |
|  |  | Participant    |  |   Scan      |  | Global              |   |   |
|  |  | Node (Ledger   |  |   API       |  | Synchronizer        |   |   |
|  |  |  API, gRPC)    |  |             |  |                     |   |   |
|  |  +----------------+  +-------------+  +---------------------+   |   |
|  +------------------------------------------------------------------+  |
+=========================================================================+
```

#### B.2 Module Breakdown

CPRP SDK — The client library embedded by Canton applications.

| Module | Responsibility | Key Interfaces |
|--------|---------------|----------------|
| Resolution Client | Executes resolution queries against configured resolvers per the app's strategy | `resolve(namespace, name)`, `reverseResolve(partyId)`, `batchResolve(queries[])` |
| Composition Engine | Merges results from multiple resolvers, applies LET/weight rules, detects collisions | `compose(results[], strategy) → ComposedResolutionResult` |
| Trust Evaluator | Classifies issuers T1–T4, runs verification policy, computes VERIFIED/UNVERIFIED status | `evaluateTrust(composed, policy) → VerificationStatus` |
| Credential Verifier | Validates credential on-ledger state (active/archived/expired) via Ledger API or Scan | `verifyCredential(contractId) → CredentialStatus` |
| Encrypted Field Manager | Handles Kyber-768 key management, encryption/decryption of per-recipient fields | `encrypt(field, recipients[])`, `decrypt(envelope, recipientSk)` |
| Kyber-768 KEM Module | Post-quantum key encapsulation: keygen, encapsulate, decapsulate, HKDF derivation | `keygen()`, `encapsulate(pk)`, `decapsulate(sk, ct)` |
| Cache Manager | TTL-based caching of resolution results, refresh-ahead support, invalidation via changelog | `get(fqpn)`, `set(fqpn, result, ttl)`, `invalidate(fqpn)` |
| Resolver Plugin Interface | Abstraction layer for resolver backends; each resolver type implements this interface | `ResolverPlugin { resolve(), reverseResolve(), changelog() }` |

Resolver Plugins — Each identity source is a plugin implementing the standard interface.

| Plugin | Data Source | Trust Tier | External Dependencies |
|--------|-----------|-----------|----------------------|
| DNS Resolver Plugin | SV-verified CnsDnsClaim credentials on-ledger | T1 | DNSSEC-validating resolver |
| vLEI Resolver Plugin | GLEIF API + vLEI credential verification | T2 | GLEIF API (`api.gleif.org`) |
| CN Credential Plugin | Canton credential registry (Daml contracts on-ledger) | T3/T4 | Scan API or Ledger API |
| Address Book Plugin | Local database, LDAP, or config file | App-defined | None (local) |

Operator Tools — Utilities for resolver operators and party administrators.

| Tool | Purpose |
|------|---------|
| `cprp-cli` | Command-line tool for name registration, credential publishing, delegation management |
| `cprp-admin` | Web dashboard for resolver operators: monitoring, changelog inspection, featured status management. *Note: Not included in initial grant milestones; targeted for community contribution or post-M4 development.* |
| `cprp-keygen` | Kyber-768 key pair generation and secure key storage |

#### B.3 Dependency Graph

```
cprp-sdk
  ├── cprp-core              (types, FQPN parsing, network discriminator, claim key validation)
  │     └── cprp-crypto      (Kyber-768 KEM, AES-256-GCM, HKDF-SHA256, hash functions)
  ├── cprp-resolver-api      (ResolverPlugin interface definition, error codes, JSON schema)
  ├── cprp-composition       (composition algorithm, collision detection, metadata merging)
  │     └── cprp-core
  ├── cprp-trust             (trust evaluator, issuer tier classification, policy engine)
  │     └── cprp-core
  ├── cprp-cache             (TTL cache, refresh-ahead, changelog subscription)
  │     └── cprp-core
  └── cprp-transport         (HTTPS client, gRPC client, mTLS configuration, batch API)

cprp-resolver-dns            (DNS resolver plugin)
  ├── cprp-resolver-api
  └── dnssec-validator       (external: DNSSEC chain validation)

cprp-resolver-vlei           (vLEI resolver plugin)
  ├── cprp-resolver-api
  └── gleif-api-client       (external: GLEIF REST API client)

cprp-resolver-cn-cred        (CN Credential resolver plugin)
  ├── cprp-resolver-api
  └── canton-ledger-client   (external: Canton Ledger API / Scan API client)

cprp-resolver-addressbook    (Address book resolver plugin)
  └── cprp-resolver-api

cprp-daml                    (Daml contract templates)
  ├── PartyNameRegistration
  ├── NameDelegation
  ├── ResolverFeaturedStatus
  └── CollisionArbitration

cprp-service                 (Resolution Service — the off-ledger server)
  ├── cprp-sdk
  ├── cprp-daml
  ├── cprp-resolver-dns
  ├── cprp-resolver-vlei
  ├── cprp-resolver-cn-cred
  └── http-server            (HTTPS + gRPC server, OpenAPI spec, rate limiter)
```

#### B.4 SDK Language Bindings

| Language | Package | Primary Audience |
|----------|---------|-----------------|
| TypeScript | `@cprp/sdk` | Web/mobile apps, Scan frontend, wallet UIs |
| Java/Kotlin | `com.cprp:cprp-sdk` | Canton apps (Daml is JVM-based), enterprise backends |
| Python | `cprp-sdk` | Data analysis, compliance tooling, scripting |

All bindings expose the same API surface. The TypeScript SDK is the reference implementation. Java and Python SDKs wrap the same core logic via language-specific FFI or native re-implementation.

#### B.5 Data Flow

```
                   APPLICATION
                       |
           resolve("acme.com", "treasury")
                       |
                       v
              +--------+--------+
              |  RESOLUTION     |
              |    CLIENT       |
              +--------+--------+
                       |
          +------------+------------+
          |                         |
     [cache hit?]             [cache miss]
          |                         |
     return cached           load strategy
                                    |
                    +---------------+---------------+
                    |               |               |
               DNS Plugin     vLEI Plugin    CN Cred Plugin
                    |               |               |
               query resolver  query resolver  query Scan
                    |               |               |
                    v               v               v
               result A         result B        result C
                    |               |               |
                    +-------+-------+-------+-------+
                            |
                   COMPOSITION ENGINE
                     merge metadata
                     detect collisions
                     apply LET/weight
                            |
                            v
                    TRUST EVALUATOR
                     classify issuers
                     check policy
                     compute status
                            |
                            v
                  ENCRYPTED FIELD MGR
                    (if encrypted fields
                     present and recipient
                     has key: decrypt)
                            |
                            v
                    CACHE MANAGER
                      store result
                            |
                            v
              ComposedResolutionResult
                    returned to app
```


### Appendix C: Infrastructure Architecture

#### C.1 Deployment Topology

```
+=======================================================================+
|                    CANTON NETWORK INFRASTRUCTURE                       |
+=======================================================================+
|                                                                       |
|  SUPER VALIDATOR NODE (x13+)                                         |
|  +----------------------------+                                       |
|  | SV App                     |                                       |
|  | Canton Node                |  Existing Canton infrastructure       |
|  | Scan App                   |  (no CPRP modification needed)        |
|  | Validator App              |                                       |
|  +----------------------------+                                       |
|       |              |                                                |
|       | Ledger API   | Scan API                                      |
|       v              v                                                |
|  +==========================================+                         |
|  |     CPRP RESOLUTION SERVICE              |   <-- NEW component    |
|  |                                          |                         |
|  |  +----------------+  +---------------+   |                         |
|  |  | Resolver       |  | Changelog     |   |                         |
|  |  | Engine         |  | Indexer       |   |                         |
|  |  | (SDK embedded) |  | (polls Scan)  |   |                         |
|  |  +-------+--------+  +-------+-------+   |                         |
|  |          |                    |            |                         |
|  |  +-------+--------------------+-------+   |                         |
|  |  |          API Gateway               |   |                         |
|  |  |  (HTTPS + gRPC, mTLS, rate limit) |   |                         |
|  |  +------------------------------------+   |                         |
|  +==========================================+                         |
|       |                                                               |
|       | HTTPS / gRPC                                                  |
|       v                                                               |
|  +----------------------------+                                       |
|  | CANTON APPLICATION         |                                       |
|  |  (TradeApp, CustodyApp,   |   Existing apps embed CPRP SDK        |
|  |   Wallet, etc.)           |                                       |
|  |  +-------------------+    |                                       |
|  |  | CPRP SDK          |    |                                       |
|  |  | (client library)  |    |                                       |
|  |  +-------------------+    |                                       |
|  +----------------------------+                                       |
+=======================================================================+
```

#### C.2 Operator Deployment Options

CPRP introduces ONE new service. Operators choose from three deployment models:

Option A: Standalone Service (recommended for M2/M3)

```
+------------------+     +------------------+
| Canton           |     | CPRP Resolution  |
| Participant Node |<--->| Service          |
| (existing)       |     | (new container)  |
+------------------+     +------------------+
```

The Resolution Service runs as a separate container or VM alongside the existing Canton participant node. It connects to the Ledger API and Scan API to read credential state. Applications connect to it for resolution queries.

Requirements: 2 vCPU, 4 GB RAM, 20 GB SSD. Connects to existing Canton node — no new ports exposed to the internet beyond the CPRP API endpoint.

Option B: Embedded in Validator App (production target)

```
+----------------------------------+
| Validator App                    |
|  +----------------------------+  |
|  | Existing validator logic   |  |
|  +----------------------------+  |
|  +----------------------------+  |
|  | CPRP Resolution Module     |  |
|  | (embedded, shared process) |  |
|  +----------------------------+  |
+----------------------------------+
```

The Resolution Service logic is compiled into the Validator App as a module. This is the long-term target: CPRP becomes a standard capability of every Canton validator, similar to how Scan is embedded. Requires a Splice PR and Core Contributor review.

Option C: Sidecar (for featured resolvers like Freename)

```
+------------------+     +------------------+     +------------------+
| Canton Node      |<--->| CPRP Resolution  |<--->| Freename         |
| (Ledger API)     |     | Service          |     | Backend          |
+------------------+     | (sidecar)        |     | (resolver-       |
                          +------------------+     |  specific logic) |
                                                   +------------------+
```

Featured resolvers (Freename, 7Trust, etc.) operate their own resolver backend with domain-specific verification logic (DNS checks, vLEI calls, cross-chain proofs). The CPRP Resolution Service acts as a sidecar that standardizes the API and handles the resolver interface protocol.

#### C.3 Network Architecture

```
                         INTERNET
                            |
                            | HTTPS (TLS 1.3)
                            v
                    +-------+-------+
                    |  LOAD BALANCER |
                    | (HA, DDoS     |
                    |  protection)  |
                    +---+-------+---+
                        |       |
              +---------+       +---------+
              v                           v
    +---------+----------+   +-----------+---------+
    | CPRP Resolution    |   | CPRP Resolution     |
    | Service (Primary)  |   | Service (Replica)   |
    +----+----------+----+   +----+----------+-----+
         |          |              |          |
         v          v              v          v
    +----+----+ +---+---+    +----+----+ +---+---+
    | Canton  | | Scan  |    | Canton  | | Scan  |
    | Ledger  | | API   |    | Ledger  | | API   |
    | API     | |       |    | API     | |       |
    +---------+ +-------+    +---------+ +-------+
```

The Resolution Service is stateless — all state is derived from on-ledger credentials and resolver backends. This means horizontal scaling is straightforward: add more replicas behind the load balancer.

#### C.4 What Operators Need to Deploy

| Role | What Changes | Effort |
|------|-------------|--------|
| SV Operator | Nothing (credentials are read via existing Scan API) | Zero |
| Validator Operator | Optionally deploy CPRP Resolution Service container | Low: pull Docker image, configure Ledger API endpoint |
| Application Developer | Add CPRP SDK dependency, configure Resolution Strategy JSON | Low: `npm install @cprp/sdk`, add config file |
| Featured Resolver Operator (e.g., Freename) | Deploy resolver backend + CPRP sidecar, register via CIP governance | Medium: custom backend + standard sidecar |
| Party Administrator | Register names via CLI or UI, publish credentials | Low: `cprp-cli register --namespace acme.com --name treasury` |

#### C.5 External Service Dependencies

```
CPRP Resolution Service
     |
     +---> Canton Ledger API     (REQUIRED — credential state)
     +---> Canton Scan API       (REQUIRED — changelog, credential indexing)
     +---> GLEIF API             (OPTIONAL — vLEI verification, api.gleif.org)
     +---> DNSSEC resolvers      (OPTIONAL — DNS verification)
     +---> External resolver     (OPTIONAL — Freename, 7Trust, etc.)
           backends
```

Failure modes: If the GLEIF API is unavailable, vLEI verification degrades to cached state. If Scan is unavailable, the Resolution Service returns cached results with a `stale: true` flag. If a resolver backend is unavailable, the composition engine excludes it and proceeds with available resolvers (resolution mode permitting).


### Appendix D: Migration Path from CNS 1.0

#### D.1 Current State (CNS 1.0)

```
TODAY:
  Party registration:   goldmansachs.unverified.cns  (first-come-first-serve, payment only)
  Display:              Shows first lexicographic CNS entry, or raw Party ID
  Trust:                None — anyone can claim any name
  Resolution:           DsoAnsResolver (ad-hoc, not standardized)
  Metadata:             None
  Endpoints:            Manual/bilateral configuration
```

#### D.2 Target State (CPRP)

```
AFTER CPRP:
  Party registration:   mainnet/dns:goldmansachs.com:default  (verified, credential-backed)
  Display:              "Goldman Sachs" ✓  (three-layer model)
  Trust:                T1 (SV consensus) + T2 (vLEI) + T3 (featured resolver)
  Resolution:           Standardized Resolver Interface, app-configured strategy
  Metadata:             Rich profile via cns-2.0/* claims
  Endpoints:            Discoverable via cprp/endpoint:* claims
```

#### D.3 Migration Phases

Phase 0: Coexistence (Day 1 — no migration required)

CPRP deploys alongside CNS 1.0 with zero disruption.

```
PHASE 0 — COEXISTENCE

  CNS 1.0 (DsoAnsResolver)          CPRP (new)
  +--------------------------+       +--------------------------+
  | goldmansachs.unverified  |       | dns:goldmansachs.com     |
  |   .cns                   |       |   :default               |
  | → party::goldman1::...   |       | → party::goldman1::...   |
  +--------------------------+       +--------------------------+
         |                                    |
         v                                    v
    Existing apps                     CPRP-enabled apps
    (unchanged behavior)              (new Resolution Strategy)
```

Existing apps continue using `DsoAnsResolver` exactly as before. CPRP-enabled apps use the new SDK. Both resolve the same Party IDs. No contract migration, no data migration, no code changes to existing apps.

Phase 1: CNS 1.0 as a Resolver Plugin (M2 deliverable)

A `cns-v1` resolver plugin wraps the existing `DsoAnsResolver` as a CPRP-compatible resolver.

```
PHASE 1 — CNS 1.0 WRAPPED AS PLUGIN

  +----------------------------+
  | CPRP Resolution Strategy   |
  |                            |
  | resolvers:                 |
  |   1. dns      (weight 1.0)|    ← new: verified names
  |   2. vlei     (weight 0.9)|    ← new: LEI-backed
  |   3. cns-v1   (weight 0.3)|    ← legacy: .unverified names
  +----------------------------+
```

The `cns-v1` plugin:
- Reads existing CNS 1.0 entries from Scan.
- Returns them as T4 (self-attested) credentials — they remain `.unverified`.
- Apps that include `cns-v1` in their strategy get backward-compatible resolution.
- Apps can weight it low (0.3) so verified names from DNS/vLEI take priority.

This means: every existing `.unverified.cns` name is automatically visible to CPRP-enabled apps with zero manual intervention.

Phase 2: Guided Upgrade (M3–M4)

Parties upgrade from `.unverified.cns` to verified `.canton` or DNS-backed names.

```
PHASE 2 — GUIDED UPGRADE

  BEFORE:                              AFTER:
  goldmansachs.unverified.cns          Goldman Sachs ✓
  (T4, weight 0.3)                     dns:goldmansachs.com (T1, weight 1.0)
                                        + cns-v1 alias retained

  UPGRADE STEPS:
  1. Party publishes DNS TXT record      _canton.goldmansachs.com TXT "party=..."
  2. SV nodes verify → T1 credential     CnsDnsClaim published on-ledger
  3. Party optionally registers           freename:goldmansachs.canton (T3)
     .canton name
  4. CNS 1.0 entry retained as alias     goldmansachs.unverified.cns still resolves
```

The upgrade CLI:
```
$ cprp-cli upgrade --from goldmansachs.unverified.cns --to dns:goldmansachs.com
  Step 1/3: Publish DNS TXT record... instructions provided
  Step 2/3: Waiting for SV verification... (avg 24 hours)
  Step 3/3: Verified! Your party now resolves as "Goldman Sachs" ✓
            Legacy alias goldmansachs.unverified.cns retained.
```

Phase 3: Full Adoption (post-M4)

As CPRP adoption grows, the Working Group may propose deprecating CNS 1.0 registration (no new `.unverified.cns` entries) while retaining read access to existing entries indefinitely. This is a governance decision (requires a CIP) and is explicitly out of scope for the CPRP grant.

#### D.4 Migration Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Existing apps break | Zero risk: CNS 1.0 is unchanged, CPRP is additive |
| Name conflicts between CNS 1.0 and CPRP | Collision detection (Section 8) handles this; `.unverified` names are low-weight |
| SV nodes have extra work | Minimal: DNS verification is automated; featured resolver votes are infrequent |
| Party administrators confused | `cprp-cli upgrade` provides guided, step-by-step migration |
| ACS bloat from duplicate entries | CNS 1.0 entries and CPRP credentials are separate contracts; total ACS impact is quantified in Section 11.6 |


### Appendix E: Milestone Deliverables Matrix

This appendix maps each grant milestone to specific software components from the architecture (Appendix B), infrastructure requirements (Appendix C), and CIP specification sections.

> Grant structure note: The CPRP implementation is funded via two separate grants submitted to the Canton Protocol Development Fund:
> - Grant A — Party Name Resolution ($250,000): Milestones A1, A2, A3 (~30 weeks)
> - Grant B — Party Identity Verification ($200,000): Milestones B1, B2, B3 (~28 weeks)
>
> Grants are designed to be independently valuable (Grant A delivers human-readable names even without verification) but architecturally connected (Grant B extends Grant A's resolver infrastructure). B1 runs in parallel with A2. Total program duration: ~35 weeks with parallelism.
>
> The milestone descriptions below use the combined view. See the individual grant proposals for per-grant milestone mapping, exit criteria, and verification methods.

#### E.1 Milestone A1 — CIP & Resolution Architecture ($50,000 / 6 weeks)

```
MILESTONE A1 DELIVERABLES (Grant A)
+=================================================================+
|  Deliverable            | Spec Section | Architecture Component |
+=================================================================+
|  Draft CIP-XXXX (Party  | §1–§3, §14  | —                      |
|    Name Resolution)     |              |                        |
|  FQPN specification     | §1.1         | cprp-core types        |
|  Resolver Interface def | §2           | cprp-resolver-api      |
|  Resolution Strategy    | §3           | cprp-composition       |
|    schema               |              |   module               |
|  Daml contracts (draft) | §11.2, §11.3 | cprp-daml package      |
|    (Registration +      |              |                        |
|     Delegation)         |              |                        |
|  Address book spec      | §2.6         | cprp-resolver-ab       |
|  Collision mgmt spec    | §8           | cprp-composition       |
|  WG presentation        | —            | —                      |
+=================================================================+
  EXIT: CIP-XXXX accepted to "Proposed" status by the WG.
```

#### E.2 Milestone A2 — Resolver Prototype ($120,000 / 14 weeks)

```
MILESTONE A2 DELIVERABLES (Grant A)
+=================================================================+
|  Deliverable              | Spec Section | Architecture          |
+=================================================================+
|  cprp-core package        | §1           | Foundation types,     |
|                           |              |   FQPN parser,        |
|                           |              |   network disc.       |
|  cprp-resolver-api        | §2           | Plugin interface,     |
|    package                |              |   error codes,        |
|                           |              |   JSON schemas        |
|  cprp-resolver-dns        | §10.1        | DNS resolver plugin   |
|    plugin                 |              |   + DNSSEC validation |
|  cprp-resolver-cn-cred    | §4           | CN Credential plugin  |
|    plugin                 |              |   + Scan integration  |
|  cprp-resolver-addressbook| §2.6         | Address book plugin   |
|    plugin                 |              |   (local DB backend)  |
|  cprp-composition         | §3           | Composition engine,   |
|    module                 |              |   collision detection |
|  cprp-cache module        | §3.6         | TTL cache, changelog  |
|                           |              |   subscription        |
|  cprp-service             | §12          | Resolution Service    |
|    (basic)                |              |   (HTTPS, basic API)  |
|  cprp-daml contracts      | §11          | On-ledger templates   |
|    (deployed to testnet)  |              |   deployed + tested   |
|  CNS 1.0 wrapper plugin   | App. D       | cns-v1 resolver       |
|                           |              |   plugin              |
|  TestNet deployment       | —            | Docker image +        |
|                           |              |   deployment scripts  |
|  Performance benchmarks   | —            | Load test suite       |
+=================================================================+
  EXIT: WG confirms prototype resolves names to parties on TestNet.
        50+ test parties, 2+ resolver types. <100ms p95 latency.

  INFRASTRUCTURE: Option A (standalone container on testnet)
```

#### E.3 Milestone A3 — Resolution SDK & Adoption ($80,000 / 10 weeks)

```
MILESTONE A3 DELIVERABLES (Grant A)
+=================================================================+
|  Deliverable              | Spec Section | Architecture          |
+=================================================================+
|  @cprp/sdk (TypeScript)   | All §1–§3    | Resolution client,    |
|                           |              |   composition, cache  |
|                           |              |   npm published       |
|  cprp-sdk (Python)        | All §1–§3    | Python SDK,           |
|                           |              |   pip published       |
|  com.cprp:cprp-sdk (Java) | All §1–§3    | Java SDK,             |
|                           |              |   Maven published     |
|  cprp-cli tool            | —            | Registration, upgrade,|
|                           |              |   delegation mgmt     |
|  Integration guide        | —            | Step-by-step for      |
|                           |              |   app developers      |
|  Migration guide          | App. D       | CNS 1.0 → CPRP       |
|                           |              |   upgrade path        |
|  Reference wallet app     | Flows 1,7    | Resolution +          |
|                           |              |   address book demo   |
|  Adoption support         | —            | Office hours, WG      |
+=================================================================+
  EXIT: 2+ Canton ecosystem apps integrated resolution SDK
        in testnet or staging environment.

  INFRASTRUCTURE: SDK is client-side only — no new infra.
```

#### E.4 Milestone B1 — CIP & Verification Architecture ($40,000 / 6 weeks)

```
MILESTONE B1 DELIVERABLES (Grant B)
+=================================================================+
|  Deliverable              | Spec Section | Architecture          |
+=================================================================+
|  Draft CIP-YYYY (Party    | §5–§6, §9   | —                     |
|    Identity Verification) |              |                       |
|  Trust tier model spec    | §5           | cprp-trust module     |
|    (T1–T4 classification) |              |                       |
|  Verification policy      | §3.2 (policy)| cprp-trust            |
|    schema                 |              |                       |
|  Credential mapping spec  | §4.3         | cprp-core types       |
|    (cprp/* claim keys)    |              |                       |
|  Encrypted field crypto   | §6           | cprp-crypto module    |
|    specification          |              |                       |
|  Daml contracts (draft)   | §11.4, §11.5 | cprp-daml             |
|    (FeaturedStatus +      |              |                       |
|     Arbitration)          |              |                       |
|  WG presentation          | —            | —                     |
+=================================================================+
  EXIT: CIP-YYYY accepted to "Proposed" status by the WG.

  NOTE: B1 can begin in parallel with A2 (CIP design does not
  depend on the resolver prototype).
```

#### E.5 Milestone B2 — Verification Implementation ($110,000 / 14 weeks)

```
MILESTONE B2 DELIVERABLES (Grant B)
+=================================================================+
|  Deliverable              | Spec Section | Architecture          |
+=================================================================+
|  cprp-trust module        | §5           | Trust evaluator,      |
|                           |              |   issuer classifier,  |
|                           |              |   policy engine       |
|  cprp-resolver-vlei       | §10.2        | vLEI resolver plugin  |
|    plugin                 |              |   + GLEIF API client  |
|  DNS verification flow    | §10.1        | Phase 1: featured     |
|    (Phase 1)              |              |   resolver quorum,    |
|                           |              |   CnsDnsClaim cred.   |
|                           |              |   lifecycle           |
|  Scan integration         | §13          | Changelog consumer,   |
|    (profile pages)        |              |   3-layer display     |
|                           |              |   model in Scan       |
|  Cross-chain claims       | §9           | Ethereum sig verify,  |
|    (basic)                |              |   ENS TXT verify      |
|  Name delegation (full)   | §2.7, §11.3  | Delegation contracts, |
|                           |              |   chain verification  |
|  cprp-service (production)| §12          | Full API: batch,      |
|                           |              |   gRPC, mTLS,         |
|                           |              |   rate limiting       |
|  Network discriminator    | §1.1         | MainNet/TestNet/      |
|    enforcement            |              |   DevNet separation   |
|  Collision arbitration    | §8.5, §11.5  | CollisionArbitration  |
|    contracts              |              |   Daml + governance   |
|  Explorer demo            | §13          | Scan showing verified |
|                           |              |   names + profiles    |
|  Privacy review           | Security §   | Query privacy audit,  |
|                           |              |   threat model doc    |
+=================================================================+
  EXIT: E2E demo — app resolves name → verified party →
        executes Canton transaction using resolved identity.
        Scan shows verified name + profile for demo parties.

  DEPENDENCY: Begins after A2 delivers resolver infrastructure.
  INFRASTRUCTURE: Option A → Option B evaluation begins.
```

#### E.6 Milestone B3 — Verification SDK & Adoption ($50,000 / 8 weeks)

```
MILESTONE B3 DELIVERABLES (Grant B)
+=================================================================+
|  Deliverable              | Spec Section | Architecture          |
+=================================================================+
|  Verification extensions  | §5           | Trust evaluator API,  |
|    to all 3 SDKs          |              |   cred verifier API   |
|    (TS, Python, Java)     |              |                       |
|  Reference custody app    | Flows 1–3    | Resolution +          |
|                           |              |   verification demo   |
|                           |              |   between             |
|                           |              |   counterparties      |
|  Architecture guide       | App. B       | Component docs,       |
|                           |              |   API reference       |
|  Operational playbook     | App. C       | Deployment guide for  |
|                           |              |   resolver operators  |
|  Verification guide       | —            | Trust policies,       |
|                           |              |   vLEI setup          |
|  Adoption support         | —            | Office hours, WG,     |
|                           |              |   early adopters      |
+=================================================================+
  EXIT: 1+ Canton ecosystem app integrated verification SDK
        extensions in testnet or staging environment.

  INFRASTRUCTURE: SDK is client-side only.
```

#### E.7 Timeline Summary

```
GRANT A (Resolution — $250k):
WEEK:  1-----5-----10-----15-----20-----25-----30
       | A1  |          A2          |     A3     |
       |$50k |        $120k        |    $80k    |

GRANT B (Verification — $200k):
WEEK:  1-----5-----10-----15-----20-----25-----30-----35
                    | B1  |          B2          |  B3  |
                    |$40k |        $110k         | $50k |

COMBINED VIEW (with parallelism):
WEEK:  1-----5-----10-----15-----20-----25-----30-----35
       | A1  |  A2 + B1  |    A2    |  A3 + B2  |A3+B3|
       |     |  parallel |          |  parallel  |     |

KEY DELIVERABLES:
  CIP-XXXX draft-------+ (W6)
                  CIP-YYYY draft---+ (W12)
       Resolver prototype on TestNet---------+ (W20)
                  Resolution SDK published-----------+ (W25)
                         E2E demo + Scan integration----------+ (W30)
                                  Full adoption package--------------+ (W35)

  TOTAL: $450,000 across 2 grants                              DONE-+
```

