<pre>
  CIP: <to be assigned by editors>
  Title: AI Training & Inference Settlement
  Author: Hilal Agil <hilal@tenzro.com> (@hilarl)
  Status: Draft
  Type: Standards Track
  Layer: Daml
  Created: 2026-05-03
  License: Apache-2.0
  Requires: CIP-0056
</pre>

## Abstract

This CIP specifies how the outputs of decentralized AI training runs and
the receipts of AI inference calls SHALL be carried in the `meta` field
of CIP-56 transfer instructions and allocations, so that AI compute can
settle natively against CIP-56 holdings. Two settlement patterns are
specified: (1) **training-run settlement** against a `TrainingReceipt`
that commits to a multi-round outer-gradient aggregation; (2)
**inference settlement** against an `InferenceReceipt` that commits to a
specific provider response. Both patterns leave CIP-56's holding,
transfer-instruction, and allocation templates unchanged and add
normative requirements only on `meta`-key encoding and registry-side
validation predicates.

This CIP is the second in a four-part stack: (A) Multi-VM CIP-56 Bridge
Pattern; (B) the AI training and inference settlement pattern specified
here; (C) Agentic Identity & Mandate-Bound Payments; (D) TEE-Attested
Confidential Compute Receipts. CIP-D specifies the attestation-receipt
envelope that this CIP's `tenzro.network/ai.attestation` key references;
the two are independently mergeable.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in RFC 2119.

### 1. Roles

- **Task buyer** (`B`): the Canton party that commissions and pays for
  AI compute.
- **Compute provider** (`P`): the Canton party that performs training
  rounds or inference calls.
- **Aggregator** (`A`): for training, the party that collects per-worker
  fragments and produces the outer-gradient commitment for a sync round.
  MAY be the same as `P` for single-worker fine-tunes.
- **CIP-56 registry** (`R`): the on-Canton registry that the holding
  contract references, unchanged from CIP-56.

### 2. `meta`-key namespace

All keys defined by this CIP are reserved under the DNS subdomain
`tenzro.network/`. The following keys are normative:

| Key                                       | Type           | Required for             | Notes                                                   |
|-------------------------------------------|----------------|--------------------------|---------------------------------------------------------|
| `tenzro.network/ai.kind`                  | text           | both                     | One of `training`, `inference`.                         |
| `tenzro.network/ai.task_id`               | text (32-byte hex) | both                 | Deterministic identifier of the task spec; see §3.      |
| `tenzro.network/ai.receipt_root`          | text (32-byte hex) | both                 | SHA-256 commitment over the receipt body (see §4, §5).  |
| `tenzro.network/ai.receipt_codec`         | text           | both                     | One of `bincode`, `cbor`, `json`. Default `bincode`.    |
| `tenzro.network/ai.receipt_uri`           | text           | both                     | Off-ledger location of the full receipt body (e.g., IPFS, HTTPS). |
| `tenzro.network/ai.modality`              | text           | inference                | One of `chat`, `forecast`, `vision_embed`, `vision_similarity`, `text_embed`, `segment`, `detect`, `transcribe`, `video_embed`. |
| `tenzro.network/ai.model_id`              | text           | inference                | Provider-namespaced model identifier (e.g., `org/model:tag`). |
| `tenzro.network/ai.attestation`           | text (32-byte hex) | OPTIONAL              | SHA-256 of a TEE attestation receipt as defined in CIP-D. |
| `tenzro.network/ai.aggregation_rule`      | text           | training                 | One of `mean`, `trimmed_mean`, `coordinate_median`, `krum`. |
| `tenzro.network/ai.run_root`              | text (32-byte hex) | training              | Root over per-round state commitments; see §4.2.        |

Implementations MUST NOT use a `tenzro.network/ai.*` key not listed
above. Future additions are reserved to this CIP and its successors.
Conformant validation predicates MUST treat unknown
`tenzro.network/ai.*` keys as a hard rejection in §6.

### 3. Task identifier

`task_id` is computed as:

```
task_id = SHA-256(
  "tenzro/ai/task/v1" ‖
  ai.kind                          (utf-8) ‖
  buyer_party_hash                 (32 bytes; SHA-256 of the CIP-56 party id) ‖
  provider_party_hash              (32 bytes) ‖
  modality                         (utf-8, or empty for training) ‖
  model_id                         (utf-8, or empty for training) ‖
  task_spec_root                   (32 bytes)
)
```

