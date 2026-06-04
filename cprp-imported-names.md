Number: CIP-ZZZZ

Title: Canton Imported Names — DNS, LEI/vLEI, ENS, and Cross-Chain Identity Sources

Status: Draft

Author: Paolo Domenighetti (Freename), [Co-authors TBD]

Created: 2026-05-28

## Abstract

This CIP defines how names from external naming systems — the Domain Name System (DNS), the Legal Entity Identifier registry (LEI/vLEI), the Ethereum Name Service (ENS), and other public identity sources — are imported into the Canton Network as verifiable credentials with declared trust tiers. It specifies, per import method, the verification procedure, the credential encoding, the trust tier produced under the framework defined in CIP-YYYY (Party Identity Verification), and the re-verification cadence.

This CIP does not define Canton-native naming (the `.canton` namespace and its registrars are specified in the `.canton` CIP, PR #209 from Axymos) and does not define the resolution interface or composition engine (specified in CIP-XXXX, Party Name Resolution). It defines only how external identity is brought into Canton with a verifiable trust signal.

## Motivation

Canton's institutional participants operate across jurisdictions with multiple, parallel identity regimes. A counterparty may be identified by its DNS-registered domain (`blackrock.com`), by its legal entity identifier (`549300HMQBIKME8LIL78`), by a verifiable LEI credential issued under the GLEIF infrastructure (a vLEI), by an Ethereum address or `.eth` name, or by a national or sectoral identifier. No single source is sufficient; no single source can be ignored.

The Identity and Metadata Working Group has agreed (April 9, 2026) to split this layer out as a dedicated CIP. The goals are to:

- Define a small, stable common pattern for importing external names so that adding a new source (e.g. national KYC registries) follows a predictable shape.
- Make the trust each import method produces explicit and uniform — every imported credential declares which tier of CIP-YYYY's framework it falls under.
- Ensure that imported names compose cleanly through CIP-XXXX with Canton-native names (e.g. `.canton`) without contention or duplicate machinery.

Without this CIP, every resolver would invent its own verification procedure and trust framing, and applications would have no consistent basis to compare credentials issued by different operators against different external sources.

## Specification

### 1. Scope

This CIP specifies the import of names from the following external sources:

- DNS — domain names registered through the Internet's public DNS system, with DNSSEC validation.
- LEI/vLEI — Legal Entity Identifiers, in both their unverified registry form (LEI) and their cryptographically verifiable form (vLEI), issued under GLEIF infrastructure.
- ENS — Ethereum Name Service names, particularly under the `.eth` top-level name.
- Cross-Chain Identity — Ethereum addresses and signatures, ENS-anchored claims, SWIFT BIC self-attestations, and extension points for other chains and registries.

This CIP does not specify the format of the Fully Qualified Party Name (FQPN), the resolver interface, the composition engine, or the on-ledger registration template; those are defined in CIP-XXXX. It does not specify the trust tier framework itself (T1–T4); that is defined in CIP-YYYY. It does not specify Canton-native naming or the `.canton` namespace; that is defined in the `.canton` CIP led by Axymos.

### 2. Common Import Pattern

Every import method specified in this CIP follows the same structural pattern:

1. Verification procedure — a deterministic, reproducible sequence of steps that establishes a binding between an external identity (e.g. a domain) and a Canton Party ID. The procedure MUST produce evidence sufficient for independent re-execution.
2. Credential encoding — a CN Credential where the publisher is the verifying resolver, the subject is the verified Canton party, and the holder is the verified Canton party. Claim keys follow the `cprp/*` namespace (see Section 7).
3. Declared trust tier — every imported credential carries a `cprp/trust-anchor` claim whose value (T1, T2, T3, or T4) is determined by the import method per this CIP, in conformance with the framework defined in CIP-YYYY.
4. Re-verification cadence — every import method declares a maximum age beyond which the credential MUST be re-verified and re-published.

Applications consuming imported credentials MUST treat the `cprp/trust-anchor` claim as authoritative for the credential's tier; they MUST NOT independently re-tier an imported credential.

### 3. DNS Verification

#### 3.1 Verified Binding

A Canton party with control over a DNS-registered domain MAY have that control attested to as a Canton credential. The verification establishes that the holder of a specific Canton Party ID also controls the named domain.

Procedure:

1. The party enables DNSSEC for the domain (validation of the DNSSEC chain from the root zone to the domain is a precondition to verification; non-DNSSEC chains fail).
2. The party publishes a TXT record at `_canton.<domain>` with the value `party=<party-id>` (where `<party-id>` is the full Canton Party ID, including its `::`-separated components, which are unambiguous in this context because the record value is a single string).
3. The verifying resolver fetches the TXT record through DNSSEC-validated resolution, confirms the `party=` value matches the claimed Party ID, and publishes the credential.

The TXT record MAY carry additional `;`-separated key-value attributes (e.g. `verified-by=<resolver-name>;valid-until=<timestamp>`); only the `party=` attribute is normative.

#### 3.2 Phase 1: Featured-Resolver Quorum (T3)

Initial deployment defines DNS verification as a quorum operation executed by featured resolvers (resolvers granted T3 issuer status under the registry specified in CIP-YYYY). Each featured resolver independently performs the verification procedure of Section 3.1 and publishes its own credential. The composition engine of CIP-XXXX combines these into a single result; an application's verification policy MAY require a minimum count of agreeing featured-resolver credentials to accept the DNS binding.

This phase does not require any change to the Splice software stack or to the Super Validator (SV) node software. It ships with the existing featured-resolver mechanism.

#### 3.3 Phase 2: SV Consensus (T1) — deferred

A future enhancement, deferred from this CIP, would extend the SV node software to perform DNS verification directly, with the DSO publishing a single T1 `CnsDnsClaim` credential reflecting SV consensus. That enhancement requires Splice changes and is out of scope for this version.

#### 3.4 Credential Encoding

```
publisher : <verifying-resolver-party>
subject   : <verified-canton-party>
holder    : <verified-canton-party>
claims    : {
  "cprp/trust-anchor"       : "T3",
  "cprp/source"             : "dns",
  "cprp/registrar"          : "<domain>",
  "cprp/verification-method": "dnssec-txt",
  "cprp/verified-at"        : "<ISO-8601-timestamp>",
  "cprp/valid-until"        : "<ISO-8601-timestamp>"
}
```

#### 3.5 Re-Verification

A DNS credential MUST be re-verified at most every 7 days. The verifying resolver SHOULD subscribe to the domain's DNSSEC notifications where available and re-verify on change. A credential past its `cprp/valid-until` MUST be treated as expired by composition (CIP-XXXX) and trust evaluation (CIP-YYYY).

### 4. LEI / vLEI Verification

#### 4.1 LEI (Unverified Registry Lookup, T4)

A self-attested claim that a Canton party is associated with a given LEI MAY be published with no verification, as a T4 credential. This is informational only; consumers SHOULD NOT treat an unverified LEI claim as authoritative.

#### 4.2 vLEI (Verifiable LEI, T2)

A vLEI is a cryptographically verifiable credential issued under the GLEIF infrastructure by a Qualified vLEI Issuer (QVI). vLEI verification establishes that the holder of a specific Canton Party ID is the same legal entity identified by a given LEI, with the legal name attested by a QVI.

Procedure:

1. The party presents a vLEI credential (Legal Entity vLEI or Official Organizational Role vLEI) to the verifying resolver, cryptographically bound to its Canton Party ID.
2. The verifying resolver queries the GLEIF API at `api.gleif.org` (or its successor) to confirm: (a) the LEI is in `ACTIVE` status; (b) the legal name in the vLEI matches the GLEIF record; (c) the issuing QVI is on the GLEIF list of trusted vLEI issuers.
3. The verifying resolver publishes the credential at T2.

The publishing resolver itself MUST hold T3 status to issue T2 vLEI credentials, per CIP-YYYY. The T2 tier reflects the trust authority of GLEIF and the QVI, not of the intermediary resolver — the intermediary's role is to conduct a faithful verification and bind it to a Canton Party ID.

#### 4.3 Credential Encoding

```
publisher : <verifying-resolver-party>
subject   : <verified-canton-party>
holder    : <verified-canton-party>
claims    : {
  "cprp/trust-anchor"       : "T2",
  "cprp/source"             : "vlei",
  "cprp/registrar"          : "<LEI>",
  "cprp/lei-status"         : "ACTIVE",
  "cprp/legal-name"         : "<legal-entity-name>",
  "cprp/qvi"                : "<QVI-identifier>",
  "cprp/verification-method": "gleif-api",
  "cprp/verified-at"        : "<ISO-8601-timestamp>",
  "cprp/valid-until"        : "<ISO-8601-timestamp>"
}
```

#### 4.4 Re-Verification

A vLEI credential MUST be re-verified at most every 30 days. If GLEIF reports a status change (LEI lapsed, retired, or revoked), the verifying resolver MUST archive the credential within 24 hours of detecting the change.

### 5. ENS Verification

#### 5.1 Verified Binding

An ENS name (typically under `.eth`) is bound to a Canton Party ID by an ENS TXT record. Procedure:

1. The party sets a TXT record on its ENS name with key `canton-party` and value `<party-id>`.
2. The verifying resolver reads the record through the ENS Public Resolver (or successor), verifies the signature trail from the `.eth` registry to the record, and publishes the credential.

ENS verification produces a T3 credential when issued by a featured resolver.

#### 5.2 Credential Encoding

```
publisher : <verifying-resolver-party>
subject   : <verified-canton-party>
holder    : <verified-canton-party>
claims    : {
  "cprp/trust-anchor"       : "T3",
  "cprp/source"             : "ens",
  "cprp/registrar"          : "<ens-name>",
  "cprp/verification-method": "ens-txt",
  "cprp/verified-at"        : "<ISO-8601-timestamp>",
  "cprp/valid-until"        : "<ISO-8601-timestamp>"
}
```

#### 5.3 Re-Verification

An ENS credential MUST be re-verified at most every 14 days.

### 6. Cross-Chain Identity

#### 6.1 Overview

Canton parties operating across Canton, Ethereum, and traditional financial messaging systems benefit from explicit, verifiable links between their identities in each system. This CIP specifies the import patterns for three such links; further chains and registries may be added by future CIPs following the common pattern of Section 2.

#### 6.2 Ethereum Signature Linking (T3)

A Canton party links itself to an Ethereum address by signing its Canton Party ID with the private key of the Ethereum address. Procedure:

1. The party constructs a canonical message `link-canton-party:<party-id>:<chain-id>:<nonce>` and signs it with the Ethereum private key.
2. The verifying resolver recovers the Ethereum address from the signature, confirms it matches the claimed address, and publishes the credential at T3.

#### 6.3 ENS Cross-Chain Anchoring (T3)

Where an Ethereum address is itself bound to an ENS name, the ENS verification of Section 5 produces a cross-chain identity link automatically — the same credential establishes both the ENS binding and the Ethereum-address binding.

#### 6.4 SWIFT BIC Self-Attestation (T4)

A Canton party MAY self-attest to a SWIFT Business Identifier Code. This is T4 (self-attested); consumers SHOULD NOT treat it as authoritative without out-of-band verification. A future CIP may define a higher-tier verified-BIC procedure when a suitable verifying infrastructure exists.

#### 6.5 Credential Encoding (cross-chain)

```
publisher : <verifying-resolver-party> (or <subject> for self-attestation)
subject   : <verified-canton-party>
holder    : <verified-canton-party>
claims    : {
  "cprp/trust-anchor"        : "<tier>",
  "cprp/source"              : "<eth | ens-cross-chain | swift | ...>",
  "cprp/external-identifier" : "<address | ens-name | BIC | ...>",
  "cprp/chain-id"            : "<chain-id>",
  "cprp/verification-method" : "<signature | ens-txt | self-attested>",
  "cprp/verified-at"         : "<ISO-8601-timestamp>",
  "cprp/valid-until"         : "<ISO-8601-timestamp>"
}
```

### 7. Common Claim Keys

The following claim keys are common across all import methods specified in this CIP. Their values are interpreted by CIP-XXXX composition and CIP-YYYY trust evaluation.

| Claim Key | Value | Notes |
|-----------|-------|-------|
| `cprp/trust-anchor` | `T1` / `T2` / `T3` / `T4` | Declared per method per this CIP |
| `cprp/source` | `dns` / `vlei` / `lei` / `ens` / `eth` / `swift` / ... | The external system |
| `cprp/registrar` | The external identifier in its registrar (e.g. domain, LEI) | Maps to the FQPN registrar component |
| `cprp/verification-method` | `dnssec-txt` / `gleif-api` / `ens-txt` / `signature` / ... | Identifies the exact procedure used |
| `cprp/verified-at` | ISO-8601 timestamp | When verification last succeeded |
| `cprp/valid-until` | ISO-8601 timestamp | After which the credential MUST be re-verified |

Method-specific keys (e.g. `cprp/legal-name`, `cprp/qvi`, `cprp/external-identifier`) are defined in their respective sections above.

### 8. Architectural Alignment

- This CIP consumes the trust tier framework defined in CIP-YYYY (Party Identity Verification). Every credential it specifies declares its tier under that framework.
- This CIP produces credentials that are consumed by the resolver interface and composition engine defined in CIP-XXXX (Party Name Resolution). The FQPN format `<network>;<resolver>;<registrar>;<name>` is defined in CIP-XXXX; imported names populate the `<resolver>` and `<registrar>` slots per Section 7 above.
- This CIP is complementary to the `.canton` CIP (Axymos, PR #209), which defines Canton-native naming. Imported names and `.canton` names coexist in the composition result; the consuming application's resolution strategy decides which to display.
- Verification of imported names is conducted by resolvers granted T3 featured status under the registry specified in CIP-YYYY. This CIP does not define the featured-resolver governance; it only declares which methods produce which tier when executed by a featured resolver.

### 9. Backward Compatibility

This CIP is additive. Existing DNS, LEI, GLEIF, and ENS infrastructure is used as-is; no changes are required outside the Canton Network. Existing CNS 1.0 names (`name.unverified.cns`) are unaffected — they remain self-registered and unverified until a party additionally undergoes verification under this CIP.

A party MAY hold multiple imported credentials (e.g. a DNS-verified binding to `acme.com` and a vLEI-verified binding to its LEI) simultaneously; CIP-XXXX composition merges them and CIP-YYYY trust evaluation reflects the combined trust path.

## Rationale

### Why per-source flows

The verification semantics of DNS, vLEI, and ENS differ in substance, not just in syntax. DNSSEC chains, GLEIF status checks, and on-chain signature recovery have different threat models, different revocation profiles, and different failure modes. A single abstract "import" procedure would either be too loose (leaving each operator to fill in critical details) or too rigid (forcing one source's discipline onto another). Per-source specifications, sharing a common pattern, give implementers precise targets while keeping the overall system coherent.

### Why phased DNS verification

Featured-resolver quorum (T3) ships without any change to the Super Validator stack and produces a credible binding immediately. SV consensus DNS verification (T1) is materially stronger but requires Splice changes and broader operator participation. Phasing avoids the worst tradeoff (waiting on the strongest mechanism to enable any DNS verification at all) and gives the network a graceful upgrade path: a Phase-2 T1 credential can supersede a Phase-1 T3 credential for the same binding without breaking composition.

### Why T2 for vLEI and T3 for DNS

GLEIF is a regulated identity authority whose attestations carry external legal weight. The vLEI tier reflects that external authority, not the intermediary resolver that conducts the verification. DNS, by contrast, attests to control of a domain but not to legal identity behind that domain; a domain registrant's legal identity is established by other means. T3 for DNS reflects credible control of a public identifier without further legal binding.

### Why a separate CIP

Resolution (CIP-XXXX), trust framework (CIP-YYYY), and import methods (this CIP) are independently useful and independently evolvable. New import methods (e.g. national KYC registries, additional chains) extend this CIP without touching resolution or trust. New resolvers using existing methods extend CIP-XXXX without touching this CIP. Decoupling allows each to evolve at its own pace.

## Companion CIPs

- CIP-XXXX (Party Name Resolution) — defines the FQPN format, resolver interface, composition engine, and display model that consume imported credentials.
- CIP-YYYY (Party Identity Verification) — defines the trust tier framework (T1–T4), the trust evaluator, verification policies, and the featured-resolver registry under which import methods operate.
- `.canton` CIP (Axymos, PR #209) — defines the Canton-native `.canton` namespace, its registrars, and its allocation policy. Complementary to this CIP.
