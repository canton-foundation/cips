Number: CIP-ZZZZ

Title: Canton Imported Names — Decentralized DNS Name Importer and Blueprint for External Name Systems

Status: Draft

Author: Paolo Domenighetti (Freename), [Co-authors TBD]

Created: 2026-08-23

## Abstract

This CIP defines how names from external naming systems are imported into the Canton Network as on-ledger credentials that Daml code can reference. It specifies the DNS-verified name importer in full — covering the verification procedure, the on-ledger credential encoding, and the re-verification cadence — and establishes this pattern as the blueprint for future importers targeting LEI/vLEI, ENS, email, and other external systems.

This CIP aligns with the Canton Party Name Resolution Standard (companion CIP) for the FQPN format, the resolver interface, and the display conventions. It aligns with the CNS 2.0 CIP (Digital Asset) for the on-ledger registry infrastructure and DSO governance. It follows the direction confirmed by Simon Meier at the WG meeting of July 9, 2026: the import model (materializing external names as on-ledger credentials) is the required approach when the imported names must be referenced by Daml code.

Advanced verification semantics (a formal T1–T4 trust framework, application-configurable verification policies) are deferred to future work.

## Motivation

Canton's institutional participants operate across jurisdictions with multiple parallel identity regimes: domain names registered through DNS, legal entities identified by GLEIF LEIs, cryptographic identities via Ethereum and ENS, financial-messaging identifiers via SWIFT. A Canton counterparty typically has one or more of these external identities, and applications benefit from resolving them to Canton Party IDs with verifiable evidence of the binding.

