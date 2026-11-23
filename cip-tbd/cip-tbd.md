# CIP-0103: dApp Standard

<pre>
 CIP: TBD
 Title: Clear Signing
 Author: Digital Asset (Marc Juchli)
 Status: Draft
 Type: Standards Track
 Created: 2026-11-23
 Approved: TBD
 License: CC0-1.0
 Post-History: TBD
</pre>

## Abstract


## Copyright

This CIP is licensed under CC0-1.0: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)

## Motivation

Canton transactions are prepared as structured transaction trees containing operations such as contract creation and choice exercise. Although this representation is machine-readable, its low-level structure is difficult for users to understand and verify before authorizing a transaction.

Today, wallets extract and display raw transaction data, including package and template identifiers, contract IDs, choice names, and typed arguments. This forces users to interpret implementation-level details to understand what they are authorizing.

The Canton Clear Signing Descriptor defines a machine-readable format that maps Canton templates and choices to human-readable intent, typed fields, and deterministic display instructions. It enables wallets to interpret prepared transactions consistently without requiring protocol-specific knowledge of every application.

The design is inspired by ERC-7730, adapted to Canton’s Daml-LF transaction model, including contract creation, exercises, nested transaction nodes, and references to existing contracts.

For example, instead of displaying a raw exercise node, a wallet could present ”Transfer 100 CC to Alice”, accompanied by detailed fields identifying the asset, amount, recipient, and relevant contract.

The descriptor is separate from the transaction itself. It describes how transaction data should be presented; it does not change transaction semantics, authorize operations, or replace cryptographic verification.

## Specification

### High Level Overview

The Canton Clear Signing Descriptor defines a machine-readable way to interpret Canton transactions for human review before signing. It maps Daml-LF template operations in a prepared transaction to human-readable intent and structured field representations, enabling wallets to present meaningful summaries instead of raw transaction data.

A descriptor is bound to an exact Canton template, identified by its package ID, module name, and entity name (known as template_id). It defines how to display contract creation and choice exercises, including stable intent descriptions, value-interpolated intent, and typed fields. Wallets apply these definitions to the actual prepared transaction, traversing all root nodes and nested operations.

A descriptor consists of five logical components:

- Schema: Defines the descriptor structure and validation rules using JSON Schema.
- Context: Identifies the exact Canton template to which the descriptor applies.
- Metadata: Records the descriptor version, publisher, and provenance.
- Display: Defines human-readable intent and typed field representations for supported operations.
- Signature: Enables integrity verification and publisher authentication, subject to the wallet’s trust policy.

Descriptors are independent of individual transaction instances, wallet implementations, and transport mechanisms. They can be distributed through different channels, provided their integrity and applicability can be verified. Shared definitions and composition may enable reuse across descriptors.

The descriptor is presentation metadata, not transaction authority. It does not establish whether a transaction is authorized, safe, or semantically correct. Wallets must derive displayed values from the prepared transaction, validate descriptor applicability and trust, and never silently omit operations that cannot be interpreted. Missing, invalid, unsupported, or untrusted descriptors must result in a safe fallback that makes the limits of the interpretation clear.

The following sections specify the descriptor format, display semantics, verification and trust model, resolution process, and wallet requirements.

### Descriptor Structure

A Canton Clear Signing Descriptor is a JSON document that binds display definitions to an exact Canton template and defines how supported operations are presented to users.

The structure is inspired by ERC-7730, reusing its separation of schema, context, metadata, and display definitions where appropriate. Canton-specific extensions define template identity, operation matching, and descriptor integrity.

#### Top-level structure

A descriptor is represented as a JSON schema and consists of the following components:

| Field | Required | Purpose |
| --- | --- | --- |
| `$schema` | Yes | Identifies the JSON Schema version used to validate the descriptor. |
| `context` | Yes | Binds the descriptor to an exact Canton template. |
| `metadata` | Yes | Provides descriptor version, publisher, and provenance information. |
| `display` | Yes | Defines human-readable representations for supported operations. |
| `signature` | No* | Carries integrity and authenticity information for verification. |

\* Whether signatures are mandatory for publication, acceptance, or particular trust levels is defined by the trust model.

The following is an illustrative structural example, not a finalized schema:

```json
{
  "$schema": "https://example.org/canton-clear-signing/v1/schema.json",
  "context": {
    "template": {
      "packageId": "<package-id>",
      "moduleName": "Example.Module",
      "entityName": "Example"
    }
  },
  "metadata": {
    "version": "1.0.0",
    "publisher": "Example Publisher",
    "name": "Example Template"
  },
  "display": {
    "creates": {},
    "exercises": {}
  },
  "signature": {}
}
```

#### Schema

The `$schema` field identifies the descriptor schema against which the document MUST be validated. Schema versioning is independent of the descriptor's own content version.

A wallet MUST reject descriptors using an unsupported breaking schema version. Compatibility rules for additive changes and fixes MUST be defined by the schema's versioning policy.

#### Context

The `context` field binds the descriptor to one exact Canton template, identified by the tuple:

- `packageId`
- `moduleName`
- `entityName`

All three values MUST match the template identity in the prepared transaction. Matching by module and entity name alone is insufficient because different packages may define templates with identical names.

The context identifies the template being described; it does not identify a particular contract instance or authorize an operation.

#### Metadata

The `metadata` field provides information about the descriptor itself, including:

- `version`: the descriptor content version, independent of `$schema`.
- `publisher`: the claimed publisher or author.
- `name`: a human-readable descriptor name.
- `url` or equivalent provenance fields, where applicable.

Metadata is descriptive and MUST NOT be treated as trusted solely because it appears in the descriptor. Publisher authenticity depends on signature verification and the wallet's trust policy.

Additional metadata, such as reusable constants or shared definitions, MAY be introduced by the schema where required by display formatting.

#### Display

The `display` field defines how supported operations are interpreted and presented. It contains separate definitions for the two operations: contract creation and choice exercise:

- `creates`: definitions for create operations and their constructor arguments.
- `exercises`: definitions for exercise operations, keyed by exact choice name, and their choice arguments.

Each operation definition MAY specify a stable intent, an interpolatedIntent, and an ordered list of typed fields. Field formatting and path semantics are defined in the display-model chapter.

A wallet MUST select definitions using the template identity and operation type, and for exercises, the exact choice name. A missing definition MUST NOT be interpreted as permission to omit the operation; the wallet must use its safe fallback.

#### Signature

The optional `signature` field carries the information needed to verify the descriptor's integrity and authenticate its publisher. The verification and trust-model chapter specifies its exact structure, canonicalization rules, cryptographic algorithms, and trust requirements.

The signature MUST cover the canonical descriptor content, excluding the signature envelope itself, and MUST bind the descriptor to its schema version and template context. Changes to display instructions, metadata that affects interpretation or trust, or referenced definitions MUST be detectable during verification.

A valid signature establishes integrity and control of the signing key; it does not, by itself, establish that the publisher is trusted or that the display instructions are semantically correct.

### Descriptor matching

A wallet MUST match a descriptor to a transaction operation using the exact template identity:

- `packageId`
- `moduleName`
- `entityName`

All three components MUST match the template identifier in the prepared transaction. A descriptor MUST NOT be selected based only on a template name, package name, or publisher-provided label.

The wallet MUST then select the operation definition:

- **Create node:** Select the definition under `display.creates`.
- **Exercise node:** Select the definition under `display.exercises`, keyed by the exact choice name.

If no matching descriptor or operation definition is available, the wallet MUST use its safe fallback presentation. It MUST NOT apply a definition belonging to a different template or choice.

### Operation matching

Field references are resolved against the corresponding nodeType in the prepared transaction. The descriptor defines paths and presentation rules, but MUST NOT supply replacement values for transaction fields. Displayed values MUST be derived from the prepared transaction.

| Node Type | Descriptor operation | Fields |
| --- | --- | --- |
| `Create` | `creates` (indexed) | Contains the contract creation argument, including its constructor fields. |
| `Exercise` | `exercises` (indexed) | The choice argument for the exercised contract and choice. |

### Field references

This chapter defines how wallets resolve the values referenced by their display instructions.

The model follows [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) where applicable, adapted to Canton template identities, Daml-LF transaction nodes, and contract references.

#### Field definition

Each field definition describes a value to be displayed.

