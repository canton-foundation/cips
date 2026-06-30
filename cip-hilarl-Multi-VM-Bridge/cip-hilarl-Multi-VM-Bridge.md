<pre>
  CIP: <to be assigned by editors>
  Title: Multi-VM CIP-56 Bridge Pattern
  Author: Hilal Agil <hilal@tenzro.com> (@hilarl)
  Status: Draft
  Type: Informational
  Created: 2026-05-02
  License: Apache-2.0
  Requires: CIP-0056
</pre>

## Abstract

This CIP describes a deterministic two-phase commit pattern by which a
non-Canton Layer-1 ledger (hereafter "external L1") settles holding transfers
against a CIP-56-compliant holding contract on a Canton synchronizer through
an attestation-based cross-chain messaging layer.

The pattern composes three existing primitives — (1) a CIP-56 holding
contract on Canton, unchanged; (2) an external-L1 lock/unlock primitive; and
(3) an attested cross-chain message — into a two-phase commit whose
atomicity matches the weaker of the two ledgers' finality properties.
Conformance is stated in terms of message attestation, source-finality, and
replay protection rather than a specific bridge transport.

This CIP introduces no changes to CIP-56, the DAML standard library, the
Canton protocol, or the Global Synchronizer. It composes existing primitives
and is filed as Informational.

This CIP is the first in a four-part stack of contributions filed by the
same author covering, in order: (A) the multi-VM bridge pattern specified
here; (B) decentralized AI training and inference settlement on Canton; (C)
agentic identity and mandate-bound payments on Canton; (D) TEE-attested
confidential compute receipts on Canton. Each is filed as a separate CIP
and may be reviewed independently.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in RFC 2119.

### 1. Roles

- **External L1**: any non-Canton ledger with deterministic finality and a
  programmable lock/unlock primitive (escrow, mint authority, or burn).
- **Source custodian** (`SC`): the party on the external L1 that holds locked
  funds during a pending bridge. SHOULD be a contract, not an EOA, on
  programmable L1s.
- **Cross-chain attestation layer** (`X`): an external transport whose
  messages carry independently-verifiable attestations of source-L1 events.
  This CIP does not name a specific transport; conformance is stated against
  abstract properties in §6.
- **Destination synchronizer custodian** (`DSC`): a Canton party with
  authority to create CIP-56 holding contracts on behalf of bridged balances.
- **Destination party** (`DP`): the Canton party that receives the bridged
  holding.
- **CIP-56 registry** (`R`): the on-Canton registry that the holding contract
  references, unchanged from CIP-56.

### 2. End-to-end transfer (external-L1 → Canton)

The transfer proceeds in two phases. Phase A is on the external L1; phase B
is on Canton. The messaging layer `X` carries a single attestation between
them.

#### Phase A — Source lock

A1. `DP` submits a lock transaction to the external L1 nominating an amount,
    a destination Canton party, and a CIP-56 instrument identifier.
A2. The external L1 transitions the funds to a state controlled by `SC` and
    emits an event whose contents are defined in §3 (Bridge-Lock event).
A3. The external L1 reaches finality for that block. "Finality" here means the
    block is past the L1's bounded-reorg horizon. Implementations MUST NOT
    proceed to phase B before this point.

#### Phase B — Destination two-step transfer

B1. `X` produces an attestation `M` over the Bridge-Lock event of A2. `M`
    MUST satisfy the conformance properties of §6.
B2. A relayer (which MAY be `DP`, `DSC`, or any third party — the protocol is
    permissionless) submits `M` to a verifying choice on a `DSC`-signed
    contract on Canton. Verification SHALL include all of:
    - signature/quorum verification of `M` per the messaging layer's rules,
    - replay-protection check (see §5),
    - source-L1 finality witness verification (§6 (c)).
    On verification success, `DSC` exercises the CIP-56 transfer-instruction
    factory to create a `TransferInstruction` with `sender = DSC`,
    `receiver = DP`, and the amount and instrument carried in `M`'s payload.
B3. `DP` accepts or rejects the transfer instruction per CIP-56 §FOP. The
    `DSC` MUST NOT exercise the receiver-side acceptance on `DP`'s behalf;
    that authority remains with `DP`.

#### Phase B' — Rejection / expiry path

