<pre>
  CIP: <to be assigned by editors>
  Title: Agentic Identity & Mandate-Bound Payments
  Author: Hilal Agil <hilal@tenzro.com> (@hilarl)
  Status: Draft
  Type: Standards Track
  Layer: Daml
  Created: 2026-05-03
  License: Apache-2.0
  Requires: CIP-0056
</pre>

## Abstract

This CIP specifies how decentralized-identifier (DID) controlled
agents — both human-controlled and machine-controlled — bind to
Canton parties, and how an agent's payment mandate is carried in the
`meta` field of CIP-56 transfer instructions so that registries can
validate mandate-bound transfers at certification time. Three
mechanisms are specified: (1) a deterministic DID → Canton-party
mapping; (2) a `meta`-key envelope for carrying intent-mandate and
cart-mandate commitments on holding transfers; (3) a registry-side
validation predicate that enforces the mandate's spending ceilings
before admitting a transfer.

This CIP is the third in a four-part stack: (A) Multi-VM CIP-56
Bridge Pattern; (B) AI Training & Inference Settlement; (C) the
agentic identity and mandate-bound payments specified here; (D)
TEE-Attested Confidential Compute Receipts. Each is independently
mergeable.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in RFC 2119.

### 1. Roles

- **Principal** (`Pr`): the human or machine identity that holds the
  DID. For machine identities, `Pr` carries a `controller_did`
  pointing to the human that delegated authority.
- **Agent party** (`Ap`): the Canton party derived from `Pr`'s DID
  per §2. `Ap` is the party that signs the CIP-56 transfer
  instruction.
- **Counterparty** (`Cp`): the Canton party that receives the
  holding (the merchant in a payment, the provider in a service
  call).
- **Mandate issuer** (`MI`): the system that issued the mandate to
  `Pr`. For human-issued mandates, `MI = Pr`. For agent-platform
  mandates (e.g., AP2-style hosted agents), `MI` is the platform's
  signing key.
- **CIP-56 registry** (`R`): the on-Canton registry that the holding
  contract references, unchanged from CIP-56.

### 2. DID → Canton-party mapping

The Canton party for a DID-controlled agent SHALL be derived as:

```
party_hint = SHA-256("tenzro/agentic/party/v1" ‖ utf-8(did_string))
party_id   = registry-allocated party with the above hint as its
             allocation hint, per the Canton Admin API party-allocation
             call.
```

The `did_string` form is opaque to this CIP. Implementations SHALL
support at least the following DID methods:

- `did:tenzro:human:{uuid}` (TDIP human identity)
- `did:tenzro:machine:{controller}:{uuid}` (TDIP delegated machine)
- `did:tenzro:machine:{uuid}` (TDIP autonomous machine)
- `did:pdis:guardian:{uuid}` (PDIS-1 backward-compat)
- `did:pdis:agent:{controller}:{uuid}` (PDIS-2 backward-compat)
- `did:web:*` (per W3C DID Core 1.1, Candidate Recommendation 5 March 2026)
- `did:key:*` (per W3C DID Core 1.1, Candidate Recommendation 5 March 2026)

Additional DID methods MAY be supported. The `did_string` MUST be the
canonical W3C DID form (DID Core 1.1: lowercase scheme, no fragments, no query) so
that the SHA-256 input is deterministic across implementations.

### 3. `meta`-key namespace

All keys defined by this CIP are reserved under the DNS subdomain
`tenzro.network/`:

| Key                                            | Type             | Required for                | Notes                                                   |
|------------------------------------------------|------------------|-----------------------------|---------------------------------------------------------|
| `tenzro.network/agent.principal_did`           | text             | both                        | The DID string of `Pr`.                                 |
| `tenzro.network/agent.controller_did`          | text             | machine principals          | The DID of the controller that delegated authority.     |
| `tenzro.network/agent.delegation_root`         | text (32-byte hex) | machine principals        | SHA-256 of the canonical delegation-scope encoding (§4).|
| `tenzro.network/agent.intent_mandate_root`     | text (32-byte hex) | mandate-bound transfers   | SHA-256 of the canonical IntentMandate encoding (§5.1). |
| `tenzro.network/agent.cart_mandate_root`       | text (32-byte hex) | mandate-bound transfers   | SHA-256 of the canonical CartMandate encoding (§5.2).   |
| `tenzro.network/agent.mandate_issuer`          | text             | mandate-bound transfers     | DID of `MI`.                                            |
| `tenzro.network/agent.mandate_signature`       | text (hex)       | mandate-bound transfers     | Detached Ed25519 signature over `cart_mandate_root` by `MI`'s key. |
| `tenzro.network/agent.mandate_uri`             | text             | mandate-bound transfers     | Off-ledger location of the full mandate body.           |
| `tenzro.network/agent.spending_window_start`   | text (RFC 3339)  | mandate-bound transfers     | Lower bound of the mandate's validity window.           |
| `tenzro.network/agent.spending_window_end`     | text (RFC 3339)  | mandate-bound transfers     | Upper bound of the mandate's validity window.           |