| Property | Description | Requirements |
| --- | --- | --- |
| `path` | Identifies a value within the relevant prepared transaction node. | REQUIRED; MUST resolve unambiguously to DAML-LF record. |
| `label` | Human-readable field label. | OPTIONAL |
| `format` | Formatting type used to interpret and display the value. | OPTIONAL; MUST be supported by the descriptor schema version and wallet implementation. |
| `params` | Formatter-specific parameters. | OPTIONAL; MUST conform to the formatter's definition. |

The `path` grammar supports named record fields, such as `amount` and `recipient`, that map to the respective Daml-LF fields in the prepared transaction.

#### Path references and Interpolation

An `interpolatedIntent` MAY reference fields using `{path}` placeholders. Following ERC-7730's interpolation model, each placeholder MUST resolve to a field with a corresponding display definition. The wallet MUST apply the same formatting rules used when displaying that field separately.

We use the following adoption in terms of path references:

| ERC-7730 | Canton adaptation |
| --- | --- |
| no-prefix | Fields of a matched operation: create arguments or exercise arguments. |
| `#` | Keys found under `display.formats` |
| Container (`@`) | The prepared transaction. In addition, when visiting an exercise node, `@.contract` can be used to refer to the create arguments of the respective contract. |
| Descriptor (`$`) | Canton descriptor metadata, definitions and constants |

For example:

```json
{
  "$schema": "<schema>",
  "context": {
    "template": {
      "packageId": "661151768d69141dfd6b757bdc348012b2a64b2c956ad586782f97d07408f264",
      "moduleName": "Utility.Registry.App.V0.Model.Transfer",
      "entityName": "TransferOffer"
    }
  },
  "metadata": {
    "version": "1.0.0",
    "publisher": "<utility-registry publisher>",
    "name": "Utility registry transfer offer"
  },
  "display": {
    "creates": {
      "intent": "Transfer offer",
      "interpolatedIntent": "Offer of {transfer.amount} {transfer.instrument} from {transfer.sender} to {transfer.receiver}", // Point to constructor arguments
      "fields": [
        { "path": "transfer.amount", "label": "Amount", "format": "number" },
        { "path": "transfer.instrumentId.id", "label": "Instrument", "format": "string" },
        { "path": "transfer.sender", "label": "From", "format": "party" },
        { "path": "transfer.receiver", "label": "To", "format": "party" }
      ]
    },
    "exercises": {
      "TransferInstruction_Accept": {
        "intent": "Accept transfer offer",
        "interpolatedIntent": "Accept {@.contract.amount} {@.contract.instrument} from {@.contract.sender}. Using the transfer rule at contractId: {extraArgs.context.values[\"utility.digitalasset.com/transfer-rule\"].AV_ContractId}", // {@.contract...} points to contract container constructor arguments; the contractId path points to the choice argument (resides in a Map)
        "fields": [
          {
            "path": "extraArgs.context.values[\"utility.digitalasset.com/transfer-rule\"].AV_ContractId",
            "label": "Settlement",
            "format": "contractId"
          }
        ]
      }
    }
  },
  "signatures": [] // See doc comment above regarding 1 or multiple signatures
}
```

Interpolated values MUST be treated as untrusted data. Wallets MUST prevent field contents from altering the meaning or structure of the surrounding description. They MUST also retain access to the individual field values so users can inspect the details behind a summary.

#### Contract ID references

A contract ID may appear as a value within a create or exercise argument. When the referenced contract corresponds to a node in the same prepared transaction or to a contract in the prepared transactions metadata, the wallet MAY use the contract ID as a key to locate that node.

If a matching node is found, the wallet can obtain its template_id and use that exact template identity `(packageId, moduleName, and entityName)` to resolve a descriptor for the referenced contract. This allows the wallet to enrich the presentation with the referenced contract's declared display information without requiring a separate ledger lookup.

The resolution process is:

1. Identify a contract ID referenced by an operation's data.
2. Search the prepared transaction tree for a corresponding create node, using the contract ID as the lookup key.
3. If a matching node is found, obtain its `template_id` and resolve a descriptor for that template.
4. Independently verify the referenced descriptor's integrity, publisher identity, and trust status before applying its display rules.
5. If no matching node exists, the wallet MAY attempt an authorized ledger or contract-data lookup. If resolution remains unavailable, the reference MUST be displayed as unresolved.