`task_spec_root` is the SHA-256 of the canonical encoding of the task
specification body. For training, the body is a `TrainingTaskSpec`
(§4.1). For inference, the body is an `InferenceTaskSpec` (§5.1). The
canonical encoding is the codec named in
`tenzro.network/ai.receipt_codec`.

### 4. Training receipt

#### 4.1 `TrainingTaskSpec`

| Field                | Type             | Notes                                                              |
|----------------------|------------------|--------------------------------------------------------------------|
| `version`            | u8               | This CIP specifies `1`.                                            |
| `architecture`       | text             | Free-form architecture identifier (e.g., `timesfm-2.5-200m`).      |
| `inner_steps`        | u32              | Inner SGD steps per sync round, per worker.                        |
| `sync_rounds`        | u32              | Total outer rounds in the run.                                     |
| `aggregation_rule`   | u8               | `0x01` mean, `0x02` trimmed-mean, `0x03` coord-median, `0x04` Krum. |
| `outer_optimizer`    | bytes            | Opaque encoding of the outer-optimizer config (§4.3).              |
| `data_commitment`    | bytes32          | Commitment to the training data spec; opaque to this CIP.          |
| `min_workers`        | u32              | Minimum workers for a round to count.                              |
| `max_workers`        | u32              | Maximum workers admitted per round.                                |
| `bond_amount`        | u128             | Per-worker stake bond, in instrument's smallest unit.              |

#### 4.2 `TrainingReceipt`

| Field                | Type             | Notes                                                              |
|----------------------|------------------|--------------------------------------------------------------------|
| `version`            | u8               | `1`.                                                               |
| `task_id`            | bytes32          | As §3.                                                             |
| `round_state_roots`  | array<bytes32>   | Per-round state commitments; see `compute_state_root` in §4.4.     |
| `run_root`           | bytes32          | `compute_run_root(round_state_roots)`; see §4.4.                   |
| `final_round`        | u32              | Index of the final committed round.                                |
| `worker_set_root`    | bytes32          | Commitment over the set of workers credited in any round.          |
| `attestation_hash`   | bytes32 OPTIONAL | SHA-256 of the TEE attestation receipt for the aggregator (CIP-D). |

#### 4.3 Outer optimizer

A conformant implementation MUST support Nesterov SGD with the encoding:

```
outer_optimizer = SHA-256(
  "tenzro/ai/outer/nesterov-sgd/v1" ‖
  learning_rate_le_bytes (8) ‖
  momentum_le_bytes      (8) ‖
  nesterov_flag          (1)
)
```

Other outer-optimizer encodings MAY be defined under
`tenzro.network/ai.outer_optimizer.*` keys in future CIPs.

#### 4.4 Commitment computation

```
compute_state_root(round) = SHA-256(
  "tenzro/ai/round/v1" ‖
  round_index_le         (4) ‖
  outer_gradient_hash    (32) ‖
  worker_set_hash        (32) ‖
  fragment_count_le      (4)
)

compute_run_root(round_state_roots) =
  binary Merkle root over the round_state_roots array
  using SHA-256 with leaf domain separation tag "tenzro/ai/run-leaf/v1".
```

`outer_gradient_hash` is SHA-256 of the aggregated outer gradient bytes
in safetensors format; `worker_set_hash` is SHA-256 of the
sorted-by-party-id concatenation of per-round worker party hashes.

### 5. Inference receipt

#### 5.1 `InferenceTaskSpec`

| Field         | Type   | Notes                                                                 |
|---------------|--------|-----------------------------------------------------------------------|
| `version`     | u8     | `1`.                                                                  |
| `modality`    | text   | One of the values listed in §2 for `tenzro.network/ai.modality`.      |
| `model_id`    | text   | Provider-namespaced model identifier.                                 |
| `input_hash`  | bytes32| SHA-256 of the canonical input payload (codec per `receipt_codec`).   |
| `pricing_hash`| bytes32| SHA-256 of the pricing schedule used to bill the call.                |

#### 5.2 `InferenceReceipt`

| Field              | Type             | Notes                                                                 |
|--------------------|------------------|-----------------------------------------------------------------------|
| `version`          | u8               | `1`.                                                                  |
| `task_id`          | bytes32          | As §3.                                                                |
| `output_hash`      | bytes32          | SHA-256 of the canonical output payload.                              |
| `input_units`      | u64              | Modality-specific input metering (tokens, samples, frames, etc.).     |
| `output_units`     | u64              | Modality-specific output metering.                                    |
| `latency_ms`       | u64              | Wall-clock latency.                                                   |
| `attestation_hash` | bytes32 OPTIONAL | SHA-256 of the TEE attestation receipt for the provider (CIP-D).      |

