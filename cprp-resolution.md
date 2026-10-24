Number: CIP-XXXX

Title: Canton Party Name Resolution Standard

Status: Draft

Author: Paolo Domenighetti (Freename), [Co-authors TBD]

Created: 2026-08-29

## Abstract

This CIP defines a uniform approach for naming parties on the Canton network. The approach allows integrating the many naming systems used by the organizations on the Canton Network regardless of whether they are native to the Canton Network (like CNS) or externally managed (like DNS or LEI). The approach is based on standardizing the following four concepts as part of this CIP: how human-readable party names are represented on the Canton Network (the Fully Qualified Party Name format), how they are resolved to Canton Party IDs, how they are rendered in application UIs, and how additional naming systems are integrated by defining new resolvers or extending existing ones.

## Motivation

Canton Network participants are identified by cryptographic Party IDs of the form `<prefix>::<68-character-namespace-hash>`, which are unusable in human workflows other than simple copy-and-pasting. CNS 1.0 names (`name.unverified.cns`) are self-registered without verification and convey no signal about which counterparty they identify. Applications need to display memorable human-readable names and accept them as input uniformly across the network. This CIP provides the shared representation, resolution behavior, and rendering conventions that make that possible, while leaving ample implementation freedom to implementers.

## Specification

### 1. Terminology

- Party ID. A Canton ledger identity of the form `<prefix>::<namespace>`, where the namespace is a 68-character hexadecimal hash of the party administrator's public key. Party IDs may contain additional `::` separators.
- Naming system. A system that manages human-readable names, native to the Canton Network (e.g. CNS) or externally managed (e.g. DNS, LEI, ENS).
- Resolver. A component that maps names from a naming system to Canton Party IDs. Examples: `dns`, `lei`, `ens`, `cns`, `party-id`.
- Registrar. A party approved to allocate names within a naming system. Registrars are a governance concept defined by each naming system's CIP; they are not part of the addressing format.
- FQPN. A Fully Qualified Party Name; see Section 2.

### 2. Representation — the Fully Qualified Party Name

#### 2.1 Format

```
<network>:<resolver>:<name>
```

| Component | Purpose | Values |
|-----------|---------|--------|
| `network` | Prevents cross-environment confusion | `mainnet`, `testnet`, `devnet`, `localnet` |
| `resolver` | The naming system that backs this FQPN | `dns`, `lei`, `ens`, `cns`, `party-id`, others via their own CIPs |
| `name` | A sequence of printable, non-whitespace ASCII characters, interpreted by the resolver | `blackrock.com`, `blackrock.canton`, `partyHint::1220abcd...` |

Examples:

- `mainnet:dns:blackrock.com`
- `mainnet:dns:tmmf.lloyds.com`
- `mainnet:cns:blackrock.canton`
- `mainnet:lei:784F5XWPLTWKTBV3E584`
- `mainnet:party-id:partyHint::1220abcd0000abcd0000abcd0000abcd0000abcd0000abcd0000abcd0000abcd0000`

The `<name>` component is opaque to this standard and interpreted only by the resolver. This lets any naming-system syntax — DNS dots, LEI codes, Party IDs with their `::` separators — embed without escaping.

#### 2.2 Network Discrimination

The `network` component is mandatory. TestNet names MUST NOT be confusable with MainNet names. Applications supporting multiple networks SHOULD display the network.

### 3. Rendering

#### 3.1 ASCII Rendering

The ASCII rendering of an FQPN is the FQPN string verbatim. It is the canonical machine-facing and copy-paste form.

#### 3.2 GUI Rendering

In graphical UIs, rendered names follow a shared convention: a source icon followed by the human-readable display name.

```
<icon> <display-name>
```

How the icon and the display name are determined is specified by each naming system's CIP (see Section 5). This CIP fixes only the convention: one icon identifying the source of the name, followed by the display name in the naming system's canonical form (e.g. `blackrock.com`, `blackrock.canton`, a truncated Party ID prefix).

Fallback chain when no name resolves for a party: CNS 1.0 entry → Party ID prefix → truncated Party ID.

Assets are not named by FQPNs. An instrument identified by the token standard's `InstrumentId {admin: Party, id: Text}` renders as `<symbol> by <admin-rendered-name>` (e.g. `CC by <cns icon> dso.cns`), where the symbol is published by the admin through its token-standard metadata endpoint (`/registry/metadata/v1/instruments/{id}`), discovered via the admin's credentials.

### 4. Resolution

#### 4.1 Resolver Operations

Every resolver exposes two operations over HTTPS, specified by the following OpenAPI definition so that name providers and consumers can act independently without pairwise coordination.

```yaml
openapi: 3.0.3
info:
  title: Canton Party Name Resolution API
  version: 0.1.0
paths:
  /v0/resolve:
    get:
      summary: Resolve a name to a Party ID
      parameters:
        - name: name
          in: query
          required: true
          schema: { type: string }
        - name: network
          in: query
          required: true
          schema: { type: string, enum: [mainnet, testnet, devnet, localnet] }
      responses:
        "200":
          description: Resolved
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ResolutionResult" }
        "404":
          description: Name not found
  /v0/reverse-resolve:
    get:
      summary: List the names this resolver knows for a Party ID
      parameters:
        - name: party
          in: query
          required: true
          schema: { type: string }
        - name: network
          in: query
          required: true
          schema: { type: string, enum: [mainnet, testnet, devnet, localnet] }
      responses:
        "200":
          description: Known names (possibly empty)
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/ResolutionResult" }
components:
  schemas:
    ResolutionResult:
      type: object
      required: [fqpn, party_id, display_name]
      properties:
        fqpn: { type: string }
        party_id: { type: string }
        display_name: { type: string }
        metadata: { type: object, additionalProperties: true }
        valid_until: { type: string, format: date-time }
```