A contract ID alone MUST NOT be treated as evidence of the referenced contract's template, contents, ownership, or business meaning.

Trust is evaluated independently for every descriptor:

A descriptor for a referenced contract may have a different author from the descriptor for the operation currently being displayed. The wallet MUST independently verify the referenced descriptor under its trust policy. Trust in the original descriptor MUST NOT automatically extend to a referenced descriptor, even when the original descriptor explicitly refers to it.

Resolution MUST respect Canton privacy and authorization constraints and MUST be bounded by implementation-defined limits. Resolved contract information is additional context, not proof that the current operation is safe or authorized. The wallet MUST NOT infer unavailable contract contents or silently omit unresolved references.

Contract-reference resolution is optional in the initial version. Wallets MUST remain able to provide a safe presentation when resolution is unavailable.

### Field formatting

Field formatting defines how values extracted from a prepared transaction are presented to users. Descriptors declare formatting rules; wallets interpret those rules and render the resulting values using their own user interface.

The model is inspired by ERC-7730, adapted to Canton and Daml-LF value types. Formatting MUST be deterministic for equivalent input values and supported descriptor definitions.

#### Initial formatter set

The initial version SHOULD support a small set of generic formatters:

| Formatter | Purpose |
| --- | --- |
| `string` | Display a textual value. |
| `number` | Display a numeric value without changing its meaning or precision. |
| `boolean` | Display a boolean value. |
| `party` | Display a Canton party identifier. |
| `contractId` | Display a contract identifier, with full-value inspection when shortened. |
| `dateTime` | Display a date or timestamp using a defined timezone and representation policy. |
| `duration` | Display a duration using a defined unit. |
| `enum` | Map a known value to a declared human-readable label while preserving access to the underlying value. |
| `optional` | `($type, $value)`. Indicates an Optional value. The descriptor provides information regarding the `$type` and a `$value`. |
| `raw` | Display a safe, generic representation of a supported value when no specialized formatter applies. |

#### Handling Optionals

A descriptor field is a path into the transaction, and the wallet formats whatever the path reaches. That breaks when the shape of the value varies:

- An optional is `Some(x)` or `None`, and a path to a `None` has no value to format.
- A variant carries different fields per constructor. A vesting lock has a period and an end time, and a full lock has neither.
- An enum value is an identifier.

The author otherwise has to show the raw encoding or write one fixed field list that is wrong for some shapes.

#### Type safety and value preservation

Formatters MUST validate input types and MUST NOT silently coerce incompatible values or lose semantically relevant information. Numeric values MUST retain their exact meaning; shortened values MUST remain inspectable in full. Party identifiers and contract IDs MUST remain distinguishable from arbitrary text, without implying unverified trust or resolution.

#### Formatting parameters

Formatter parameters MUST have explicit, schema-defined semantics and MUST NOT alter the underlying transaction value. Conversions, such as unit changes, MUST use explicitly defined rules and preserve access to the original value. Unsupported parameters MUST be handled according to the schema's compatibility rules, without silently changing their meaning.

#### Security and presentation consistency

Wallets MUST safely render transaction values as untrusted input and prevent markup injection or misleading presentation. Formatting MUST NOT hide material values or operations. Wallets SHOULD indicate when values are shortened, converted, or unresolved and provide access to the underlying values. Labels MUST NOT be treated as proof of business meaning or trust.

#### Extensibility

New formatters MUST define their input types, parameters, rendering semantics, and fallback behavior through versioned schema evolution. Existing formatter names MUST retain their established meaning. Unsupported formatters MUST trigger an explicit fallback rather than a guessed interpretation.

### Verification and trust

#### Signature model

The descriptor signature protects the descriptor's integrity and can authenticate its publisher. It does not establish that the descriptor is trustworthy or semantically correct.

The signature covers the canonical representation of all interpretation-relevant content, including the schema version, template context, metadata, and display definitions. The signature envelope contains the signature and the information needed to verify it, such as a public key or key reference and algorithm identifiers.

The canonicalization, hashing, signature algorithms, and encoding remain to be specified.

#### Trust model

Signature verification and publisher trust are separate decisions:

| Verification result | Publisher trust | Interpretation |
| --- | --- | --- |
| Invalid | Any | Descriptor integrity cannot be established |
| Valid | Untrusted | Content is intact, but its publisher is not trusted |
| Valid | Trusted | Content is intact and its publisher meets the wallet's trust policy |
| Unavailable | Unknown | Integrity or publisher cannot be verified |