`receipt_root` for inference is:

```
receipt_root = SHA-256(
  "tenzro/ai/inference-receipt/v1" ‖
  bincode(InferenceReceipt)
)
```

For training, `receipt_root` is:

```
receipt_root = SHA-256(
  "tenzro/ai/training-receipt/v1" ‖
  bincode(TrainingReceipt)
)
```

Implementations MAY substitute `cbor` or `json` for `bincode` if and
only if they set `tenzro.network/ai.receipt_codec` accordingly; the
domain-separation prefix and the order of fields above MUST be
preserved.

### 6. Validation predicate (`R`)

A CIP-56 registry conformant with this CIP SHALL refuse to certify a
holding transfer instruction whose `meta` map contains any key under
`tenzro.network/ai.*` unless ALL of the following hold:

(a) `tenzro.network/ai.kind` is one of `training` or `inference`.

(b) `tenzro.network/ai.task_id` is a 32-byte hex string and matches the
    SHA-256 derivation in §3 over the receipt body identified by
    `tenzro.network/ai.receipt_uri`.

(c) `tenzro.network/ai.receipt_root` matches the SHA-256 derivation in
    §5.2 (inference) or §4.2/§4.4 (training) over the receipt body
    fetched at `tenzro.network/ai.receipt_uri`.

(d) For `kind = inference`, `modality` is one of the enumerated values
    and `model_id` is non-empty.

(e) For `kind = training`, `aggregation_rule` is one of the enumerated
    values, `run_root` is a 32-byte hex string, and the receipt's
    `final_round + 1` equals the number of `round_state_roots`.

(f) If `tenzro.network/ai.attestation` is present, it is a 32-byte hex
    string and is independently verifiable per CIP-D (i.e., the
    attestation receipt body fetched off-ledger hashes to the value
    given here, and its inner attestation predicate verifies).

If any predicate fails, `R` SHALL refuse to admit the transfer
instruction; the Canton-side rejection mechanism is the existing
CIP-56 reject path and is unchanged by this CIP.

### 7. Failure modes

| #  | Failure                                              | Resolution                                                                |
|----|------------------------------------------------------|---------------------------------------------------------------------------|
| F1 | `receipt_uri` unreachable                            | `R` SHALL refuse to certify until the URI resolves; transfer instruction stays in pending state until CIP-56 timeout. |
| F2 | `receipt_root` mismatch with fetched body            | `R` SHALL refuse to certify; `B` MAY emit a CIP-56 reject and re-issue.   |
| F3 | `task_id` mismatch with derivation in §3             | `R` SHALL refuse to certify; treat as malformed.                          |
| F4 | `aggregation_rule` not in §4.1 enumeration           | `R` SHALL refuse to certify.                                              |
| F5 | `modality` not in §2 enumeration                     | `R` SHALL refuse to certify.                                              |
| F6 | `attestation_hash` present but verification fails    | `R` SHALL refuse to certify; the failure is auditable via the CIP-D body. |
| F7 | Round-count vs `final_round` invariant fails (§6e)   | `R` SHALL refuse to certify; the receipt is treated as malformed.         |
| F8 | Worker set below `min_workers` for any round         | `R` SHOULD refuse to certify; this is a policy choice and MAY be relaxed for permissive registries that accept partially-attended rounds. |

## Motivation

Three properties are required for AI compute to settle natively against
CIP-56 holdings:

1. **Deterministic billing primitive.** Inference is a metered
   transaction (input tokens/samples × output tokens/samples × unit
   price). Training is a milestone transaction (per-round bond release
   on commitment delivery). Both must reduce to a fixed-shape `meta`
   map that a registry validation predicate can check in constant time.

2. **Verifiable receipt.** Without a commitment that ties the holding
   transfer to a specific compute event, the bridged-AI-revenue case
   degenerates to a generic memo field. The `receipt_root` is the
   minimum content that lets `R` distinguish a paid inference call from
   an attacker replaying an old transfer instruction.

3. **Optional confidentiality.** TEE-attested compute is often the
   commercial requirement. The `attestation` key composes against
   CIP-D so that confidential inference can settle on Canton without
   revealing the input/output payload at the registry.

