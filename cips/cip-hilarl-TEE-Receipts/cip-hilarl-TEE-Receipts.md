<pre>
  CIP: <to be assigned by editors>
  Title: TEE-Attested Compute Receipts
  Author: Hilal Agil <hilal@tenzro.com> (@hilarl)
  Status: Draft
  Type: Standards Track
  Layer: Daml
  Created: 2026-05-03
  License: Apache-2.0
  Requires: CIP-0056
</pre>

## Abstract

This CIP specifies a `meta`-key envelope and a registry-side
validation predicate for hardware-attested confidential-compute
receipts on CIP-56 transfer instructions. Four attestation families
are normatively supported: Intel TDX, AMD SEV-SNP, AWS Nitro
Enclaves, and NVIDIA Confidential Compute. The pattern lets a
holding transfer settle the proceeds of confidential compute
(inference, training, key custody, oracle work) such that the
registry can verify, in constant time at certification, that the
receipt was produced inside an attested enclave whose measurement
matches a registry-anchored allowlist.

This CIP is the fourth in a four-part stack: (A) Multi-VM CIP-56
Bridge Pattern; (B) AI Training & Inference Settlement; (C) Agentic
Identity & Mandate-Bound Payments; (D) the TEE-attested receipt
envelope specified here. CIP-B's optional `tenzro.network/ai.attestation`
key references receipts of the form specified by this CIP. The two
are independently mergeable.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in RFC 2119.

### 1. Roles

- **Provider** (`P`): the off-ledger compute operator running the
  TEE enclave.
- **Counterparty** (`C`): the Canton party whose holding transfer
  references the attestation receipt.
- **CIP-56 registry** (`R`): the on-Canton registry that the holding
  contract references, unchanged from CIP-56.
- **Vendor PCS** (`V`): the attestation provisioning certificate
  service operated by the silicon vendor (Intel SGX/TDX PCS, AMD
  KDS, AWS Nitro CA hierarchy, NVIDIA NRAS).
- **Allowlist** (`L`): the registry-anchored set of acceptable
  enclave measurements. `L` is operator-configured; this CIP
  specifies the format and the validation predicate, not the
  policy.

### 2. `meta`-key namespace

All keys defined by this CIP are reserved under the DNS subdomain
`tenzro.network/`:

| Key                                       | Type             | Required | Notes                                                                |
|-------------------------------------------|------------------|----------|----------------------------------------------------------------------|
| `tenzro.network/tee.kind`                 | text             | yes      | One of `tdx`, `sev_snp`, `nitro`, `nvidia_cc`.                       |
| `tenzro.network/tee.receipt_root`         | text (32-byte hex) | yes    | SHA-256 commitment over the receipt body (§3).                       |
| `tenzro.network/tee.receipt_codec`        | text             | yes      | One of `cbor`, `bincode`. Default `cbor`.                            |
| `tenzro.network/tee.receipt_uri`          | text             | yes      | Off-ledger location of the full receipt body.                        |
| `tenzro.network/tee.measurement`          | text (hex)       | yes      | Vendor-specific measurement digest (MRTD/MRENCLAVE/PCRs/etc.).       |
| `tenzro.network/tee.measurement_alg`      | text             | yes      | Hash algorithm of the measurement (`sha384`, `sha512`).              |
| `tenzro.network/tee.bound_payload`        | text (32-byte hex) | yes    | SHA-256 of the payload the attestation binds to (e.g., `receipt_root` of CIP-B). |
| `tenzro.network/tee.policy_root`          | text (32-byte hex) | yes    | SHA-256 commitment over the registry-anchored allowlist `L` at certification time. |
| `tenzro.network/tee.attestation_time`     | text (RFC 3339)  | yes      | Time the attestation was produced.                                   |
| `tenzro.network/tee.gpu_measurement`      | text (hex)       | OPTIONAL | For `nvidia_cc`, the GPU's per-device measurement (NVIDIA NRAS).     |

Implementations MUST NOT use a `tenzro.network/tee.*` key not listed
above. Future additions are reserved to this CIP and its successors.
Conformant validation predicates MUST treat unknown
`tenzro.network/tee.*` keys as a hard rejection in §5.