The Working Group has agreed (April 9, 2026) to a dedicated CIP for external-name imports, separate from the general resolution mechanics and separate from the Canton-native `.canton` allocation (Axymos's CIP). The goals of this CIP:

- Specify DNS import fully — verification, credentialing, cadence — as the reference implementation.
- Establish the shared structure so that additional importers (LEI/vLEI, ENS, email, SWIFT, further chains) can be specified in follow-up CIPs without reinventing the pattern.
- Anchor the import model on Canton as the source of truth for imported names, so that Daml code and on-ledger workflows can reference them.

This CIP does not define the FQPN format, the resolver interface, or the display conventions (specified in the Canton Party Name Resolution Standard). It does not define the CN Credentials Registry (specified in the CN Credentials Standard CIP). It does not define `.canton` allocation (specified in the `.canton` CIP led by Axymos).

## Specification

### 1. Scope

This CIP specifies the DNS-verified name importer as a fully-detailed reference implementation, and provides guidelines for additional importers to follow the same pattern. The importers in scope for future companion CIPs, following this blueprint:

- LEI / vLEI (GLEIF-verified legal entity identifiers)
- ENS (Ethereum Name Service names, particularly under `.eth`)
- Email / DKIM
- SWIFT BIC codes
- Additional chain-native naming systems

Each future importer is a separate CIP that inherits the structure defined here and specifies its own verification procedure.

### 2. Common Import Pattern

Every importer specified as a companion CIP under this blueprint follows the same structure:

1. Verification procedure. A deterministic, reproducible sequence of steps that establishes a binding between an external identity and a Canton Party ID.
2. Credential encoding. A standard CN Credential (publisher = the importer registrar, subject = the verified Canton party, holder = the verified Canton party). Import-specific claim keys are namespaced under `cprp/`.
3. Import model. External names are materialized as on-ledger credentials so that Daml code can reference them (per the July 9, 2026 WG direction). Bridge / reference patterns without on-ledger materialization are permissible only for read-only or private cases where no Daml logic touches the name.
4. Re-verification cadence. Every importer declares a maximum age beyond which a credential MUST be re-verified. Cadence reflects the volatility of the external source.
5. Registrar operation. The importer is operated by one or more registrars approved through the DSO governance defined by the CNS 2.0 CIP. A single external system may have multiple approved registrars (for scale, redundancy, or geographic distribution); the DSO may designate a Decentralized Registry Operator (DRO) for shared external-system imports where uniqueness across registrars is required.

### 3. DNS-Verified Name Importer

#### 3.1 Purpose

Establish that the holder of a specific Canton Party ID controls a specific DNS-registered domain, and publish the binding as an on-ledger credential resolvable via the `dns` resolver.

#### 3.2 Verification Procedure

1. Precondition: DNSSEC is enabled for the domain. Chains that cannot be validated to the DNS root under DNSSEC fail this step.
2. The party publishes a TXT record at `_canton.<domain>` with value `party=<party-id>`. Additional attributes MAY be included as `key=value` pairs separated by whitespace; only the `party=` attribute is normative.
3. One or more importer registrars fetch the TXT record through DNSSEC-validated resolution, confirm the `party=` value matches the claimed Canton Party ID, and publish the credential on-ledger.

For DNS specifically, the Working Group has discussed operating the importer as a shared Decentralized Registry Operator built on the SV attestor infrastructure (referenced by Simon Meier as "BitSafe's decentralization manager" in the CNS 2.0 next-steps presentation). Multiple attestors independently execute the verification procedure and jointly publish the credential, providing decentralization for the DNS TLD imports where a single trusted operator would be inappropriate.

#### 3.3 Credential Encoding

```
publisher : <importer-registrar-party>
subject   : <verified-canton-party>
holder    : <verified-canton-party>
claims    : {
  "cprp/fqpn"               : "<network>:dns:<domain>",
  "cprp/network"            : "<network>",
  "cprp/source"             : "dns",
  "cprp/verification-method": "dnssec-txt",
  "cprp/verified-at"        : "<ISO-8601-timestamp>",
  "cprp/valid-until"        : "<ISO-8601-timestamp>"
}
```

The `<domain>` in the FQPN is the DNS-registered domain — either the apex (`blackrock.com`) or a subdomain (`tmmf.lloyds.com`). The credential's `cprp/fqpn` claim carries the full FQPN including network.

#### 3.4 Re-Verification Cadence

DNS credentials MUST be re-verified at least every 7 days. Registrars SHOULD subscribe to DNSSEC-based notification mechanisms where available and re-verify on demand when the underlying DNS record changes. A credential past its `cprp/valid-until` MUST be treated as expired.

#### 3.5 Trust and Governance

DNS-verified credentials carry the trust conferred by the importer's registrar status under the CNS 2.0 governance defined by the DSO. This CIP does not define a formal trust tier for DNS credentials; that would fall under the advanced verification framework retained as future work.

### 4. Future Importers (Blueprint)

Each future importer is a separate CIP under this blueprint. Sketches:

#### 4.1 LEI (GLEIF), including vLEI verification

Verification: query GLEIF's API (`api.gleif.org`) to confirm the LEI is `ACTIVE`, the legal name matches, and (for vLEI) the issuing Qualified vLEI Issuer is on the GLEIF trusted list. Re-verification cadence: 30 days, or immediately on GLEIF status change. Credential encoding follows Section 3.3 with `cprp/source: vlei` and additional claims for legal name, QVI, and vLEI type.

#### 4.2 ENS

Verification: fetch a TXT record on the ENS name (typically under `.eth`) with the Canton Party ID, resolved through the ENS Public Resolver. Re-verification cadence: 14 days. Credential encoding follows Section 3.3 with `cprp/source: ens`.

#### 4.3 Cross-Chain Identity (Ethereum Address, SWIFT BIC)

Verification for Ethereum addresses: the party signs a canonical message binding its Canton Party ID with the Ethereum private key; the importer recovers the address and confirms match. Verification for SWIFT BIC: currently self-attested only, pending an appropriate verifying infrastructure. Credential encoding follows Section 3.3 with `cprp/source: eth` or `cprp/source: swift` and appropriate additional claims.

#### 4.4 Email / DKIM

Verification: an email challenge protocol backed by DKIM authentication. Credential encoding follows Section 3.3 with `cprp/source: email`.

Each of these importers is expected to be specified in its own CIP, following the pattern of Section 3 above, and to be pursued as separate DevFund proposals where operational funding is required.

### 5. Common Claim Keys

| Claim Key | Value | Notes |
|-----------|-------|-------|
| `cprp/fqpn` | An FQPN string | The canonical FQPN this credential certifies |
| `cprp/network` | `mainnet` / `testnet` / `devnet` / `localnet` | Network discriminator |
| `cprp/source` | `dns` / `vlei` / `ens` / `eth` / `swift` / `email` / … | The external system |
| `cprp/verification-method` | `dnssec-txt` / `gleif-api` / `ens-txt` / `signature` / … | The exact procedure used |
| `cprp/verified-at` | ISO-8601 timestamp | When verification last succeeded |
| `cprp/valid-until` | ISO-8601 timestamp | After which the credential MUST be re-verified |

Importer-specific claim keys (e.g. `cprp/legal-name`, `cprp/qvi`) are defined in the respective importer's CIP.

### 6. Architectural Alignment

- This CIP relies on the Canton Party Name Resolution Standard for the FQPN format, the resolver interface, the resolution algorithm, and the display conventions.
- This CIP relies on the CN Credentials Standard CIP for the on-ledger credential registry that stores all importer credentials.
- This CIP interoperates with the CNS 2.0 CIP for registrar governance and for the Decentralized Registry Operator infrastructure that shared external importers may use.
- This CIP is complementary to the `.canton` CIP (Axymos, PR #209); imported names and `.canton` names coexist and compose per the Canton Party Name Resolution Standard.
- This CIP does not define the on-ledger governance for registrar approval; that is defined by the CNS 2.0 CIP.

### 7. Backward Compatibility

Additive. External identity systems continue to operate as-is. Existing CNS 1.0 names remain unaffected. Applications not adopting this CIP simply do not receive imported-name credentials in their resolution results.

## Rationale

### Why the import model

Simon Meier's answer at the July 9, 2026 WG meeting is decisive: Daml code that references an imported name needs on-ledger state. Bridge-style reference to the external system at query time works for read-only or private cases, but the general institutional workflow — settlement, custody, compliance — requires that the imported name be a first-class on-ledger entity. Import forces the discipline of a defined verification procedure, a defined re-verification cadence, and a defined credential encoding; bridge models tend to shortcut these.

### Why one full CIP now, blueprints for the rest

Attempting to specify five importers (DNS, LEI, ENS, cross-chain, email) at CIP quality in a single document produces a large document that dilutes review. Specifying DNS fully and treating it as the blueprint gives the WG a concrete artifact to review and a template that scales. Each future importer becomes a small CIP building on this one.

### Why DNS first

DNS is the largest existing identifier system with a workable verification mechanism (DNSSEC + TXT records). The infrastructure to run a DNS importer is mature. The WG has discussed operating it as a Decentralized Registry Operator on the SV attestor pool (per Simon's June 25 presentation), which gives it credibility as a first-class network-native importer rather than a single-vendor service.

### Why re-verification cadences differ per source

DNS records can change silently; DNSSEC does not push change notifications reliably to all downstream resolvers, so a bounded re-verification window is required. GLEIF publishes LEI status changes with clear semantics, so vLEI credentials can be re-verified less often and can be archived promptly on status change. ENS names have similar mechanics to DNS with some on-chain state; a 14-day cadence balances staleness against verification cost. SWIFT self-attestation has no verifying infrastructure and is treated accordingly.


## Companion Documents

- Canton Party Name Resolution Standard (Freename, companion) — defines the FQPN, the resolver interface, resolution algorithm, and display conventions.
- CNS 2.0 CIP (Digital Asset) — defines the `cns` resolver, the SV-Operated TLD Registry, the Decentralized Registry Operator infrastructure.
- CN Credentials Standard CIP (Digital Asset, PR #204) — the credential registry all importer credentials publish into.
- `.canton` CIP (Axymos, PR #209) — Canton-native name allocation, complementary to this CIP.
- `cprp-verification.md` (reference / future work) — the advanced trust framework retained as reference for future consideration.