Today, ad-hoc settlement of AI-revenue holdings on Canton uses
free-form `meta` keys. The result is that a registry cannot apply a
single validation predicate across providers, and a buyer cannot
audit a holding transfer without out-of-band coordination with the
provider on key conventions. This CIP fixes the key namespace,
specifies the receipt structure, and defines the validation predicate.

## Rationale

### Why `meta` and not a new template

CIP-56 already encodes the holding, transfer-instruction, and
allocation flows that AI compute settlement needs. Adding a new
template would fork the CIP-56 surface and force every registry to
adopt a parallel certification path. Adding `meta` keys composes
cleanly: registries that do not understand `tenzro.network/ai.*`
ignore them per CIP-56's metadata rules; registries that do
understand them apply §6 and gain the validation predicate without
any DAML-package change.

### Why off-ledger receipt bodies

A `TrainingReceipt` for a 200-round run carries up to ~6 KB of
hashes; an `InferenceReceipt` is small but the input/output payloads
referenced by `input_hash` and `output_hash` are not. Embedding the
full bodies in `meta` would inflate Canton storage costs and conflict
with confidentiality requirements (TEE-attested inference must NOT
leak the input/output payload). The receipt body is therefore stored
off-ledger at `receipt_uri` and committed to via `receipt_root`.

### Why a fixed enumeration of aggregation rules

The aggregation rule determines the Byzantine-fault assumptions of
the training run. A registry that bills against a `TrainingReceipt`
must know which rule was used to know which fault assumption it is
underwriting. Allowing a free-form aggregation_rule field would let
a malicious aggregator claim Byzantine robustness it did not deliver.
The four enumerated rules cover the SOTA decentralized-training
literature in 2026 (mean / trimmed-mean / coordinate-median / Krum);
additions are reserved to future revisions of this CIP.

### Why a fixed enumeration of inference modalities

The metering semantics of `input_units` and `output_units` differ
across modalities (tokens for chat, samples for forecast, frames for
video). A registry validation predicate cannot infer the unit
without the modality field. The enumeration fixes the semantics for
the modalities currently shipped on Tenzro Network and is extensible
in future revisions.

### Why SHA-256 throughout

CIP-56 uses no hash primitive normatively; its `meta` field is
free-form text. SHA-256 was chosen here because it is universally
implementable on every Canton runtime and every off-ledger compute
provider, has no patent or licensing burden, and matches the hash
primitive used by the reference implementation. Implementations MAY
mirror these commitments under additional hash functions but MUST
publish the SHA-256 hash for `R`-side validation.

## Backwards compatibility

This CIP introduces no changes to CIP-56, the DAML standard library,
the Canton protocol, or the Global Synchronizer. CIP-56 implementations
unaware of this CIP transparently treat `tenzro.network/ai.*` keys as
opaque text per CIP-56's metadata rules. CIP-56 implementations that
adopt the validation predicate in §6 add a registry-side certification
gate without modifying any holding-template or transfer-instruction
interface.

The `meta`-key namespace is reserved under a DNS subdomain controlled
by the author per CIP-56's metadata convention, and does not conflict
with keys defined by other CIPs.

### Forward compatibility with CIP-112 v2 packages

The receipt schemas in §4 and §5 are independent of the CIP-56
template version. When a synchronizer upgrades to the v2 packages
defined in CIP-112 (`splice-api-token-{transfer-instruction,
allocation-instruction,allocation-request,allocation-allocation,
holding}-v2`), the `meta`-map carriage in §2 and the validation
predicate in §6 apply unchanged. Allocation-flow settlement (CIP-112
allocations) MAY use the same `meta` keys when a CIP-56 allocation is
the settlement primitive instead of a transfer-instruction.

## Reference implementation

The patterns are implemented and operating on the Tenzro Network
testnet. Live endpoints (subset relevant to this CIP):

- JSON-RPC: `https://rpc.tenzro.network`
- Web API: `https://api.tenzro.network`
- MCP (193 tools incl. inference, training, multi-modal AI):
  `https://mcp.tenzro.network/mcp`
- A2A (agentic AI compute): `https://a2a.tenzro.network`
- Canton MCP: `https://canton-mcp.tenzro.network/mcp`