Implementations MUST NOT use a `tenzro.network/agent.*` key not listed
above. Future additions are reserved to this CIP and its successors.
Conformant validation predicates MUST treat unknown
`tenzro.network/agent.*` keys as a hard rejection in §6.

### 4. Delegation scope

The delegation scope binds a machine principal to a controller and
constrains what the machine MAY do on the controller's behalf.

| Field                          | Type             | Notes                                                       |
|--------------------------------|------------------|-------------------------------------------------------------|
| `version`                      | u8               | This CIP specifies `1`.                                     |
| `principal_did`                | text             | The machine's DID.                                          |
| `controller_did`               | text             | The controller's DID.                                       |
| `max_per_transaction`          | u128             | Per-transfer ceiling, in instrument's smallest unit.        |
| `max_daily_spend`              | u128             | Rolling-24h ceiling.                                        |
| `allowed_operations`           | array<text>      | Whitelist of operation tags (e.g., `transfer`, `swap`).     |
| `allowed_payment_protocols`    | array<text>      | Whitelist (e.g., `mpp`, `x402`, `ap2`, `direct`).           |
| `allowed_chains`               | array<text>      | CAIP-2 chain identifiers.                                   |
| `time_bound_start`             | text (RFC 3339) OPTIONAL | Lower bound of delegation validity.                 |
| `time_bound_end`               | text (RFC 3339) OPTIONAL | Upper bound of delegation validity.                 |

`delegation_root` is:

```
delegation_root = SHA-256(
  "tenzro/agentic/delegation/v1" ‖
  bincode(DelegationScope)
)
```

### 5. Mandates

This CIP specifies two-layer mandate carriage compatible with the
AP2 intent + cart pattern (Agent Payments Protocol; donated by
Google to the FIDO Alliance on 28 April 2026 as the basis for an
open industry standard). A registry MAY accept either layer
independently.

#### 5.1 IntentMandate

| Field                | Type             | Notes                                                       |
|----------------------|------------------|-------------------------------------------------------------|
| `version`            | u8               | `1`.                                                        |
| `principal_did`      | text             | DID of `Pr`.                                                |
| `description`        | text             | Free-form natural-language description of the intent.       |
| `item_set_root`      | bytes32          | Commitment over the canonical item-set the agent may purchase. |
| `max_amount`         | u128             | Aggregate spend ceiling across all carts under this intent. |
| `instrument_id_hash` | bytes32          | Hash of the CIP-56 `instrumentId` the mandate authorizes.   |
| `valid_from`         | text (RFC 3339)  | Lower bound of intent validity.                             |
| `valid_until`        | text (RFC 3339)  | Upper bound of intent validity.                             |

```
intent_mandate_root = SHA-256(
  "tenzro/agentic/intent-mandate/v1" ‖
  bincode(IntentMandate)
)
```

#### 5.2 CartMandate

A CartMandate is bound to an IntentMandate and pins the specific
purchase the agent is about to commit to.

| Field                  | Type             | Notes                                                       |
|------------------------|------------------|-------------------------------------------------------------|
| `version`              | u8               | `1`.                                                        |
| `intent_mandate_root`  | bytes32          | The intent this cart belongs to.                            |
| `counterparty_did`     | text             | DID of `Cp`.                                                |
| `cart_items_root`      | bytes32          | Commitment over the line-items in the cart.                 |
| `total_amount`         | u128             | Total transfer amount.                                      |
| `instrument_id_hash`   | bytes32          | Hash of the CIP-56 `instrumentId` (MUST match IntentMandate).|
| `nonce`                | bytes32          | Per-cart unique identifier.                                 |
| `expires_at`           | text (RFC 3339)  | Cart validity expires at this instant.                      |