B'.1. If `DP` rejects the `TransferInstruction`, or if the instruction
      expires per a CIP-56 timeout, the `DSC` SHALL emit a Bridge-Refund
      message of the schema in §3 back over `X`.
B'.2. The external L1's `SC` contract, upon receiving and verifying the
      Bridge-Refund attestation, SHALL release the locked funds back to the
      original lock-transaction signer.
B'.3. Implementations MUST guarantee that exactly one of {acceptance,
      refund} terminal states is reachable for any given Bridge-Lock event;
      see §5 for the replay-protection and idempotency requirements that
      enforce this.

### 3. End-to-end transfer (Canton → external-L1)

The mirror direction reuses the CIP-56 two-step transfer for the lock phase
on Canton, then unlocks on the external L1 via an attested message.

C1. `DP` (now acting as sender) creates a CIP-56 `TransferInstruction` with
    `receiver = DSC`. The destination address and chain identifier are
    carried in the instruction's `meta` field under DNS-prefixed keys:
    `tenzro.network/bridge.dest_chain_id` (decimal string) and
    `tenzro.network/bridge.dest_address` (hex-encoded bytes).
C2. `DSC` accepts the instruction, archiving the source `Holding` and
    creating an internal `BridgeLocked` contract observed by `R`.
C3. A relayer requests an attestation from `X` over the `BridgeLocked`
    creation event.
C4. The relayer submits the attestation to the external L1's `SC` contract,
    which verifies and either mints (for issuer-controlled tokens) or
    releases (for escrowed balances) to the destination address.
C5. If `SC` cannot complete the unlock (e.g., destination address rejects,
    minting paused), it emits a refund event; `DSC` upon receiving its
    attestation creates a new CIP-56 `TransferInstruction` returning the
    amount to `DP`.

### 4. Attestation payload schema

Implementations MUST define an unambiguous binary encoding of the
Bridge-Lock and Bridge-Refund payloads. The fields below are the minimum
required content; encodings MAY be ABI, SCALE, Borsh, or another
deterministic codec.

#### 4.1 Bridge-Lock payload

| Field                      | Type      | Notes                                              |
|----------------------------|-----------|----------------------------------------------------|
| `version`                  | u8        | Schema version; this document specifies `1`.       |
| `payload_type`             | u8        | `0x01` = Bridge-Lock, `0x02` = Bridge-Refund.      |
| `source_chain_id`          | u32       | Identifier of the external L1 within `X`.          |
| `source_lock_tx_hash`      | bytes32   | Hash of the lock transaction.                      |
| `source_block_number`      | u64       | Block height containing the lock event.            |
| `source_lock_nonce`        | u64       | Per-sender monotonic nonce on `SC`.                |
| `instrument_id`            | bytes32   | Hash of the CIP-56 `instrumentId` (registry-defined).|
| `amount`                   | u128      | Holding amount in instrument's smallest unit.      |
| `dest_synchronizer_id`     | bytes32   | Hash of the destination synchronizer ID.           |
| `dest_party_hash`          | bytes32   | Hash of the destination CIP-56 party identifier.   |
| `extra_payload_len`        | u32       | Length of optional `extra_payload` in bytes.       |
| `extra_payload`            | bytes     | Opaque application data; passed through unchanged. |

The `extra_payload` field above is part of the cross-chain wire format and
is distinct from the CIP-56 `meta` field on the destination
`TransferInstruction`. `DSC` MAY copy decoded keys from `extra_payload`
into the destination `TransferInstruction`'s `meta` map under the
`tenzro.network/bridge.*` namespace; doing so is not required for
conformance but is RECOMMENDED for auditability.

#### 4.2 Bridge-Refund payload

| Field                      | Type      | Notes                                              |
|----------------------------|-----------|----------------------------------------------------|
| `version`                  | u8        | Same versioning as §4.1.                           |
| `payload_type`             | u8        | `0x02`.                                            |
| `original_source_lock_tx_hash` | bytes32 | Lock tx hash being refunded.                       |
| `original_source_lock_nonce`   | u64    | Lock nonce being refunded.                         |
| `refund_reason`            | u8        | See §7 failure-modes table.                        |

### 5. Replay protection and idempotency

Replay protection MUST be enforced at three independent points:

- **External L1**: `SC` MUST track `(sender, source_lock_nonce)` tuples and
  reject re-submission of the same nonce. The lock transaction itself is
  protected by the L1's native nonce/sequence.
- **Cross-chain layer `X`**: `X` MUST provide a globally-unique message
  identifier (e.g., a sequence number per emitter). Verifying contracts on
  both sides MUST track a set of consumed message identifiers and reject
  duplicates.
- **Canton**: `DSC`'s verifying choice MUST use the
  `(source_chain_id, source_lock_tx_hash, source_lock_nonce)` tuple as the
  basis of its CIP-56 command-id (e.g., as a deterministic SHA-256 of the
  tuple), so that Canton's native command-id deduplication backs the
  application-layer replay set.

A conformant implementation SHALL guarantee that for any Bridge-Lock event,
the on-Canton side reaches at most one of {`Holding` created via
`TransferInstruction.accept`, refund attestation emitted}, and the
external-L1 side reaches at most one of {locked, released}. The four-way
product is reduced to two terminal pairs: (locked, accepted) and
(released, refunded).

### 6. Conformance properties of the cross-chain layer `X`

`X` MUST satisfy:

(a) **Independent attestation**. A relayer MUST be able to construct a
    proof of a source-L1 event whose validity can be verified by a
    destination-side smart contract or DAML choice without trusting the
    relayer.

(b) **Liveness independent of the source-L1 producer**. If the original lock
    submitter goes offline, any third party MUST be able to obtain the
    attestation and complete phase B.

(c) **Source-finality witness**. The attestation MUST either (i) commit to
    a source block past the L1's bounded-reorg horizon, or (ii) carry an
    explicit finality predicate (e.g., a threshold of independent
    observers) such that destination-side verification can refuse messages
    over non-final source state.

(d) **Replay-bound identifiers**. `X` MUST emit a globally-unique message
    identifier per attestation that destination-side verifiers can use as
    a replay-protection key (see §5).

(e) **Bounded liveness**. Implementations SHOULD configure a maximum
    waiting window (e.g., 24 hours) after which a relayer or `DP` MAY
    request a refund attestation; the exact bound is policy and not
    normative here.

