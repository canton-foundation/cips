Number: CIP-XXXX

Title: Canton Party Name Resolution — FQPN, Resolver Interface, and Composition

Status: Draft

Author: Paolo Domenighetti (Freename)

Created: 2026-05-31

## Abstract

This CIP defines the resolution layer for the Canton Network: how applications resolve human-readable names to Canton Party IDs and how they retrieve associated metadata. It specifies the Fully Qualified Party Name (FQPN) addressing format, the generic Resolver Interface that any identity provider implements, the Resolution Strategy that applications use to configure resolver order and weights, the Composition Engine that merges results from multiple resolvers, the collision detection and surfacing semantics, the on-ledger encoding of name registrations and delegations as standard CN Credentials, the three-layer display model that renders resolved names with source icons, the off-ledger Resolution Service API, and the integration of locally scoped address books.

This CIP does not define the trust tier framework or verification semantics (specified in CIP-YYYY, Party Identity Verification). It does not define how external names (DNS, LEI/vLEI, ENS) are imported into Canton (specified in CIP-ZZZZ, Imported Names). It does not define Canton-native naming or the `.canton` namespace (specified in the `.canton` CIP led by Axymos, PR #209); it only specifies how `.canton` names flow through the resolution layer as one source among many.

## Motivation

Canton participants are identified by cryptographic Party IDs — opaque alphanumeric strings of the form `<prefix>::<68-character-namespace-hash>` where the namespace is a hash of the party administrator's public key. These strings are unusable in any human workflow. The CNS 1.0 names that exist today (`goldmansachs.unverified.cns`) are first-come-first-serve with no ownership check, so they convey no signal about which counterparty they actually identify.

The Identity and Metadata Working Group has identified three concrete gaps:

- P1: Trustworthy human-readable names. Applications need to display and accept names that map to specific Canton parties.
- P2: Off-ledger API endpoint discovery. Applications need to find administrative endpoints (for example, the token-admin API for a CIP-56 instrument) keyed on a party identifier.
- P3: Self-published profile information. Parties need to publish profile data that displays uniformly across applications.

This CIP addresses the resolution machinery that underlies all three: a uniform addressing model, a pluggable resolver interface, an explicit composition algorithm, a deterministic collision behavior, and a standard display model. The trust judgment that turns a resolved name into a verified one is left to CIP-YYYY; the import of external names into Canton credentials is left to CIP-ZZZZ.

## Specification

### 1. Terminology

- Party ID. A Canton ledger identity consisting of a prefix and a namespace. The namespace is a 68-character hexadecimal hash of the party administrator's public key. The prefix is a freely chosen human-meaningful component. Party IDs are formatted as `<prefix>::<namespace>` and may contain further `::` separators introduced by administrator delegation.
- Resolver. A software component that provides a mapping between names in some external or internal naming system and Canton Party IDs. Examples: a DNS resolver, a vLEI resolver, a `.canton` resolver, a local address book.
- Registrar. The naming authority or registrant scope within a resolver. For DNS, the registrar is the registered domain (e.g. `acme.com`). For vLEI, the registrar is the LEI. For Canton-native `cns` naming, the registrar is a Super Validator–approved entity that allocates names within the `.canton` (or related) suffix set.
- Name. The leaf identifier within a registrar's scope (e.g. `treasury` within `acme.com`).
- FQPN. A Fully Qualified Party Name; see Section 2.
- Composed Result. The output of running a Resolution Strategy against a query; see Section 4.

### 2. The Fully Qualified Party Name (FQPN)

#### 2.1 Format

A Fully Qualified Party Name is structured as four `;`-separated components:

```
<network>;<resolver>;<registrar>;<name>
```

| Component | Purpose | Example Values |
|-----------|---------|----------------|
| `network` | Prevents cross-environment confusion | `mainnet`, `testnet`, `devnet` |
| `resolver` | Identity source that backs the name | `dns`, `vlei`, `ens`, `cns`, `freename`, `self`, `party` |
| `registrar` | Naming authority or registrant scope within the resolver | `goldmansachs.com`, `acme-bank.canton`, `lloyds`, `axymos` |
| `name` | Specific name within the registrar | `default`, `treasury`, `trading-desk-3` |

Examples:

- `mainnet;dns;goldmansachs.com;default`
- `mainnet;vlei;784F5XWPLTWKTBV3E584;default`
- `mainnet;cns;axymos;blackrock.canton`
- `testnet;freename;acme-bank.canton;treasury`
- `mainnet;self;acme-bank;default`
- `mainnet;party;<party-prefix>;default`

#### 2.2 Why `;` and not `:`

A semicolon is used as the field separator because `:` appears unescaped in many identifiers that legitimately occupy an FQPN slot, most notably the `::` separators inside Canton Party IDs (e.g. `acme-bank::1220abcd...`). Alternatives considered and rejected:

- `:` (colon) — collides with Party ID's `::` and with URL/email syntax.
- `|` (pipe) — visually ambiguous with lowercase L in many fonts.
- `,` (comma) — conventionally used for lists.

The semicolon is unambiguous in DNS names, email addresses, URLs, and Party IDs, and visually distinct from `:`. Implementations MUST NOT accept `:` as a substitute.

#### 2.3 Network Discrimination

The `network` component is mandatory. TestNet names MUST NOT be confusable with MainNet names. Display of FQPNs SHOULD include the network when an application supports multiple networks.

#### 2.4 Built-in Resolvers

Two resolver values are built-in to this CIP and available on every network. They are not registered on a per-network basis; the `network` segment of the FQPN performs the disambiguation, so `mainnet;party;...` and `devnet;party;...` are distinct names backed by the same built-in resolver.

- `party` — Returns an FQPN derived directly from a Canton party's Party ID. The registrar slot is the human-chosen Party-ID prefix; the name slot is conventionally `default`. This resolver guarantees that every Canton party always has at least one FQPN, even before any name registration. Trust tier T4 (the prefix is freely chosen and trivially spoofable).
- `self` — Returns claims a party publishes about itself with no external verification. Trust tier T4. Used for self-attested profile information.

Because a Canton Party ID itself contains `::` separators, full Party IDs are referenced in FQPNs by their prefix (the human-chosen component) rather than embedded verbatim, so that the `;` field delimiter remains structurally separate from the Party ID's internal syntax.

#### 2.5 The `cns` Resolver and Its Registrars

The `cns` resolver value represents the Canton-native naming system. Unlike single-authority resolvers (e.g. `dns` which is governed by the global DNS), `cns` admits multiple registrars within its resolver space. Each `cns` registrar:

- Is approved through Super Validator governance (or an alternative governance structure defined by the `.canton` CIP) and identified by a unique ASCII registrar name (e.g. `axymos`).
- Takes responsibility for allocating names within its scope and may issue names ending in `.canton` (and any further suffixes the `.canton` CIP authorizes).
- MUST NOT issue names ending in any DNS top-level domain (`.com`, `.net`, `.org`, etc.). This rule is enforced at the credentials standard level by the `.canton` CIP.
- Has an associated icon, whitelisted through the same governance process that approves the registrar, to be displayed alongside its names (see Section 9).

The allocation, uniqueness, and governance of `cns` registrars and of the `.canton` suffix set are specified in the `.canton` CIP (Axymos, PR #209), not in this CIP. This CIP only specifies how `cns`-resolved names are addressed in FQPNs, composed with results from other resolvers, and displayed.

### 3. The Resolver Interface

Every resolver — built-in or third-party — implements the following logical interface. The interface is defined logically; an HTTPS mapping is given in Section 7.

| Method | Inputs | Output | Purpose |
|--------|--------|--------|---------|
| `resolve` | registrar, name | `ResolutionResult` | Forward lookup: name → Party ID + metadata |
| `reverseResolve` | party_id | `ResolutionResult[]` | Reverse lookup: Party ID → names known to this resolver |
| `resolveMulti` | `(registrar, name)[]` | `ResolutionResult[]` | Batched forward lookup |
| `changelog` | since-cursor | event stream | Subscribe to changes (additions, archivals, revocations) |

#### 3.1 ResolutionResult Schema

```
{
  "fqpn"           : "<network>;<resolver>;<registrar>;<name>",
  "party_id"       : "<canton-party-id>",
  "display_name"   : "<human-readable string>",
  "ascii_form"     : "<resolver;registrar;name>",
  "metadata"       : { /* claim keys and values, see Section 5 */ },
  "claim_sources"  : { /* per-claim provenance */ },
  "valid_until"    : "<ISO-8601-timestamp>",
  "status"         : "OK" | "EXPIRED" | "COLLISION" | "NOT_FOUND"
}
```

#### 3.2 Error Codes

| Code | Meaning |
|------|---------|
| 1000 | Name not found |
| 1001 | Registrar not supported by this resolver |
| 1002 | Resolver temporarily unavailable |
| 1003 | Malformed FQPN |
| 1004 | Network mismatch |

### 4. Resolution Strategy and Composition

An application's Resolution Strategy is a JSON document declaring which resolvers to query, in what mode, with what weights, and how to combine results.

#### 4.1 Strategy Schema

```
{
  "network"           : "mainnet",
  "resolvers"         : [
    { "id": "dns",      "weight": 0.8, "trust_tier": "T3" },
    { "id": "vlei",     "weight": 0.9, "trust_tier": "T2" },
    { "id": "cns",      "weight": 0.5, "trust_tier": "T3" },
    { "id": "self",     "weight": 0.1, "trust_tier": "T4" }
  ],
  "address_books"     : [ /* see Section 6 */ ],
  "resolution_mode"   : "priority" | "parallel" | "quorum",
  "quorum_n"          : 2,
  "display_name_rule" : {
    "source"   : "highest_weight" | "specific_resolver" | "address_book_first",
    "claim_key": "cns-2.0/name"
  },
  "cache_policy"      : { "ttl_seconds": 300 },
  "verification_policy": { /* see CIP-YYYY */ }
}
```

Three modes:

- `priority` — query resolvers in declared order; first hit wins.
- `parallel` — query all resolvers simultaneously; merge results via composition.
- `quorum` — N-of-M agreement on Party ID before returning.

#### 4.2 Composition Engine

When more than one resolver returns a result, the Composition Engine merges them deterministically:

1. Group results by returned Party ID.
2. Within a group, resolve same-resolver conflicts by ledger effective time (LET) — later wins.
3. Across resolvers within a group, merge metadata; for conflicting claim values on the same key, the higher-weighted resolver's value wins.
4. Record per-claim provenance in `claim_sources` so downstream consumers (auditors, compliance tools) can trace which resolver contributed which value.
5. If groups disagree on Party ID (i.e. the same name maps to different parties across resolvers), the engine returns status `COLLISION` with all candidates and their respective trust paths.

The Composition Engine never alters the resolver inputs. It does not assign or override trust judgments — trust is computed by the CIP-YYYY evaluator over the composed result.

#### 4.3 The `display_name_rule`

The strategy's `display_name_rule` decides which name is shown first (the leading glyph plus ASCII string per Section 9). Three sources:

- `highest_weight` — the display name claim from the highest-weighted resolver in the result wins.
- `specific_resolver` — a named resolver's claim is preferred.
- `address_book_first` — a matching address book entry's display name wins over network resolver claims.

This rule answers the WG's open question of who picks the displayed name: the consuming application, via its strategy, per query.

#### 4.4 Reference Strategies

Two reference strategies are defined for common application contexts:

- `INSTITUTIONAL_DEFAULT` — parallel mode, strict collision policy, requires DNS or vLEI, no address-book-first. Externally verifiable sources lead; a local address book entry MAY be present as a lower-weight fallback but never overrides DNS or vLEI.
- `PERMISSIVE_DEFAULT` — parallel mode, permissive collision policy, address-book-first. Tailored for consumer wallets and explorers where a recognized local label is preferable to no name at all.

The reason `INSTITUTIONAL_DEFAULT` does not put the address book first is that institutional flows require counterparty identity to be backed by an externally verifiable source rather than by a per-operator subjective label; the address book may still participate, weighted appropriately.

### 5. Claim Keys (Resolution-Layer)

The following claim keys are defined by this CIP. Imported-name claims (`cprp/source`, `cprp/legal-name`, etc.) are defined in CIP-ZZZZ; trust claims (`cprp/trust-anchor`, `cprp/featured-resolver`, etc.) are defined in CIP-YYYY. Profile claims (`cns-2.0/name`, `cns-2.0/avatar`, `cns-2.0/email`, `cns-2.0/website`) follow the convention defined in the Party Profile Credentials CIP from PixelPlex; profile claims are informational only and MUST NOT be interpreted as verified identity attributes.

| Claim Key | Value | Purpose |
|-----------|-------|---------|
| `cprp/fqpn` | An FQPN string | The canonical FQPN this credential certifies |
| `cprp/network` | `mainnet` / `testnet` / `devnet` | Network discriminator |
| `cprp/registrar` | Registrar component | The registrar this credential is scoped under |
| `cprp/endpoint:<service>` | URL | Off-ledger API endpoint, keyed by service (e.g. `cprp/endpoint:token-admin`) |
| `cprp/social:<platform>` | Handle/URL | Self-attested social contact (T4); platforms include `telegram`, `x`, `github`, `discord` |
| `cprp/parent-fqpn` | An FQPN string | For delegation credentials; the parent registrant's FQPN |
| `cprp/delegated-name` | string | The leaf name being delegated |
| `cprp/delegation-scope` | `name-only` / `name-and-subdelegation` | Whether the delegated subname can further delegate |

The `cprp/endpoint:*` family of keys carries only the URL. Profile metadata such as entity type, capabilities, or jurisdiction is published as separate profile claims rather than bundled into endpoint credentials.

### 6. Address Books

An address book is a locally scoped resolver — typically a per-institution or per-application table mapping names to Party IDs and associated metadata. Address books are part of the Resolution Strategy alongside network resolvers.

Address book claims have no external trust weight; they cannot raise the trust tier of an identity and MUST NOT override the verification status produced by CIP-YYYY's evaluator. Their role is local: an institution may show "GS Prime" instead of "Goldman Sachs" for internal convenience, while network resolvers continue to control the verified identity.

### 7. Off-Ledger Resolution Service API

The logical Resolver Interface (Section 3) is exposed as an HTTPS service that any application can deploy alongside its existing Canton infrastructure. The service is stateless: all state is derived from on-ledger credentials and externally cached data.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/resolve` | POST | Single forward lookup |
| `/v1/resolve/batch` | POST | Batched forward lookup |
| `/v1/resolve/reverse` | POST | Reverse lookup |
| `/v1/changelog` | GET (SSE) | Subscribe to changes |

A gRPC equivalent is offered for low-latency clients.

Operational requirements:

- Stateless deployment; horizontal scaling by replication.
- Recommended baseline footprint: 2 vCPU, 4 GB RAM per replica.
- No modification to SV nodes or to the Scan service is required.

### 8. On-Ledger Representation

This CIP defines two on-ledger entities, both encoded as standard CN Credentials (not custom Daml templates):

#### 8.1 PartyNameRegistration (as credential)

A name registration is a credential where the publisher is the issuing resolver (e.g. the DSO party for `.canton` names approved by SV vote, or a featured resolver for other names), the subject is the registered Canton party, and the holder is the registered Canton party. Claims include:

- `cprp/fqpn` — the canonical FQPN
- `cprp/network` — the network
- `cprp/registrar` — the registrar
- `cprp/trust-anchor` — declared per CIP-YYYY tier rules
- `cprp/valid-until` — expiry

A NameDelegation credential (next subsection) is required to authorize subnames under a registered name.

#### 8.2 NameDelegation (as credential)

A delegation is a credential where the publisher is the parent (the holder of the parent name), the subject is the child party (the subname's intended holder), and the holder is the child party. Claims include `cprp/parent-fqpn`, `cprp/delegated-name`, and `cprp/delegation-scope`.

The composition engine verifies delegations recursively: a subname FQPN's authenticity depends on a valid chain from the leaf subname back to a registered parent that is itself rooted in a credible registrar (e.g. a DNS-verified domain). A delegation with `cprp/delegation-scope` of `name-only` cannot itself authorize further subdelegation.

#### 8.3 On-Ledger Footprint

Per-party footprint is dominated by credential contracts at ~1–3 KB each; PartyNameRegistration adds ~500 bytes per registered name and NameDelegation ~400 bytes per delegated subname. Total ACS impact for 1,000 parties with an average of 3 credentials and 2 delegations each is approximately 7 MB. Resolution queries are off-ledger and do not contribute to ACS growth.

### 9. Display Model

Resolved names are rendered consistently across applications using a three-layer model and a common icon-plus-ASCII convention.

#### 9.1 Icon + ASCII Convention

Every rendered name MUST be preceded by a source icon that identifies its `resolver` component (and, for `cns`, the specific registrar). The icon is a deterministic function of the FQPN's `resolver` (and `registrar` for `cns`) — no separate lookup is required at display time.

- For DNS, LEI, vLEI, and ENS: a single standardized icon per resolver. Registrars within these resolvers do not get their own icons.
- For `cns`: each governance-approved registrar has its own icon, whitelisted through the same Super Validator governance procedure that approves the registrar (per the `.canton` CIP). Even registrars that function only inside Canton receive an icon — every name has an associated source icon.
- For `self` and `party` built-ins: a neutral icon indicating self-attested or Party-ID-derived origin.

Rendering example: `mainnet;dns;lloyds.com;tmmf` displays as `<dns icon> tmmf.lloyds.com`; `mainnet;cns;axymos;blackrock.canton` displays as `<axymos icon> blackrock.canton`.

The icon represents the source of the name. Trust state (verified, partial, unverified) is a separate signal carried by an additional badge (`✓` / `⚠`) computed by the CIP-YYYY evaluator; both icon and badge may be displayed.

#### 9.2 Three Layers

| Layer | Where Used | Content |
|-------|------------|---------|
| L1: Inline | Transaction lists, counterparty fields | Source icon + ASCII name + verification badge |
| L2: Hover | Tooltip / popover on hover or tap | Profile card with name, LEI, jurisdiction, issuer summary |
| L3: Full | Explorer profile page (any explorer, not specifically Scan) | Full profile: all credentials, trust path, endpoints, history, delegation chain |

The full profile (L3) MAY be hosted by any explorer — Scan or third-party — without changing the underlying credential data. The fallback chain when claims are absent is: display name claim → CNS 1.0 entry → Party-ID prefix → truncated Party ID.

#### 9.3 Profile Rendering Guidelines

Profile claims (`cns-2.0/name`, `cns-2.0/avatar`, `cns-2.0/email`, `cns-2.0/website`) are informational only and MUST NOT be interpreted as verified identity attributes. Display names SHOULD be ≤64 Unicode characters and SHOULD be screened for confusable characters under Unicode UTS #39 (General Security Profile, Identifier_Type, Highly Restrictive script restriction). Avatars SHOULD be `https://` URLs; applications MAY additionally support `ipfs://` URIs.

### 10. Collision Management

Collisions occur when two or more resolvers return different Party IDs for the same `(network, name)` pair. The Composition Engine detects collisions deterministically per Section 4.2.

#### 10.1 Collision Policies

| Policy | Behavior |
|--------|----------|
| `strict` | Returns status `COLLISION` with all candidates and their trust paths; the application must present a disambiguation UI |
| `permissive` | Selects the highest-weight result; attaches a collision warning to the response |

#### 10.2 Realistic Collisions

The realistic causes of collisions are not primarily adversarial. They include:

- Legitimate homonyms — two different real entities with the same short name (e.g. two banks both named "TSB" registering in different jurisdictions through different featured resolvers).
- Low-metadata retail names — a name like `dave.canton` with little disambiguating metadata across multiple registrants.

In both cases CPRP's role is disambiguation via trust path, not unilateral selection: the engine presents all candidates with their evidence and the consuming application's strategy decides.

#### 10.3 Collision Rate Reduction

Reducing the rate of collisions at the source is the responsibility of allocation policy in the `.canton` CIP (which, for example, prohibits DNS TLDs from being issued as `cns` names per Section 2.5) and in the operational practices of other registrars. CPRP does not allocate names; it detects and surfaces.

#### 10.4 Cross-Resolver Arbitration (deferred)

Binding governance arbitration of disputed name-to-party mappings across featured resolvers is deferred to the future governance CIP. This CIP defines detection and surfacing only; the on-ledger arbitration credential and the escalation procedure will be specified by that CIP.

### 11. Asset Naming (Extension Point)

Under the Canton token standard, an instrument is identified by an `InstrumentId` of `{ admin: Party; id: Text }`. An asset is therefore naturally a subname of its administering party, not a standalone top-level name.

CPRP accommodates this by resolving the admin party to its verified FQPN and treating the instrument `id` as a delegated subname beneath the admin's registrar, reusing the name-delegation mechanism of Section 8.2.

Worked example: an instrument administered by BlackRock resolves by first resolving the admin party to `mainnet;dns;blackrock.com;default`, then discovering the admin's token-standard off-ledger API via its `cprp/endpoint:token-admin` credential, and querying that API at the token-standard `/registry/metadata/v1/instruments/{id}` endpoint for the published symbol.

A future CIP would define an asset-specific variant of the `resolve` method that takes an `InstrumentId` and returns the administering party's verified FQPN together with the instrument metadata, plus asset metadata claim keys (e.g. `cprp-asset/isin`, `cprp-asset/cusip`, `cprp-asset/token-standard`). An asset inherits the trust tier of its administering party. This keeps asset naming consistent with party naming — one resolution and delegation model rather than a parallel scheme — and aligns with CIP-56 token-admin endpoint discovery.

### 12. The `.canton` Namespace

The `.canton` extension is a human-readable, Canton-native naming convention (not a DNS TLD — there is no `.canton` entry in the DNS root). Allocation, uniqueness, and governance of `.canton` names are defined by the `.canton` CIP led by Axymos (PR #209), not by this CIP. Within CPRP, `.canton` names are:

- Network-scoped — `acme-bank.canton` on MainNet is distinct from the same name on TestNet, per the FQPN network discriminator.
- Verification-independent — a resolved `.canton` name carries whatever trust tier its `cns` registrar and credentials establish under CIP-YYYY; the `.canton` suffix itself confers no trust.
- Composable — `.canton` results compose alongside imported names (DNS, vLEI, etc.) in the same query, per the strategies of Section 4.

Examples as seen by CPRP:

- `alice.canton` — an individual name issued by a `cns` registrar under the `.canton` CIP; resolved and trust-evaluated by CPRP like any other source.
- `goldmansachs.canton` — an institution's Canton-native name; may coexist with the same institution's DNS-verified name in the composition result.
- `treasury.acme.canton` — a delegated subname under `acme.canton`, verified via the delegation chain of Section 8.2.

Users type `alice.canton` directly. The FQPN infrastructure is invisible — resolvers and registrars are handled by the SDK, just as DNS root servers and TLD delegation are invisible to web users.

### 13. Backward Compatibility

This CIP is additive. Existing CNS 1.0 names (`name.unverified.cns`) are preserved unchanged; a `cns-v1` resolver plugin wraps the existing `DsoAnsResolver` as a CPRP-compatible resolver. The CN Credentials interface is used as-is; new `cprp/*` claim keys are additive. Scan integration is additive (changelog consumption only). Adoption is entirely opt-in.

A party may upgrade from a CNS 1.0 name to a CPRP-registered name while retaining the CNS 1.0 alias.

## Rationale

### Why multi-resolver

Canton's institutional reality requires multiple, parallel identity sources to coexist. A single naming authority fails this reality. The multi-resolver architecture accommodates DNS, vLEI, ENS, native Canton naming, and address books without requiring global consensus on a single standard.

### Why apps decide

Centralizing resolution policy in the foundation would require defining a single global trust standard, a governance burden the WG explicitly chose to avoid. Pushing the decision to applications keeps the protocol neutral while allowing each application to enforce policies appropriate for its use case.

### Why off-ledger

Resolution queries are high-frequency, low-latency operations. Executing them on-chain would bloat the ACS and degrade ledger performance. A stateless Resolution Service derives all state from on-ledger credentials and provides the same trust guarantees without the performance cost.

### Why credential-native

Encoding name registrations and delegations as standard CN Credentials, rather than as custom Daml templates, means no new Daml code to review and maintain in the core network. It also allows the same standard (PixelPlex's Party Profile Credentials, Digital Asset's CN Credentials Standard) to carry all of this metadata.

### Why the semicolon separator

Every other obvious separator collides with structure that already exists in the components: `:` with Party IDs and URLs, `|` with lowercase L visually, `,` with list syntax. The semicolon is unambiguous in DNS names, email addresses, URLs, and Party IDs.

### Why source icons are universal

Wayne Collier observed that for users to reason about a name they must be able to see where it comes from. Standardized icons for DNS, LEI, ENS, and resolver-governed icons for `cns` registrars give a uniform visual grammar; the alternative — letting applications render names without source attribution — invites confusion and impersonation.

## Companion CIPs

- CIP-YYYY (Party Identity Verification) — defines the trust tier framework (T1–T4), the trust evaluator, verification policies, and the featured-resolver registry that this CIP's composition feeds into.
- CIP-ZZZZ (Imported Names) — defines per-source verification procedures (DNS, vLEI, ENS, cross-chain) whose credentials this CIP's resolvers serve.
- `.canton` CIP (Axymos, PR #209) — defines the Canton-native `.canton` namespace, its `cns` registrars, and its allocation policy. Names issued under that CIP flow through this CIP's resolution layer as one source among many.