```
cart_mandate_root = SHA-256(
  "tenzro/agentic/cart-mandate/v1" ‖
  bincode(CartMandate)
)
```

The `mandate_signature` key in §3 is the detached Ed25519 signature
of `cart_mandate_root` by `MI`'s signing key. Multi-signature schemes
(e.g., MPC threshold signatures) MAY be used by encoding the
aggregated signature in the same field.

### 6. Validation predicate (`R`)

A CIP-56 registry conformant with this CIP SHALL refuse to certify a
holding transfer instruction whose `meta` map contains any key under
`tenzro.network/agent.*` unless ALL of the following hold:

(a) `tenzro.network/agent.principal_did` resolves under §2 to the
    party that signed the transfer instruction.

(b) If `tenzro.network/agent.controller_did` is present:
    (i) `tenzro.network/agent.delegation_root` is also present;
    (ii) the delegation body fetched off-ledger hashes to
         `delegation_root` per §4;
    (iii) the body's `principal_did` and `controller_did` match the
          two `meta` keys;
    (iv) the body's `time_bound_*` constraints, if present, contain
         the current ledger time;
    (v) the transfer's amount does not exceed the body's
        `max_per_transaction`;
    (vi) the registry's running 24-hour spend total for `Pr`,
         including this transfer, does not exceed `max_daily_spend`.

(c) If `tenzro.network/agent.intent_mandate_root` is present:
    (i) the intent-mandate body fetched off-ledger hashes to that
        value;
    (ii) the body's `valid_from`-to-`valid_until` window contains
         the current ledger time;
    (iii) the transfer's amount, plus the registry's running total of
          settled transfers under the same `intent_mandate_root`,
          does not exceed `max_amount`;
    (iv) the transfer's `instrumentId`, hashed, equals the body's
         `instrument_id_hash`.

(d) If `tenzro.network/agent.cart_mandate_root` is present:
    (i) the cart-mandate body fetched off-ledger hashes to that
        value;
    (ii) the body's `intent_mandate_root` matches the value in §6(c);
    (iii) the body's `counterparty_did` resolves to `Cp` per §2;
    (iv) `tenzro.network/agent.mandate_signature` is a valid Ed25519
         signature of `cart_mandate_root` by the public key bound to
         the DID in `tenzro.network/agent.mandate_issuer`;
    (v) the body's `expires_at` is in the future relative to the
        current ledger time;
    (vi) the body's `nonce` has not been observed by the registry on
         a previous certified transfer.

(e) The cart's `total_amount` equals the transfer instruction's
    amount.

If any predicate fails, `R` SHALL refuse to certify. The cart `nonce`
in §6(d)(vi) MUST be persisted by `R` after certification so that the
same cart cannot be re-spent.

### 7. Failure modes

| #  | Failure                                         | Resolution                                                                |
|----|-------------------------------------------------|---------------------------------------------------------------------------|
| F1 | DID resolution fails                            | `R` SHALL refuse to certify; treat as unknown principal.                  |
| F2 | Delegation-scope expiry                         | `R` SHALL refuse to certify; `Pr` MUST issue a fresh delegation.          |
| F3 | Per-transaction ceiling exceeded                | `R` SHALL refuse to certify; the transfer is malformed.                   |
| F4 | Daily-spend ceiling exceeded                    | `R` SHALL refuse to certify; counter resets at the next 24h boundary.     |
| F5 | Intent-mandate aggregate ceiling exceeded       | `R` SHALL refuse to certify; principal MUST issue a fresh intent.         |
| F6 | Cart expired                                    | `R` SHALL refuse to certify; principal MUST re-mint the cart.             |
| F7 | Cart nonce replay                               | `R` SHALL refuse to certify; the second submission is treated as a replay. |
| F8 | Mandate signature invalid                       | `R` SHALL refuse to certify; the transfer is treated as forged.           |
| F9 | Counterparty DID mismatch                       | `R` SHALL refuse to certify; the cart was bound to a different recipient. |

## Motivation

Three properties are required for agent-driven payments to settle
natively against CIP-56 holdings:

1. **Deterministic principal binding.** A holding transfer must
   identify which DID-controlled principal authorized it, distinct
   from the Canton party that signed it. For machine principals,
   the holding must also identify the controller and the delegation
   under which the machine is acting. CIP-56's signer-only model
   does not capture this distinction.

2. **Mandate-bound amount ceilings.** Agent payments are bounded
   by an off-ledger mandate (an intent or a cart) that the
   principal issued. The registry must verify the mandate's
   ceilings at certification time, otherwise a compromised or
   buggy agent can drain funds it nominally has permission to spend.

3. **Replay protection across mandates.** A cart mandate is a
   single-use authorization. The registry must persist the cart
   nonce so that the same cart cannot be re-spent against a
   refilled holding.

Today, agent-driven payments on Canton either bypass the mandate
layer (settling at the trusted-agent level only) or carry mandate
metadata in free-form `meta` keys with no registry-side validation.
The result is that registries cannot apply a single validation
predicate across agent platforms. This CIP fixes the key namespace,
specifies the mandate structure, and defines the validation
predicate.

## Rationale

### Why DID-derived parties

Two properties motivated the §2 derivation:

- **Determinism.** Two implementations must derive the same Canton
  party hint from the same DID, otherwise the principal binding in
  §6(a) is unverifiable across registries.
- **Hint-based, not direct.** The Canton Admin API takes party
  allocation hints, not raw party identifiers; the actual party id
  is allocated by the participant. The §2 derivation produces a
  hint, not the party id, and the binding from hint to party id is
  validated by the participant at allocation time.

### Why intent + cart, not a single mandate

The intent mandate authorizes a class of purchases over a window;
the cart mandate authorizes one specific purchase. Collapsing them
into one structure either (a) over-restricts the agent (every
purchase requires a fresh principal-side signature) or
(b) under-restricts (a single mandate authorizes unbounded
purchases). The two-layer pattern matches the standard agentic-commerce
flow: principal pre-authorizes an intent; agent constructs and
counter-signs a cart per purchase.

### Why off-ledger mandate bodies

The cart mandate carries the line-item details that registries do
not need (and often must not see) at certification time. Embedding
the full body in `meta` would inflate Canton storage costs and
conflict with the privacy expectations of agentic-commerce.

### Why `mandate_signature` is mandated

The `delegation_root` proves that the controller authorized the
machine principal in general; it does not prove that the controller
authorized this specific cart. The `mandate_signature` over
`cart_mandate_root` closes that gap. Without it, a malicious agent
holding a valid delegation could forge cart bodies and cite a
delegation that nominally permits the spend.

### Why replay protection on cart nonce, not signature

Using the signature itself as the replay key would force the
registry to persist signatures, which leak the principal's Ed25519
public key to anyone who reads the registry's replay set. The cart
nonce is a per-cart random value with no cryptographic linkage to
the principal's key, so persisting it is privacy-preserving.

## Backwards compatibility

This CIP introduces no changes to CIP-56, the DAML standard library,
the Canton protocol, or the Global Synchronizer. CIP-56
implementations unaware of this CIP transparently treat
`tenzro.network/agent.*` keys as opaque text per CIP-56's metadata
rules. Implementations that adopt the validation predicate in §6 add
a registry-side certification gate without modifying any
holding-template or transfer-instruction interface.

The `meta`-key namespace is reserved under a DNS subdomain
controlled by the author per CIP-56's metadata convention, and does
not conflict with keys defined by other CIPs.

### Forward compatibility with CIP-112 v2 packages

The §2 derivation, the §5 mandate schemas, and the §6 validation
predicate are independent of the CIP-56 template version. When a
synchronizer upgrades to the v2 packages defined in CIP-112
(`splice-api-token-{transfer-instruction,allocation-instruction,
allocation-request,allocation-allocation,holding}-v2`), the
`meta`-map carriage in §3 and the validation predicate in §6 apply
unchanged. Allocation-flow settlement (CIP-112 allocations) MAY use
the same `meta` keys when a CIP-56 allocation is the settlement
primitive instead of a transfer-instruction.

## Reference implementation

The pattern is implemented and operating on the Tenzro Network
testnet. Live endpoints (subset relevant to this CIP):

- JSON-RPC: `https://rpc.tenzro.network`
- Web API: `https://api.tenzro.network`
- A2A (DID-bound agent protocol): `https://a2a.tenzro.network`
- MCP (193 tools incl. mandate operations):
  `https://mcp.tenzro.network/mcp`