### 3. Receipt body

| Field                | Type           | Notes                                                                |
|----------------------|----------------|----------------------------------------------------------------------|
| `version`            | u8             | `1`.                                                                 |
| `kind`               | text           | One of the values listed in §2.                                      |
| `quote_bytes`        | bytes          | Vendor-native quote/report (§4 family-specific encoding).            |
| `cert_chain`         | array<bytes>   | DER-encoded X.509 chain from the vendor PCS to the leaf signing key. |
| `measurement`        | bytes          | Vendor-specific measurement digest (MRTD for TDX, etc.).             |
| `measurement_alg`    | text           | `sha384` or `sha512`.                                                |
| `bound_payload`      | bytes32        | The 32-byte payload the enclave bound into the quote.                |
| `attestation_time`   | text (RFC 3339)| Time the attestation was produced.                                   |
| `nonce`              | bytes          | Vendor-specific nonce/challenge for replay protection.               |

```
receipt_root = SHA-256(
  "tenzro/tee/receipt/v1" ‖
  cbor(ReceiptBody)
)
```

Implementations MAY substitute `bincode` for `cbor` if and only if
they set `tenzro.network/tee.receipt_codec` accordingly; the
domain-separation prefix MUST be preserved.

### 4. Family-specific quote encoding

Each TEE family has a vendor-defined quote/report format that this
CIP references rather than re-specifies:

#### 4.1 Intel TDX

`quote_bytes` is the TDX Quote v4 (or v5, where supported) produced
by `/dev/tdx-guest` (`TDREPORT` → QGS) per the Intel TDX DCAP
specification. For v4, the signature over `Quote[0..632]` is P-256
ECDSA by the Quoting Enclave (QE). For v5, the signature follows the
v5 quote layout per the Intel DCAP Quote Verification Library. The
`cert_chain` MUST include the QE identity certificate, the PCK leaf
certificate, and the chain to the Intel SGX Root CA. `measurement`
is `MRTD` (`sha384`).

#### 4.2 AMD SEV-SNP

`quote_bytes` is the attestation report from `/dev/sev-guest`
`SNP_GET_REPORT`. Signature is ECDSA P-384 by the VCEK. The
`cert_chain` MUST include the VCEK leaf, the AMD SEV-SNP ASK
intermediate, and the AMD SEV root (ARK). `measurement` is the
`MEASUREMENT` field (`sha384`).

#### 4.3 AWS Nitro Enclaves

`quote_bytes` is the COSE_Sign1 attestation document per the AWS
Nitro NSM specification. Signature is ECDSA P-384 (ES384) per RFC
9052 §4.4 (COSE structures and process; ES384 algorithm registered
in RFC 9053). RFC 9052 obsoletes RFC 8152. The `cert_chain` MUST
include the leaf, intermediates, and the AWS Nitro Enclaves Root
CA. `measurement` is the PCR0 value from the COSE payload
(`sha384`).

#### 4.4 NVIDIA Confidential Compute

`quote_bytes` is the NVIDIA NRAS attestation token (JWT). The
COSE-attested token contains a CPU-side TEE binding and per-GPU
measurements. `cert_chain` MUST include the chain to the NVIDIA
Attestation Root CA. `measurement` is the CPU-side TEE measurement;
`gpu_measurement` carries the per-GPU measurement.

### 5. Validation predicate (`R`)

A CIP-56 registry conformant with this CIP SHALL refuse to certify
a holding transfer instruction whose `meta` map contains any key
under `tenzro.network/tee.*` unless ALL of the following hold:

(a) `tenzro.network/tee.kind` is one of the enumerated values.

(b) The receipt body fetched from `tenzro.network/tee.receipt_uri`
    hashes to `tenzro.network/tee.receipt_root` per §3.

(c) The body's `cert_chain` chains up to the registry-anchored
    vendor root for the declared `kind` (Intel SGX Root CA / AMD ARK
    / AWS Nitro Root / NVIDIA Attestation Root).