Source: [`tenzro/tenzro-network`](https://github.com/tenzro/tenzro-network).

| Component                    | Path                                                  | Role                                                                        |
|------------------------------|-------------------------------------------------------|-----------------------------------------------------------------------------|
| Training protocol            | `crates/tenzro-training/src/runtime.rs`               | `SyncerState`, `FragmentBuffer`, `TrainingRuntime`.                         |
| Outer-gradient aggregation   | `crates/tenzro-training/src/aggregation.rs`           | `Aggregator` trait + 4 rules: mean, trimmed-mean, coord-median, Krum.       |
| Outer optimizer              | `crates/tenzro-training/src/outer_optimizer.rs`       | Nesterov SGD outer-loop encoding from §4.3.                                 |
| Run-root commitments         | `crates/tenzro-training/src/commitments.rs`           | `compute_state_root`, `compute_run_root`, `sync_round_signing_bytes`.       |
| Task / receipt types         | `crates/tenzro-types/src/training.rs`                 | `TrainingTaskSpec`, `TrainingReceipt`, `OuterGradient`, `Fragment`.         |
| Inference router             | `crates/tenzro-model/src/routing.rs`                  | Modality-aware dispatch; `InferenceRouter::route`.                          |
| Modality runtimes            | `crates/tenzro-model/src/{ts,vision,text_embedding,segmentation,detection,audio,video}_runtime.rs` | 7 ONNX-backed runtimes covering the modalities in §2. |
| Usage tracking               | `crates/tenzro-model/src/usage.rs`                    | `UsageTracker` records `input_units` / `output_units` per call.             |
| Settlement engine            | `crates/tenzro-settlement/src/engine.rs`              | Composes the holding-transfer flow that carries the `meta` keys in §2.      |
| Canton adapter               | `crates/tenzro-bridge/src/canton.rs`                  | Submits CIP-56 transfer instructions with the `meta` map populated per §2.  |

The reference Python trainer (PyTorch FSDP2 + Hivemind) lives at
`integrations/trainer/` and communicates with the Rust syncer over
JSON-RPC; per the architectural split, no tensor library is bundled
into the Rust workspace.

Conformance is defined by §2-§6 and is independent of the
implementation above.

## Security considerations

### Receipt-body availability

Because receipts live off-ledger, a provider can withhold the body
after the holding transfer is admitted. §6's `receipt_uri`-fetch
requirement makes the registry refuse to certify until the body is
reachable, but a provider that takes the body offline AFTER
certification can still degrade auditability. Registries SHOULD
require receipt bodies to be served from at least two independent
locations (e.g., HTTPS + IPFS) and SHOULD refuse certification when
the URI is single-homed.

### Aggregator collusion (training)

The aggregation rule constrains the Byzantine fraction the
aggregator must tolerate. A malicious aggregator can falsely claim
adherence to a stricter rule (e.g., reporting `aggregation_rule =
krum` while running mean). The `worker_set_root` in §4.2 binds the
receipt to a specific worker set; a buyer who recomputes the
aggregation locally over the same fragments can detect the
divergence. Registries SHOULD make the per-worker fragments
auditable on request, gated on the buyer's identity.

### Replay across runs

Two different training runs with identical hyperparameters and
identical worker sets MAY produce identical `TrainingTaskSpec`
encodings but distinct `data_commitment` values. The §3
`task_spec_root` derivation includes `data_commitment` so that
distinct runs over distinct data produce distinct `task_id`s. Buyers
MUST NOT reuse a `data_commitment` across runs, or the second
holding transfer becomes a replay of the first.

### Modality confusion

A provider MAY claim a different `modality` than the one the call
actually used (e.g., bill a `chat` call as `forecast` to exploit a
mispriced schedule). The `pricing_hash` in `InferenceTaskSpec` binds
the receipt to a specific pricing schedule, so a registry that
maintains a canonical pricing-schedule registry can detect
mismatched modalities by checking that the `pricing_hash` matches
the schedule for the claimed modality.

### Confidentiality and the `attestation` key

The optional `attestation_hash` lets the receipt body remain
encrypted at the provider while the holding transfer settles
publicly. The attestation MUST cover the receipt's bound input/output
hashes, otherwise a malicious TEE could attest to a benign
inference and substitute outputs after attestation. CIP-D specifies
the bound-payload requirement on TEE attestation receipts.

### Registry-side validation cost

§6's predicate requires fetching the off-ledger receipt body to
verify `receipt_root`. This can be a meaningful per-transfer cost
on a high-throughput registry. Registries MAY batch verification
asynchronously and reject post-certification within a configurable
window, provided they do not release any holding state to `B`
before verification completes.

## Copyright

This CIP is licensed under the Apache License, Version 2.0
(https://www.apache.org/licenses/LICENSE-2.0).