Trust may be established through a curated registry, trusted publisher keys, or user-managed decisions. Referenced descriptors are separate trust objects: trust in one descriptor does not extend to another.

Key rotation, revocation, and compromise handling are part of the trust model and require defined policies.

#### Discovery and distribution

Descriptor discovery is independent of the descriptor format and wallet implementation. Possible distribution mechanisms include:

| Mechanism | Purpose |
| --- | --- |
| Registry | Index and discover descriptors |
| Publisher endpoint | Retrieve descriptors directly from their publishers |
| Application bundle | Distribute descriptors alongside Daml packages or applications |
| Wallet store | Cache or manage descriptors locally |

No single distribution mechanism is required. Discovery identifies candidate descriptors; verification and trust evaluation determine whether they can be relied upon.

### Compatibility

#### Multi-synchronizer support

The descriptor format is synchronizer-agnostic and supports multi-synchronizer environments. The synchronizer context is obtained from the prepared transaction metadata (synchronizerId), rather than being encoded in the descriptor. This allows the same descriptor to be reused across synchronizers without requiring synchronizer-specific variants.

### Integration

#### Resolution flow

A wallet resolves a descriptor using the exact template identity: packageId, moduleName, and entityName. Exercise operations additionally require a matching choice name.

For contract ID references, resolution may follow this flow:

1. Locate the referenced contract ID in the prepared transaction's create nodes.
2. Read the matching node's template identity.
3. Resolve a descriptor for that template.
4. Verify and evaluate trust in the resolved descriptor independently.

If no corresponding node exists in the prepared transaction, a wallet may perform an external lookup where permitted. A contract ID alone does not establish the template identity or contract contents.

#### Interfaces

I propose not just picking a choice by an exact match against the name, but additionally allow a choice to provide information on which interface it is an implementation of. The reasoning behind this is not only for explanatory purposes in the clear signing view, but also to handle cases where a single choice matches multiple interfaces (within the token standards, transfers and allocation match this). This would look something like this:

```json
"exercises": [
  {
    "choice": "TransferFactory_Transfer",
    "interface": { "moduleName": "Splice.Api.Token.TransferInstructionV1", "entityName": "TransferFactory" },
    "intent": "Transfer Amulet",
    "fields": [ { "path": "transfer.sender", "label": "From", "format": "party" } ]
  },
  {
    "choice": "TransferFactory_Transfer",
    "interface": { "moduleName": "Splice.Api.Token.TransferInstructionV2", "entityName": "TransferFactory" },
    "intent": "Request a transfer",
    "fields": [ { "path": "transfer.sender.owner", "label": "From", "format": "party" } ]
  }
]
```

We do not have to provide package IDs of the interfaces, as this is implicit by the package ID of the template. Additionally, we shouldn’t allow a fallback here, so if your choice implements an interface, this should be apparent by the descriptor and it should be checked by the parsing.

#### Resolution failures and fallback behavior

A wallet MUST handle matching and field-resolution failures explicitly. Examples include:

- No descriptor matches the template.
- No operation definition matches the create or choice.
- A field path does not exist in the operation data.
- A field value has an unexpected type.
- An interpolation references an undefined or unformattable field.
- A referenced contract or its descriptor cannot be resolved or trusted.

If interpolation fails, the wallet MUST fall back to the stable intent and display applicable fields separately where possible. If a field or reference cannot be interpreted safely, the wallet MUST indicate that limitation rather than present an invented or misleading value.

Failure to interpret one operation MUST NOT cause the wallet to omit that operation or any other operation in the prepared transaction. Unknown or unsupported operations MUST remain visible through a generic fallback.

#### Wallet integration

The wallet combines three inputs to produce the signing view:

| Input | Role |
| --- | --- |
| Prepared transaction | Authoritative source of operation structure and values |
| Descriptor | Defines how supported operations and fields are presented |
| Trust policy | Determines whether the descriptor can be relied upon |

A wallet interprets a prepared transaction by combining its transaction tree with descriptors that define how supported operations and fields should be displayed. The descriptor does not decode or replace the transaction; it provides the mapping from known transaction structures to human-readable representations.