- Canton MCP: `https://canton-mcp.tenzro.network/mcp`

Source: [`tenzro/tenzro-network`](https://github.com/tenzro/tenzro-network).

| Component                     | Path                                                  | Role                                                                       |
|-------------------------------|-------------------------------------------------------|----------------------------------------------------------------------------|
| TDIP DIDs                     | `crates/tenzro-identity/src/{did,identity,document}.rs` | DID parsing, identity records, W3C DID Document export.                  |
| Verifiable credentials        | `crates/tenzro-identity/src/credential.rs`            | W3C VCDM 2.0 (Recommendation 15 May 2025) issuance, inheritance, verification, trust-chain traversal. |
| Delegation scope              | `crates/tenzro-identity/src/delegation.rs`            | `DelegationScope`, `enforce_operation`, ceilings.                          |
| Identity registry             | `crates/tenzro-identity/src/registry.rs`              | Thread-safe identity store with cascading revocation.                      |
| AP2 mandate validator         | `crates/tenzro-payments/src/ap2/mod.rs`               | `IntentMandate`, `CartMandate`, validate-with-delegation-and-policy path. AP2 is stewarded by the FIDO Alliance (since 28 April 2026). |
| Payment-identity binder       | `crates/tenzro-payments/src/identity_binding.rs`      | Two-axis ceiling (DelegationScope + runtime SpendingPolicy).               |
| Spending-policy resolver      | `crates/tenzro-node/src/spending_policy_bridge.rs`    | Bridges agent-runtime spending policy into the payment-identity binder.    |
| Canton adapter                | `crates/tenzro-bridge/src/canton.rs`                  | Submits CIP-56 transfer instructions with the `meta` map populated per §3. |

Conformance is defined by §2-§6 and is independent of the
implementation above.

## Security considerations

### DID-resolver substitution

§6(a) requires resolving `principal_did` to a Canton party. A
malicious DID resolver can return a party hint that points at a
party the attacker controls. Registries MUST pin the DID-resolution
backend they trust (e.g., a specific tenzro-identity registry, a
specific did:web HTTPS endpoint with certificate pinning) and MUST
NOT accept arbitrary did:* methods without explicit operator
opt-in.

### Delegation-scope freshness

Persisting a delegation locally on the registry is a cache; the
canonical delegation lives at the principal's DID document. A
revocation between cache write and §6(b) check creates a window
where revoked delegations still authorize transfers. Registries
SHOULD subscribe to revocation events from the principal's DID
controller and MUST NOT cache delegations beyond a configurable
TTL (e.g., 5 minutes).

### Mandate-issuer key compromise

If `MI`'s signing key is compromised, all mandates signed by that
key become attacker-issued. Mandate issuers SHOULD use threshold
signatures (e.g., 2-of-3 MPC) for high-value mandates and SHOULD
rotate the signing key periodically. Registries MAY enforce a
maximum cumulative spend per signing key per epoch.

### Cart-nonce collision

A 32-byte random nonce has negligible collision probability under
correct sampling. An implementation that uses a counter or a weak
RNG can produce colliding nonces and trigger spurious §6(d)(vi)
rejections. Implementations MUST use a CSPRNG for nonce generation.

### Time-source divergence

§6 references "current ledger time" for window checks. A registry
that uses local wall-clock time can disagree with another
registry's time and admit or reject transfers inconsistently.
Registries MUST use the synchronizer's ordering time for window
evaluation, not local wall-clock time.

### Privacy of mandate metadata

The `mandate_uri` MAY point at HTTPS or IPFS. If the URI is HTTPS,
the registry's fetch reveals the principal's DID to the URI host.
Implementations SHOULD prefer content-addressable transports
(IPFS) or use an oblivious fetch mechanism (PIR, blind retrieval)
when DID-to-URI linkage is sensitive.

### Mandate signature replay across `instrumentId`s

The cart mandate binds to a specific `instrument_id_hash` in §5.2.
Without this binding, a single mandate could authorize spends
across instruments — e.g., a USD-stablecoin mandate would also
authorize a TNZO transfer. The §6(c)(iv) check rejects such
mismatches.

## Copyright

This CIP is licensed under the Apache License, Version 2.0
(https://www.apache.org/licenses/LICENSE-2.0).