The properties above are satisfied by, among others: Wormhole NTT (and
Wormhole's generic-messaging Core Bridge), IBC light-client proofs, and
zk-light-client bridges. The reference implementation in §10 uses Wormhole
NTT.

### 7. Failure modes

| #  | Failure                                | Phase | Resolution                                                               |
|----|----------------------------------------|-------|--------------------------------------------------------------------------|
| F1 | Lock tx mined but not finalized        | A     | Wait. Destination MUST refuse phase B before §2.A3 is satisfied.         |
| F2 | `X` fails to attest within bound       | A→B   | After the bounded liveness window in §6(e), `DP` MAY request refund.     |
| F3 | Malformed attestation payload          | B1    | `DSC` SHALL refuse exercise; no Canton state changes.                    |
| F4 | Destination party not allocated        | B2    | `DSC` SHALL emit Bridge-Refund with `refund_reason = 0x10`.              |
| F5 | `DP` rejects `TransferInstruction`     | B3    | `DSC` SHALL emit Bridge-Refund with `refund_reason = 0x11`.              |
| F6 | `TransferInstruction` expires          | B3    | `DSC` SHALL emit Bridge-Refund with `refund_reason = 0x12`.              |
| F7 | Double redeem attempt on `DSC`         | B2    | Replay set rejects (§5). Idempotent retry returns the prior contract id. |
| F8 | Destination synchronizer disconnects   | B2    | Wait or timeout per §6(e); refund as F2.                                 |
| F9 | Source-L1 censors unlock after refund  | B'    | Out of scope of this CIP; document as a residual risk in §11.            |
| F10| Observer set on `R` not quorate        | B2    | `DSC` SHALL refuse to exercise; treat as F8.                             |

## Motivation

CIP-56 defines holdings, transfer instructions, and the FOP / DvP transfer
flows on Canton. It is silent on participation by parties whose primary
balance lives on a non-Canton ledger. Existing wrapped-holding
implementations vary on:

1. Where source-finality is enforced.
2. How rollback is performed when the destination Canton transfer is
   rejected or expires.
3. Whether the bridged-holding contract surfaces the source-L1 attestation
   as a verifiable on-Canton observer, or treats the bridge custodian as
   an opaque trusted party.
4. How replay protection composes across the source-L1 transaction hash,
   the cross-chain message identifier, and the Canton command-id
   deduplication key.

Wallets and registry operators consequently cannot rely on a uniform set
of properties when accepting a holding contract whose backing asset is
bridged. This CIP documents one composition that yields deterministic
two-phase atomicity and explicit failure-mode handling, so conformant
implementations can be recognized and reasoned about uniformly.

## Rationale

### Why two-phase rather than one-shot mint-on-attestation

A common alternative is for `DSC` to skip the CIP-56 `TransferInstruction`
step and directly create a `Holding` on `DP` upon attestation receipt. This
reduces latency by one round-trip, but it violates CIP-56's
opt-in-on-receive principle: the destination party loses the ability to
reject an unwanted holding. Because CIP-56 already encodes two-step transfer
as the canonical FOP path, this CIP composes cleanly with it: phase B's `B2`
maps onto CIP-56's first step (`create TransferInstruction`) and `B3` onto
CIP-56's second (`accept` / `reject`). No new template or choice is required.

### Why an attestation-based messaging layer

CIP-56 itself is silent on bridging because Canton's intended cross-domain
mechanism is the Global Synchronizer's atomic cross-domain transfer
protocol. That protocol does not extend to non-Canton ledgers; for those, an
external transport is required. Among the choices —
threshold-attestation-based (Wormhole), oracle-network-based (CCIP),
relayer-and-DVN-based (LayerZero), light-client-proof-based (IBC) — the
properties in §6 are common to all. Specifying the pattern at that
abstraction layer rather than naming a single transport keeps the CIP
agnostic to the operator's risk-budget choice between attestation set,
oracle network, DVN configuration, or light-client soundness.

The reference implementation cited in §10 uses Wormhole NTT because of its
deployment maturity across the largest set of EVM, SVM, and Move-VM chains
relevant to enterprise CIP-56 deployments today, but a CCIP-, IBC-, or
zk-light-client-based implementation that meets §6 conforms equally well.

### Why expose `extra_payload` rather than embed bridge-specific fields

Different external L1s carry different envelope metadata (gas refund
addresses, intent identifiers, payment-protocol receipts). Rather than
extend §4.1 each time, the schema reserves an opaque `extra_payload` and
delegates its meaning to the application layer. Verifying choices on
Canton SHOULD treat unknown `extra_payload` as inert.

### Why nonce-based replay protection on `SC`

The `(sender, source_lock_nonce)` tuple is preferred over a hash of the
full lock event because it survives chain re-orgs that change the
event's position without changing its content. On L1s without per-sender
nonces (e.g., UTXO chains), implementations MAY substitute the lock
transaction's outpoint as the replay key.

## Backwards compatibility

This CIP introduces no changes to CIP-56, the DAML standard library, the
Canton protocol, or the Global Synchronizer. It composes existing
primitives. CIP-56 implementations that do not act as `DSC` for an
external L1 are unaffected. CIP-56 implementations that wish to
interoperate with this pattern need only register a `DSC` party and a
verifying contract; they do not need to change the holding-template or
registry interfaces.

The reference `meta` keys defined in §3 (`tenzro.network/bridge.*`) are
namespaced under a DNS subdomain controlled by the author per CIP-56's
metadata key convention, and do not conflict with keys defined by other
CIPs. Conformant `DSC` implementations operating in a different DNS
namespace MAY define analogous keys under their own subdomain.

### Forward compatibility with CIP-112 v2 packages

The pattern is specified against the v1 CIP-56 packages
(`splice-api-token-{holding,transfer-instruction}`). When a synchronizer
upgrades to the v2 packages defined in CIP-112
(`splice-api-token-{allocation-instruction,allocation-request,
allocation-allocation,holding,transfer-instruction}-v2`), the same `DSC`
flow applies: phase B's `B2` maps onto the v2 transfer-instruction
factory, and `B3` onto the v2 acceptance choice. The wire schema in §3
and the conformance properties in §6 are unchanged across the v1 → v2
package transition.

## Reference implementation

The pattern is implemented and operating on the Tenzro Network testnet,
which composes the EVM, SVM, and DAML runtimes against a single `DSC`
adapter targeting a CIP-56 holding template. Live endpoints:

- JSON-RPC: `https://rpc.tenzro.network`
- Web API: `https://api.tenzro.network`
- Canton MCP: `https://canton-mcp.tenzro.network/mcp`
- LayerZero MCP: `https://layerzero-mcp.tenzro.network/mcp`
- Chainlink MCP: `https://chainlink-mcp.tenzro.network/mcp`

Source: [`tenzro/tenzro-network`](https://github.com/tenzro/tenzro-network).

| Component | Path | Role |
|---|---|---|
| Canton adapter | `crates/tenzro-bridge/src/canton.rs` | `DSC` drive via Canton 3.4+ JSON Ledger API v2 (`/v2/commands/submit-and-wait-for-transaction`). |
| Wormhole adapter | `crates/tenzro-bridge/src/wormhole.rs` | Attestation emit/verify paths over Wormhole NTT. |
| CIP-56 holding | `crates/tenzro-vm/src/daml/cip56.rs` | Worked example of `DSC`'s holding-creation choice and the `meta`-map population for the bridge keys defined in §3. |
| Bridge router | `crates/tenzro-bridge/src/router.rs` | Strategy selection (cost / speed / availability) across LayerZero V2, Chainlink CCIP, deBridge DLN, Li.Fi, Wormhole NTT, and Canton. |

Conformance is defined by §2-§7 and is independent of the implementation
above. In particular, implementers SHOULD NOT depend on Tenzro's choice
of party-to-address mapping
(`SHA-256("tenzro-daml-party:" || party)`) or its 18-decimal amount
precision; both are permissible local choices.

## Security considerations

### Source-L1 reorgs

If `DSC` exercises phase B before the source block is past the L1's
bounded-reorg horizon, a reorg can invalidate the lock event after the
`Holding` has already been delivered. §2.A3 and §6(c) together require
implementations to refuse phase B until source finality. Implementations
SHOULD treat the source-finality predicate as a configuration parameter and
default it to the conservative bound of the L1 in question (e.g., 32 slots
on Solana; ≥12 blocks past Casper-FFG justification on Ethereum mainnet).

### Cross-chain attestation set collusion

If a threshold of `X`'s attestors collude, they can forge a Bridge-Lock
attestation for an event that did not occur, causing `DSC` to mint a
`Holding` against no real source lock. The risk is bounded by the
attestation layer's threshold and by the value at risk per `DSC`. Operators
SHOULD bound `DSC`'s mint authority per unit time to the value the
attestation layer can underwrite via slashing or insurance.

### CIP-56 observer set collusion

If the registry's observer set fails to act when the holding contract
violates registry rules, the bridged holding may diverge from the source
balance. This risk is inherited from CIP-56 itself and is not introduced by
this pattern; mitigations are the same as for any CIP-56 deployment.

### Party allocation race

Between `B1` (attestation arrives) and `B2` (`DSC` exercises), the
destination party `DP` could be deallocated, archived, or have its hosting
participant disconnected. F4 in §7 addresses this by mandating a
Bridge-Refund. Implementers SHOULD allow `DSC` to retry exercise for a
configurable window before emitting refund, to avoid spurious refunds during
brief participant disconnections.

### Source-L1 censorship of unlock

Once a Bridge-Refund attestation is emitted, the source L1 must accept the
unlock. If the source L1 censors the unlock transaction, funds remain
locked. This is residual risk inherent to non-Canton L1 participation and
is out of scope of this CIP. Implementers SHOULD document the censorship
resistance properties of their chosen source L1 in user-facing
documentation.

### Replay across schema versions

A future schema version (`version = 2`) MUST NOT collide with
`version = 1` payloads in a way that allows a `version = 1` lock to be
replayed as a `version = 2` lock. Implementations SHOULD include
`version` in the replay-protection key tuple defined in §5.

### Long-tail liveness

If `X` becomes permanently unavailable mid-flight, a Bridge-Lock can be
stranded. §6(e)'s bounded-liveness window is the operational mitigation;
beyond it, implementations SHOULD provide an out-of-band recovery
procedure (e.g., a multi-party refund authorized by the registry's
governance set).

## Copyright

This CIP is licensed under the Apache License, Version 2.0
(https://www.apache.org/licenses/LICENSE-2.0).