The parsing process consists of the following steps:

1. Parse the prepared transaction: Read the transaction tree and identify root nodes, nested operations, template identities, choices with their arguments, and metadata.
2. Resolve descriptors: Match each supported create or exercise operation to a descriptor using its exact template identity and, for exercises, the choice name.
3. Validate and bind fields: Validate the descriptor against its schema and bind declared field paths to values in the prepared transaction.
4. Format values: Apply the descriptor's field definitions and supported formatters without changing the underlying semantic values.
5. Render the result: Produce human-readable intent and field representations, while retaining access to the underlying transaction data for review and verification.

| Component | Responsibility |
| --- | --- |
| Transaction parser | Traverses the prepared transaction and exposes operation data |
| Descriptor resolver | Finds applicable descriptors for template identities and operations |
| Schema validator | Checks descriptor structure and supported features |
| Field interpreter | Resolves field paths and applies formatting and interpolation |
| Trust verifier | Verifies descriptor integrity and applies publisher trust policy |
| Presentation layer | Renders interpreted operations and handles unsupported cases |

These components describe logical responsibilities, not mandatory separate packages or services. Implementations MAY combine them in a single library.

When interpretation is incomplete, the wallet falls back to a representation that makes the limitation visible. Descriptor metadata does not replace transaction validation, authorization, or signing. The wallet remains responsible for ensuring that the transaction signed and executed is the one presented for review.

## API Evolution

This section defines how the dApp API and its associated artifacts are expected to evolve following the acceptance of this CIP.

### Versioning