(d) The signature over `quote_bytes` verifies under the leaf
    certificate's public key, per the family-specific signature
    algorithm in §4.

(e) The body's `measurement` (and `gpu_measurement` when
    `kind = nvidia_cc`) is in the registry's allowlist `L` at the
    time of certification, and the SHA-256 commitment of `L` equals
    `tenzro.network/tee.policy_root`.

(f) The body's `bound_payload` equals
    `tenzro.network/tee.bound_payload`. The 32-byte value is the
    payload the enclave bound into the quote and which the registry
    interprets as the off-ledger compute the enclave attested to.

(g) The body's `attestation_time` is within a registry-configured
    freshness window of the current ledger time. Recommended
    default: 24 hours for Nitro, 1 hour for TDX/SEV-SNP/NVIDIA.

If any predicate fails, `R` SHALL refuse to certify. The
`policy_root` in (e) ensures that the policy that was anchored at
certification time is recorded on-ledger; subsequent allowlist
changes do not retroactively invalidate certified transfers, and a
buyer can audit which policy version the registry applied.

### 6. Failure modes

| #  | Failure                                          | Resolution                                                                |
|----|--------------------------------------------------|---------------------------------------------------------------------------|
| F1 | Receipt URI unreachable                          | `R` SHALL refuse to certify until the URI resolves.                       |
| F2 | `receipt_root` mismatch with fetched body        | `R` SHALL refuse to certify; treat as forged.                             |
| F3 | Vendor cert chain does not anchor to root        | `R` SHALL refuse to certify; treat as forged or vendor-spoofed.           |
| F4 | Signature over `quote_bytes` fails to verify     | `R` SHALL refuse to certify; treat as forged.                             |
| F5 | Measurement not in allowlist `L`                 | `R` SHALL refuse to certify; the enclave was unrecognized.                |
| F6 | `bound_payload` mismatch with `meta` value       | `R` SHALL refuse to certify; the attestation does not bind to the claimed payload. |
| F7 | `attestation_time` outside freshness window      | `R` SHALL refuse to certify; `P` MUST regenerate the attestation.         |
| F8 | `policy_root` mismatch with registry's current `L` | `R` SHALL refuse to certify; `P` MUST regenerate against current `L`.   |
| F9 | NVIDIA NRAS token expired (>24h since issuance)  | `R` SHALL refuse to certify; vendor-mandated expiry per NRAS spec.        |

## Motivation

Three properties are required for confidential-compute revenue to
settle natively against CIP-56 holdings:

1. **Cryptographic binding to compute.** A holding transfer that
   pays for confidential compute must carry a cryptographic proof
   that the compute happened inside a known-good enclave. Without
   the binding, the registry has no way to distinguish a paid
   confidential-inference call from a generic memo field.

2. **Constant-time validation.** Vendor attestation chains and
   signature verification are expensive; a registry that re-derives
   them per transfer cannot maintain throughput. The
   `policy_root` and `receipt_root` commitments make the on-ledger
   `meta` check constant-time; the expensive verification can be
   batched off-ledger by `R` and recorded against the persistent
   `policy_root`.

3. **Auditability across allowlist changes.** Operators add and
   remove enclave measurements from the allowlist as silicon
   patches and microcode updates ship. A buyer who paid against a
   specific `policy_root` must be able to audit which allowlist
   version the registry used at certification time, even after
   the allowlist has changed.

Today, confidential-compute settlement on Canton either carries
attestation data in free-form `meta` keys with no validation, or
delegates trust to a per-vendor verification service whose
allowlist is opaque to buyers. This CIP fixes the key namespace,
the receipt structure, and the validation predicate, and exposes
the allowlist commitment for buyer-side audit.

## Rationale

### Why four families, not one

Intel TDX, AMD SEV-SNP, AWS Nitro Enclaves, and NVIDIA CC are the
four production-deployed confidential-compute platforms in 2026.
A single attestation envelope across all four lets a registry
service buyers regardless of which silicon `P` chose. The §4
family-specific encoding sections delegate to the vendor-defined
quote formats rather than reproducing them, which avoids drift
when the vendors revise their formats.