Deployment, scaling, caching, and authentication are implementation-defined. A `ResolutionResult` whose `valid_until` has passed MUST be re-resolved before use.

#### 4.2 Forward Resolution

An application resolving a user-typed name matches it against each resolver in its configured, ordered list and returns the first successful result. Per-resolver ignore rules (patterns on the `<name>` component) MAY skip a resolver for matching names, addressing overlaps between resolvers when the application wants a specific delegation.

#### 4.3 The `party-id` Resolver (Built-in)

The `party-id` resolver is defined by this CIP and available on every network. Its `<name>` is the Canton Party ID verbatim; it resolves trivially and reverse-resolves any Party ID to itself. It guarantees that every Canton party always has at least one FQPN, before any name registration, with no external state and no trust beyond the Party ID itself.

#### 4.4 Preferred-Name Resolution (Reverse Direction)

Given a Party ID, an application computes the preferred FQPN to display:

1. Retrieve the party's preferred-name credential from the Credentials Registry: issuer = holder = the party, claim `cprp/preferred-name` (defined by this CIP).
2. Interpret the claim value as an FQPN and resolve it forward per Section 4.2, verifying it resolves back to the same Party ID. This round-trip verification prevents a party from claiming a name it does not hold.
3. If verified, display that name.
4. Otherwise, perform reverse resolution across the configured resolvers and select one result by the application's preference order — by default, lexicographic sort by (application priority override, user priority, application priority default).

### 5. Integrating Additional Naming Systems

New naming systems enter the Canton Network either by defining a new resolver or by extending an existing one, in each case via a dedicated CIP. Such a CIP MUST specify:

- The resolver identifier as it appears in FQPNs (or the existing resolver being extended). Resolver identifiers MUST be unique across CIPs; the CIP process itself acts as the registry of resolver identifiers.
- The `<name>` syntax the resolver accepts.
- The naming authority and the governance under which its registrars operate.
- The procedure by which name-to-Party-ID bindings are established and, where the underlying authority can change externally, the re-verification cadence.
- How the source icon and the display name are determined for GUI rendering (Section 3.2).
- The on-ledger credential encoding of name registrations, where the naming system provides one, using the CN Credentials Standard. On-ledger materialization is optional: names have ample value for display purposes alone; naming systems whose names must be referenced by Daml code materialize them as on-ledger credentials.

Registration credentials, where used, SHOULD carry at minimum the canonical FQPN, the network, and a validity horizon as claims. The claim-key prefix used by this CIP (`cprp/`) is a working prefix, to be renamed `cip-<nr>/` on number assignment.

### 6. Backward Compatibility

Additive. CNS 1.0 names are preserved and resolve under the `cns` resolver in their existing display form. Party IDs continue to work as they always have; the `party-id` resolver exposes them as FQPNs. Applications that do not adopt this CIP are unaffected.

## Rationale

### Alignment

This CIP aligns with the CNS 2.0 architecture proposed within the Canton Identity and Metadata Working Group and the direction converged over the May–August 2026 meetings.

### Why exactly these four concepts

Representation, resolution, rendering, and integration are what require network-wide agreement: two applications must parse the same FQPN, obtain the same binding, show the user a consistent picture, and let new naming systems plug in predictably. Everything else — deployment, scaling, economics, composition policies — can differ between implementations without harming interoperability, so this CIP leaves it free.

### Why an OpenAPI definition for the resolver interface

The wire interface is where providers and consumers meet: without a fixed API, every pairing requires coordination, which is precisely the cost standardization exists to remove. The API is deliberately minimal — two read-only operations — and everything behind it is implementation-defined.

### Why free-form `<name>`

Every naming system has its own syntax — DNS uses dots, LEI uses fixed-length codes, Party IDs use `::`. Normalizing them into a shared syntax either loses information or requires escaping that destroys readability. Ceding `<name>` syntax to each resolver puts the responsibility where the domain knowledge lives.

### Why three components and no registrar

A fourth `registrar` component was judged to solve no problem that could not be solved by governance credentials: registrar identity, lifecycle, and approval are per-naming-system governance concerns, and embedding them in the addressing format would complicate the format for no discovery benefit.

### Why first-match resolution and no composition

Name-selection UIs in the wild are always context-scoped; a single ordered resolver list with ignore rules covers them. Cross-source result composition was part of earlier drafts of this proposal and has been removed: it standardized behavior that applications can layer on privately if they need it, at the cost of a materially larger standard.

### Why round-trip verification for preferred names

A preferred-name claim is self-issued. Verifying that the claimed FQPN actually resolves back to the claiming party costs one forward resolution and eliminates the entire class of display-name spoofing via false preference claims.

### Prior art for icon-plus-name rendering

The `<icon> <display-name>` convention follows established block-explorer practice. Etherscan's transaction lists render known addresses as a source icon followed by a human-readable name in place of the raw hex — exchange tags, contract labels, and ENS names side by side in the same table — which has proven legible and spoof-resistant at scale:

![Etherscan transaction list: source icons and names (exchange tag, contract label, ENS name) rendered in place of raw addresses](etherscan-prior-art.png)

## Companion Documents

- CNS 2.0 CIP (Digital Asset) — the `cns` naming system, TLD registry, registrar governance, and registry economics.
- CN Credentials Standard CIP (Digital Asset, PR #204) — the credential registry that name registrations publish into.
- Party Profile Credentials CIP (PixelPlex, PR #169) — self-published party metadata claims used in rendering.
- CIP-56 amendment (Digital Asset) — off-ledger API endpoint discovery via CN Credentials.
- `.canton` CIP (Axymos, PR #209) — allocation and governance of the `.canton` name space.