The Descriptor Schema artifact defined by this CIP **MUST** be versioned. The authors of this CIP will publish the first stable version 1.0.0 of the API upon acceptance of the CIP. Published artifacts will be maintained in the `/api-specs/` directory in the [splice-wallet-kernel](https://github.com/canton-network/wallet/tree/main/api-specs) repository.

Descriptor authors **SHOULD** check upon writing whether the version is recent enough to support their use of the schema.

### Categories of Changes

API changes fall into three categories:

#### Editorial Changes

Clarifications, wording updates, and other non-semantic improvements **MAY** be made at any time.
These changes neither require a new Schema version nor a CIP amendment.

#### Non-Breaking Changes

Backward-compatible modifications – such as adding optional fields that do not affect existing behavior – **MAY** be introduced in coordination with other wallet providers and descriptor authors.
Such changes **SHOULD** result in a new minor version of the Schema artifact, but do not require an amendment to this CIP.

#### Breaking Changes

Modifications that alter existing semantics, remove functionality, or introduce new mandatory behavior **MUST** be treated as breaking. Breaking changes **REQUIRE** an amendment to this CIP and the publication of a new minor version of the API artifacts.

### Guiding Principles

The evolution of the Schema **SHOULD** prioritize:
- Long-term interoperability across independently developed descriptors and their integrators
- Stability of published versions
- Minimization of breaking changes
- Predictable upgrade paths for implementers

This CIP governs the lifecycle of the Clear Signing Descriptor Schema; any change that alters normative behavior falls under the processes defined above.

## Rationale

### Alignment with existing ecosystem standards

Blockchain ecosystems expose transaction data through different models, from structured messages and instructions to encoded contract calls. Wallets interpret this data using chain-specific schemas, decoders, and application logic.

Ethereum's ERC-7730 defines a portable descriptor format for clear signing, separating transaction data from metadata describing how it should be presented. It supports human-readable intent, field formatting, and interpolated summaries. The ERC-7730 descriptor registry provides a mechanism for publishing and reusing descriptors. EIP-712 provides complementary foundations for typed structured data signing.

Other ecosystems use different approaches. Solana transactions organize operations as program instructions, while the Cosmos SDK uses structured messages and transaction encoding. These models provide useful context, although they do not define the same descriptor-based approach as ERC-7730.

ERC-7730 provides the primary architectural reference for a Canton-native descriptor, while other ecosystems illustrate different transaction representations and interpretation approaches.

The proposed standard adapts the descriptor concept to Canton’s transaction model, defining interoperable display semantics, descriptor verification, and trust handling without coupling the format to a particular wallet or distribution mechanism.

### Minimal but sufficient scope

Canton's Ledger API already exposes prepared transactions as create and exercise nodes with template identities and arguments, but not a portable description of business intent. The descriptor binds display definitions to exact template identities and to those operations.

Extensions such as annotations integrated in the Daml language would exceed this scope. Embedding display metadata in Daml itself remains conceptually possible as a future extension.

### Limitations

The Canton Clear Signing Descriptor improves transaction readability but does not independently establish transaction safety or correctness.

| Limitation | Description |
| --- | --- |
| Descriptor availability | Human-readable interpretation depends on a matching descriptor being available. |
| Publisher trust | A valid signature does not guarantee that a descriptor accurately represents the operation's intent. |
| Semantic correctness | Descriptors describe how data is presented; they do not verify Daml business logic or contract behavior. |
| Transaction context | Individual operations may not convey the full business meaning of a transaction or its effects across contracts. |
| Unsupported operations | Wallets may be unable to provide a complete interpretation when operations or descriptor features are unsupported. |
| External references | Resolving referenced contracts may require additional access, introduce privacy concerns, or be impossible. |
| Wallet compatibility | Different wallet capabilities may lead to different levels of interpretation and presentation. |

The descriptor is therefore one component of a broader signing security model. Wallets must continue to validate and authorize transactions independently and clearly communicate the limits of their interpretation.

## Alternatives Considered

### Wallet-specific display logic

Each wallet could implement its own mappings from Canton templates and choices to human-readable descriptions.

**Advantages**

- Full control over presentation and validation
- No separate descriptor distribution or verification mechanism

**Disadvantages**

- Duplicated implementation across wallets
- Tight coupling between wallet releases and application changes
- Limited portability and reuse

A portable descriptor format allows applications and publishers to provide reusable presentation metadata without requiring wallet-specific integrations.

### Raw prepared transaction display

Wallets could display the prepared transaction as structured JSON or another low-level representation.

**Advantages**

- No external descriptors or publisher trust model required
- Direct visibility into the underlying transaction data

**Disadvantages**

- Difficult for users to understand
- Exposes implementation details rather than business intent
- Makes security-relevant values harder to identify and review

Raw transaction data remains useful as a fallback or detailed inspection view, but is insufficient as the primary clear-signing experience.

### Application-provided display strings

Applications could provide human-readable descriptions alongside transaction requests.

**Advantages**

- Simple to implement
- Allows application-specific explanations and context

**Disadvantages**

- Display text may be disconnected from the actual prepared transaction
- No standard mapping between descriptions and transaction fields
- Requires additional mechanisms to verify integrity and establish trust

The proposed descriptor binds display definitions to exact template identities and derives displayed values from the prepared transaction, reducing the risk of misleading descriptions.

### Adopting ERC-7730 without Canton-specific adaptation

Ethereum's ERC-7730 provides a useful reference for portable clear-signing descriptors.

However, Canton transactions use structured prepared transaction trees with create and exercise nodes, template identities, and choice arguments. A direct adoption would not fully address these semantics or the resolution of referenced contracts.

The proposed approach reuses the descriptor-based architecture while defining Canton-specific operation matching, transaction traversal, and reference resolution.

## Future Work

This section describes the work items discovered during the process of designing and building the POC, but are out of scope for this design and thus not part of the initial MVP.

### Parameterized Formatters

A future possibility is to introduce parameters to a format, which, as per ERC-7730 is defined under fields[n].params.

### Variant Formatter

Rather than tackle all of these at ones, we’ll handle optionals initially and tackle variants later. I propose an initial solution where the descriptor author can set a flag Optional:true for a field, which will write None if a specific field isn’t present and otherwise the formatting provided to the field will be used.

### Parsed representation of the interpolated intent

A wallet should be able to highlight the substituted values (variables) of the interpolated intent. Thus, enabling to visually differentiate substituted value from other text.

### Contract reference resolution

See Requirement F4.

### Display format references

A separate section display.format that holds references other display sections can refer to.

### Verifiable provenance

Signatures.

## References

The following resources provide normative specifications and reference implementations compatible with the Canton Descriptor Schema. The specifications listed below will become **normative with the v1.0.0 release**, while the core-packages serve as **reference implementations** to illustrate correct usage.

### Specifications


### Reference Implementations

## Change log 

* **2026-11-23**: Initial draft of the proposal.