### Why bind to a payload digest, not the payload itself

The §5(f) `bound_payload` is the 32-byte value the enclave wrote
into its quote (e.g., the SGX `REPORT_DATA` field, the TDX
`USER_DATA` field, the Nitro `user_data` field). Implementations
MUST use a SHA-256 of the off-ledger compute payload (e.g., for
inference, the `receipt_root` from CIP-B). Embedding the payload
itself would inflate quote sizes and conflict with vendor field
limits.

### Why anchor `policy_root` on-ledger

Allowlists change. A buyer who pays for confidential inference
against `policy_root = X` must be able to retrieve, weeks later,
the allowlist that was in effect at certification. Storing the
allowlist's content-addressable commitment in `meta` makes that
retrieval auditable: anyone with `policy_root` can fetch the
matching allowlist body off-ledger and verify it hashes to the
on-ledger commitment.

### Why per-vendor freshness windows

Nitro attestation tokens have an explicit 24h validity window
encoded by AWS; TDX/SEV-SNP/NVIDIA are configurable but typically
re-attested per session. The §5(g) per-vendor defaults match the
operational practice of each platform.

### Why not embed the cert chain in `meta`

A typical TDX quote chain is ~6 KB; embedding it on-ledger would
inflate Canton storage costs. The chain lives in the off-ledger
receipt body, committed to via `receipt_root`. Registries that
verify chains per-receipt amortize the cost asynchronously.

## Backwards compatibility

This CIP introduces no changes to CIP-56, the DAML standard
library, the Canton protocol, or the Global Synchronizer. CIP-56
implementations unaware of this CIP transparently treat
`tenzro.network/tee.*` keys as opaque text per CIP-56's metadata
rules. Implementations that adopt the validation predicate in §5
add a registry-side certification gate without modifying any
holding-template or transfer-instruction interface.

The `meta`-key namespace is reserved under a DNS subdomain
controlled by the author per CIP-56's metadata convention, and
does not conflict with keys defined by other CIPs.

### Forward compatibility with CIP-112 v2 packages

The §3 receipt schema, the §4 family-specific encodings, and the
§5 validation predicate are independent of the CIP-56 template
version. When a synchronizer upgrades to the v2 packages defined
in CIP-112, the `meta`-map carriage in §2 and the validation
predicate in §5 apply unchanged.

### Composition with CIP-B

When a transfer instruction carries both `tenzro.network/ai.*`
keys (per CIP-B) and `tenzro.network/tee.*` keys (per this CIP),
the `tenzro.network/ai.attestation` value MUST equal the
`tenzro.network/tee.receipt_root` value, and the
`tenzro.network/tee.bound_payload` value MUST equal the
`tenzro.network/ai.receipt_root` value. This wires the two
commitments into a single bound chain: the AI receipt is bound
into the TEE quote, and the TEE receipt is referenced from the AI
`meta` namespace.

## Reference implementation

The pattern is implemented and operating on the Tenzro Network
testnet. Live endpoints (subset relevant to this CIP):

- JSON-RPC: `https://rpc.tenzro.network`
- Web API verification: `https://api.tenzro.network/verify/tee-attestation`
- MCP (TEE verify, ZK verify): `https://mcp.tenzro.network/mcp`
- Canton MCP: `https://canton-mcp.tenzro.network/mcp`

Source: [`tenzro/tenzro-network`](https://github.com/tenzro/tenzro-network).

| Component                      | Path                                                  | Role                                                                    |
|--------------------------------|-------------------------------------------------------|-------------------------------------------------------------------------|
| Attestation core               | `crates/tenzro-tee/src/attestation.rs`                | `AttestationVerifier`, P-256 / P-384 signature helpers, SPKI extraction.|
| Cert-chain verification        | `crates/tenzro-tee/src/certs.rs`                      | Pinned vendor root CAs; key-usage and validity-period checks.           |
| Intel TDX                      | `crates/tenzro-tee/src/intel_tdx.rs`                  | `/dev/tdx-guest` ioctl, TDREPORT → Quote pipeline, QE P-256 verification.|
| AMD SEV-SNP                    | `crates/tenzro-tee/src/amd_sev_snp.rs`                | `/dev/sev-guest` SNP_GET_REPORT, AMD KDS VCEK fetch, ARK→ASK→VCEK chain.|
| AWS Nitro Enclaves             | `crates/tenzro-tee/src/aws_nitro.rs`                  | NSM device, COSE_Sign1 ES384 verification per RFC 9052 §4.4 (RFC 9053 algorithm registration). |
| NVIDIA Confidential Compute    | `crates/tenzro-tee/src/nvidia_gpu.rs`                 | NVIDIA NRAS HTTP API, JWT verification, SPDM measurements.              |
| Detection / registry           | `crates/tenzro-tee/src/{detection,registry}.rs`       | Runtime detection via `detect_tee()`, simulation fallback, registry.    |
| Enclave encryption             | `crates/tenzro-tee/src/enclave_crypto.rs`             | Shared AES-256-GCM with HKDF-SHA256 key derivation per family.          |
| Web verification               | `crates/tenzro-node/src/web/server.rs` (`/verify/tee-attestation`) | HTTP endpoint that runs the §5 predicate.                  |
| Canton adapter                 | `crates/tenzro-bridge/src/canton.rs`                  | Submits CIP-56 transfer instructions with the `meta` map populated per §2.|

Conformance is defined by §2-§5 and is independent of the
implementation above.

## Security considerations

### Vendor root compromise

Predicate (c) anchors trust at the vendor root. If a vendor root
is compromised (e.g., signing-key theft at Intel/AMD/AWS/NVIDIA),
all chains under it become forgeable. Mitigations are out-of-band:
operators MUST monitor vendor security advisories and revoke
roots whose CRLs indicate compromise. Registries SHOULD support
emergency root rotation without code change (e.g., via a signed
config file).

### Allowlist staleness

The `policy_root` commits to the allowlist in effect at
certification, but operators have a window during which a newly-
discovered vulnerable measurement is still on the allowlist.
Operators SHOULD remove vulnerable measurements promptly; once
removed, transfers carrying that measurement will fail §5(e).
Transfers already certified against the prior `policy_root`
remain valid (which is the intended audit property), but the
counterparty SHOULD treat them as suspect and may dispute via
out-of-band mechanisms.

### Time-source divergence (freshness window)

§5(g) freshness uses the synchronizer's ordering time, not local
wall-clock. A registry that uses local wall-clock can admit or
reject inconsistently across operators. Implementations MUST use
synchronizer time for freshness evaluation.

### Bound-payload mismatch attack

A malicious `P` could attest to one payload and submit a different
payload's commitment in `meta`. §5(f) closes this by requiring
exact equality. A subtler attack is to attest to a hash that
matches the claimed payload but where the claimed payload itself
is malformed (e.g., not a valid CIP-B receipt). Mitigation is the
composition rule in §Backwards compatibility: when CIP-B and CIP-D
keys co-occur, the bidirectional binding closes the loop.

### Replay across nonces

Each TEE family encodes a quote nonce/challenge. The §3
`nonce` field carries the vendor-specific value; vendors require
freshness via the nonce, and the registry's freshness window
provides a second layer. Implementations MUST NOT reuse nonces
across receipts.

### NVIDIA NRAS centralization

NVIDIA NRAS is a vendor-operated REST API; a NRAS outage halts
nvidia_cc attestations network-wide. Operators MAY pre-fetch and
cache attestation tokens at acceptable freshness windows, but
MUST NOT cache beyond the 24h vendor-mandated expiry.

### Constant-time validation requires off-ledger work

§5's predicate refers to "the registry-anchored vendor root,"
"the allowlist," and "the receipt body." The on-ledger check is
constant-time, but the off-ledger fetch + verify is not.
Registries SHOULD verify asynchronously and reject
post-certification within a configurable window, provided they do
not release any holding state to `C` before verification
completes.

## Copyright

This CIP is licensed under the Apache License, Version 2.0
(https://www.apache.org/licenses/LICENSE-2.0).
