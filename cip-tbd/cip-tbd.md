# CIP-XXXX: Clear Signing

<pre>
 CIP: TBD
 Title: Clear Signing
 Author: Marc Juchli (Digital Asset)
 Status: Draft
 Type: Standards Track
 Created: 2026-11-23
 Approved: TBD
 License: CC0-1.0
 Post-History: TBD
</pre>

## Abstract

This proposal defines a **Clear Signing Descriptor**: a machine-readable format that maps a Canton template and its choices to human-readable intent, typed fields, and deterministic display instructions.

A wallet applies the descriptor to a prepared transaction and presents what the user is authorizing, instead of package identifiers, choice names, and raw arguments. Displayed values are taken from the transaction. The descriptor does not change transaction semantics, authorize operations, or replace cryptographic verification.

The format follows [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730), adapted to Canton’s Daml-LF model of creates, exercises, nested nodes, and contract references.

## Copyright

This CIP is licensed under CC0-1.0: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)

## Motivation

Canton transactions are prepared as trees of contract creates and choice exercises. That representation is machine-readable, but wallets today parse and display it as package and template identifiers, contract IDs, choice names, and typed arguments. Users have to read implementation details in order to understand what they are authorizing.

The Canton Clear Signing Descriptor is shared presentation metadata for one exact template. Wallets can apply it without built-in knowledge of every application. A raw exercise node can instead be shown as ”Transfer 100 CC to Alice”, with fields for the asset, amount, recipient, and relevant contract.

The descriptor is independent of any single wallet, transport, or transaction instance. It describes how to present a transaction. It does not decide whether the transaction is authorized, safe, or semantically correct.

## Specification

A descriptor binds display definitions to one template. Wallets match those definitions to a prepared transaction, derive every displayed value from that transaction, and fall back explicitly when a descriptor, operation, or field cannot be interpreted.

### Definitions

| Term | Definition |
| --- | --- |
| Descriptor | A JSON document that binds display definitions to one exact Canton template. |
| Template identity | The tuple `packageId`, `moduleName`, `entityName` (`template_id`). All three components are required for a match. |
| Prepared transaction | The transaction tree presented for signing, including create and exercise nodes, arguments, and metadata. It is the only source of displayed values. |
| Wallet | Applies descriptors to a prepared transaction and presents the result for authorization. How a wallet is packaged is out of scope; interpretation and fallback behavior are not. |
| Safe fallback | The presentation used when a descriptor, operation, field, or reference cannot be interpreted or trusted. The operation stays visible, and the limit of the interpretation is explicit. |

### Descriptor structure

The document separates schema, context, metadata, and display, as ERC-7730 does. Canton extensions cover template identity, operation matching, and integrity.

#### Top-level structure

A descriptor is represented as a JSON schema and consists of the following components:

| Field | Required | Purpose |
| --- | --- | --- |
| `$schema` | Yes | Identifies the JSON Schema used to validate the descriptor. |
| `context` | Yes | Binds the descriptor to one template identity. |
| `metadata` | Yes | Records the descriptor version, publisher, and provenance. |
| `display` | Yes | Defines how supported operations are presented. |
| `signature` | No* | Carries integrity and authenticity information. |

\* Whether a signature is required for publication, acceptance, or a given trust level is defined by the trust model.

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

A wallet MUST reject a descriptor whose schema version is a breaking version it does not support. The schema’s versioning policy MUST define how additive changes and fixes are handled.

#### Context

The `context` field binds the descriptor to one exact Canton template, identified by the tuple:
- `packageId`
- `moduleName`
- `entityName`

All three values MUST match the prepared transaction. Module and entity name alone are not sufficient, because different packages may reuse them.

#### Metadata

The `metadata` field provides information about the descriptor itself, including:

- `version`: content version, independent of `$schema`.
- `publisher`: the claimed publisher or author.
- `name`: a human-readable descriptor name.
- `url` or equivalent provenance fields, where applicable.

Metadata MUST NOT be treated as trusted because it is present in the document. Publisher authenticity depends on signature verification and the wallet’s trust policy. The schema MAY add further metadata, such as constants or shared definitions, where display formatting needs them.

#### Display

The `display` contains one definition per operation kind:
- `creates`: create operations and their constructor arguments.
- `exercises`: exercise operations, keyed by exact choice name, and their choice arguments.

An operation definition MAY include a stable `intent`, an `interpolatedIntent`, and an ordered list of typed fields. Path and formatting rules are specified below. Choice definitions MAY also name the interface the choice implements; see Interface-qualified choices.

#### Signature

The optional `signature` field carries what a wallet needs to verify integrity and authenticate the publisher. If provided, the signature MUST cover the canonical descriptor content, excluding the signature envelope, and MUST bind the schema version and template context. A change to display instructions, to metadata that affects interpretation or trust, or to a referenced definition MUST be detectable.

A valid signature establishes integrity and possession of the signing key. It does not establish that the publisher is trusted, or that the display instructions are semantically correct.

### Descriptor matching

A wallet MUST select a descriptor by exact template identity: `packageId`, `moduleName`, and `entityName`. It MUST NOT select one by template name, package name, or a publisher-provided label.

It MUST then select the operation definition:

- **Create node:** Select the definition under `display.creates`.
- **Exercise node:** Select the definition under `display.exercises`, keyed by the exact choice name.

If no descriptor or operation definition matches, the wallet MUST use its safe fallback. It MUST NOT apply a definition from another template or choice.

### Operation matching

Paths are resolved against the matching node in the prepared transaction. A descriptor MUST NOT supply replacement values. Displayed values MUST come from the prepared transaction.

| Node | Descriptor operation | Value |
| --- | --- | --- |
| Create | `creates` | Constructor arguments of the created contract. |
| Exercise | `exercises`, keyed by choice name | Choice argument of that exercise. |

### Field references

Field paths follow ERC-7730 where it applies, adapted to Daml-LF nodes and contract references.

#### Field definition

Each field definition describes a value to be displayed.

| Property | Description | Requirements |
| --- | --- | --- |
| `path` | Location of the value in the matched node. | REQUIRED. MUST resolve unambiguously to a Daml-LF record. |
| `label` | Human-readable label. | OPTIONAL |
| `format` | How the value is interpreted and displayed. | OPTIONAL. MUST be a formatter supported by this schema version and the wallet. |

The `path` grammar supports named record fields, such as `amount` and `recipient`, that map to the respective Daml-LF fields in the prepared transaction.

#### Path prefixes

An `interpolatedIntent` MAY embed values with `{path}` placeholders. Each placeholder MUST resolve to a field that has a display definition, and the wallet MUST format it with the same rules used when that field is shown on its own.

| ERC-7730 prefix | Canton meaning |
| --- | --- |
| none | Fields of the matched operation: create arguments or exercise arguments. |
| `@` | The prepared transaction. On an exercise node, `@.contract` refers to the create arguments of the exercised contract. |
| `$` | Descriptor metadata, definitions, and constants. |

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

In this example, unprefixed paths read constructor or choice arguments. `@.contract` reads the exercised contract’s create arguments. The `contractId` path reads a map entry on the choice argument.

Interpolated values MUST be treated as untrusted. A wallet MUST stop field contents from changing the meaning or structure of the surrounding text, and MUST still show the individual field values for inspection.

#### Contract ID references

A contract ID in a create or exercise argument MAY be used as a lookup key when that contract is a node in the same prepared transaction, or is present in its metadata. The wallet then reads that node’s `template_id` and resolves a descriptor for that exact identity. This enriches the presentation without a separate ledger read.

1. Find a contract ID in the operation’s data.
2. Search the prepared transaction for a create node with that contract ID.
3. If one exists, resolve a descriptor for its template identity.
4. Verify that descriptor’s integrity, publisher, and trust before applying its display rules.
5. If none exists, the wallet MAY do an authorized ledger or contract-data lookup. If the contract still cannot be resolved, the reference MUST be shown as unresolved.

A contract ID alone MUST NOT be treated as evidence of the referenced contract’s template, contents, ownership, or business meaning. Trust in the referring descriptor MUST NOT extend to the referenced one, even when the path names it explicitly. Each descriptor is verified on its own.

Resolution MUST respect Canton privacy and authorization and MUST be bounded by implementation-defined limits. Resolved data is context, not proof that the current operation is safe or authorized. The wallet MUST NOT invent missing contract contents or hide an unresolved reference. A wallet MUST still be able to present the transaction safely when resolution is unavailable.

### Interface-qualified choices

An exercise definition MAY identify the interface a choice implements, in addition to the choice name. One choice name can implement more than one interface. In the token standards, transfer and allocation are cases of this. The interface entry also tells the wallet which interface to explain.

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

The interface is identified by `moduleName` and `entityName` only. Its package ID is implied by the template’s package ID and MUST NOT be given separately. When a choice declares an interface, the wallet MUST check that declaration and MUST NOT fall back to a match on choice name alone.

### Field formatting

Field formatting defines how values extracted from a prepared transaction are presented to users. Descriptors declare formatting rules; wallets interpret those rules and render the resulting values using their own user interface.

The initial version SHOULD support these formatters:

| Formatter | Purpose |
| --- | --- |
| `string` | Display a textual value. |
| `number` | Display a numeric value without changing its meaning or precision. |
| `boolean` | Display a boolean value. |
| `party` | Display a Canton party identifier. |
| `contractId` | Display a contract identifier, with full-value inspection when shortened. |
| `dateTime` | Display a date or timestamp with a defined timezone and representation. |
| `duration` | Display a duration in a defined unit. |
| `enum` | Map a known value to a label, while keeping the underlying value available. |
| `optional` | Display an optional as `$type` and `$value`. |
| `raw` | Display a safe generic form when no specialized formatter applies. |

Formatting MUST be deterministic for equivalent input values and supported descriptor definitions.

#### Handling Optionals

A descriptor field is a path into the transaction, and the wallet formats whatever the path reaches. That breaks when the shape of the value varies:

- An optional is `Some(x)` or `None`, and a path to a `None` has no value to format.
- An enum value is an identifier.

The author otherwise has to show the raw encoding or write one fixed field list that is wrong for some shapes.

#### Type safety and value preservation

Formatters MUST validate input types and MUST NOT silently coerce incompatible values or lose semantically relevant information. Numeric values MUST retain their exact meaning; shortened values MUST remain inspectable in full. Party identifiers and contract IDs MUST remain distinguishable from arbitrary text, without implying unverified trust or resolution.

#### Security and presentation consistency

Wallets MUST safely render transaction values as untrusted input and prevent markup injection or misleading presentation. Formatting MUST NOT hide material values or operations. Wallets SHOULD indicate when values are shortened, converted, or unresolved and provide access to the underlying values. Labels MUST NOT be treated as proof of business meaning or trust.

#### Extensibility

New formatters MUST define their input types, parameters, rendering semantics, and fallback behavior through versioned schema evolution. Existing formatter names MUST retain their established meaning. Unsupported formatters MUST trigger an explicit fallback rather than a guessed interpretation.

### Verification and trust

#### Signature model

The signature protects integrity and can authenticate the publisher. It does not make the descriptor trustworthy or semantically correct.

It covers the canonical form of everything that affects interpretation: schema version, template context, metadata, and display definitions. The envelope carries the signature plus the key material and algorithm identifiers needed to verify it.

#### Trust model

Verification and publisher trust are separate decisions:

| Verification | Publisher | Meaning |
| --- | --- | --- |
| Invalid | Any | Integrity cannot be established. |
| Valid | Untrusted | Content is intact. The publisher is not trusted. |
| Valid | Trusted | Content is intact, and the publisher meets the wallet’s trust policy. |
| Unavailable | Unknown | Integrity or publisher cannot be verified. |

Trust MAY come from a curated registry, trusted publisher keys, or a user decision. A referenced descriptor is a separate trust decision. Key rotation, revocation, and compromise handling require an explicit policy.

#### Discovery and distribution

Discovery is independent of the descriptor format. No single channel is required. Finding a descriptor does not make it trusted. Verification does.

| Mechanism | Purpose |
| --- | --- |
| Registry | Index and discover descriptors. |
| Publisher endpoint | Retrieve descriptors from their publishers. |
| Application bundle | Ship descriptors with Daml packages or applications. |
| Wallet store | Cache or manage descriptors locally. |

### Compatibility

The format does not name a synchronizer. The synchronizer comes from prepared-transaction metadata (`synchronizerId`), so one descriptor can be reused across synchronizers.

### Wallet integration

Three inputs produce the signing view:

| Input | Role |
| --- | --- |
| Prepared transaction | Authoritative operation structure and values. |
| Descriptor | How supported operations and fields are presented. |
| Trust policy | Whether that descriptor may be relied on. |

The wallet walks the tree, resolves a descriptor per create or exercise, validates it, binds field paths, formats values, and renders intent and fields while keeping the underlying data available. These are responsibilities, not required components. An implementation MAY combine them.

| Responsibility | Does |
| --- | --- |
| Transaction parser | Walks the prepared transaction and exposes operation data. |
| Descriptor resolver | Finds a descriptor for a template identity and operation. |
| Schema validator | Checks structure and supported features. |
| Field interpreter | Resolves paths, formatting, and interpolation. |
| Trust verifier | Checks integrity and applies publisher trust. |
| Presentation layer | Renders interpreted operations and unsupported cases. |

When interpretation is incomplete, the fallback makes that visible. Descriptor metadata does not replace validation, authorization, or signing. The wallet remains responsible for signing the transaction that was presented.

### Resolution failures

A wallet MUST handle match and field-resolution failures explicitly, including:

- No descriptor matches the template.
- No definition matches the create or choice.
- A path is missing from the operation data.
- A value has an unexpected type.
- An interpolation refers to an undefined or unformattable field.
- A referenced contract or its descriptor cannot be resolved or trusted.

If interpolation fails, the wallet MUST show the stable intent and MUST show the fields it can still display. It MUST NOT invent a value. Failure on one operation MUST NOT hide that operation or any other. Unknown or unsupported operations MUST remain visible through the safe fallback.

### Limitations

The descriptor improves readability. It does not establish that a transaction is safe or correct.

| Limitation | What remains true |
| --- | --- |
| Descriptor availability | Interpretation depends on a matching descriptor. |
| Publisher trust | A valid signature does not mean the intent is accurate. |
| Semantic correctness | Display rules do not check Daml behavior. |
| Transaction context | One operation may not show the full effect across contracts. |
| Unsupported operations | Unsupported nodes or features cannot be fully interpreted. |
| External references | Resolving another contract can require more access, raise privacy questions, or be impossible. |
| Wallet compatibility | Wallets may interpret and present to different depths. |

Wallets still validate and authorize on their own, and they show the limit of the interpretation.

## API Evolution

This section defines how the Clear Signing Descriptor Schema evolves after this CIP is accepted.

### Versioning

The schema artifact defined by this CIP **MUST** be versioned. The authors will publish schema 1.0.0 on acceptance. Published artifacts will be maintained in the `/api-specs/` directory in the [splice-wallet-kernel](https://github.com/canton-network/wallet/tree/main/api-specs) repository.

Descriptor authors **SHOULD** check that the schema version supports the features they use.

### Categories of Changes

Schema changes fall into three categories:

#### Editorial Changes

Clarifications, wording updates, and other non-semantic improvements **MAY** be made at any time. These changes neither require a new schema version nor a CIP amendment.

#### Non-Breaking Changes

Backward-compatible modifications, such as optional fields that do not affect existing behavior, **MAY** be introduced in coordination with other wallet providers and descriptor authors. Such changes **SHOULD** result in a new minor version of the schema artifact, but do not require an amendment to this CIP.

#### Breaking Changes

Modifications that alter existing semantics, remove functionality, or introduce new mandatory behavior **MUST** be treated as breaking. Breaking changes **REQUIRE** an amendment to this CIP and publication of a new minor version of the schema artifact.

### Guiding Principles

Evolution of the schema **SHOULD** prioritize:

- Long-term interoperability across independently written descriptors and the wallets that apply them
- Stability of published versions
- Minimization of breaking changes
- Predictable upgrade paths for implementers

This CIP governs the Clear Signing Descriptor Schema. Any change that alters normative behavior follows the process above.

## Rationale

Prepared transactions already expose creates, exercises, template identities, and arguments. They do not describe business intent. A portable descriptor lets a publisher describe a template once, and lets any wallet present that template the same way.

### Alignment with existing ecosystem standards

[ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) is the reference: a descriptor separate from the transaction, with human-readable intent, field formatting, interpolated summaries, and a registry for reuse. [EIP-712](https://eips.ethereum.org/EIPS/eip-712) is the complementary foundation for typed structured data. Other ecosystems, including Solana instructions and Cosmos SDK messages, use different transaction shapes and do not define this kind of descriptor.

This CIP keeps the ERC-7730 split and adds what Daml-LF prepared transactions require: exact template identity, create and exercise matching, nested traversal, contract references, and a trust check that is not tied to one wallet or one distribution channel.

### Minimal but sufficient scope

The descriptor only binds display definitions to exact template identities and to create and exercise operations. Annotations integrated into the Daml language would go beyond that. Embedding display metadata in Daml remains possible later.

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

A portable descriptor lets applications and publishers supply presentation metadata once, without a wallet-specific integration.

### Raw prepared transaction display

Wallets could display the prepared transaction as structured JSON or another low-level representation.

**Advantages**

- No external descriptors or publisher trust model required
- Direct visibility into the underlying transaction data

**Disadvantages**

- Difficult for users to understand
- Exposes implementation details rather than business intent
- Makes security-relevant values harder to identify and review

Raw transaction data remains appropriate as a fallback or inspection view. It is not a sufficient primary clear-signing experience.

### Application-provided display strings

Applications could send human-readable descriptions alongside transaction requests.

**Advantages**

- Simple to implement
- Allows application-specific explanations and context

**Disadvantages**

- Display text may be disconnected from the prepared transaction
- No standard mapping between descriptions and transaction fields
- Requires a separate mechanism to verify integrity and establish trust

The descriptor binds display definitions to an exact template identity and takes displayed values from the prepared transaction.

### Adopting ERC-7730 without Canton-specific adaptation

ERC-7730 is the right reference for a portable clear-signing descriptor. Canton transactions are prepared trees of creates and exercises, identified by template and choice, and they refer to other contracts. Adopting the Ethereum descriptor unchanged would not match those nodes or resolve those references.

This CIP reuses the descriptor architecture and defines Canton operation matching, tree traversal, and reference resolution.

## Future Work

The following items came out of the proof of concept. They are outside the initial version.

| Item | Deferred work |
| --- | --- |
| Parameterized formatters | Formatter parameters, following ERC-7730 `fields[n].params`. |
| Variant formatter | Optionals are in the initial version. Variants are not. A later descriptor may mark a field so that a missing value is shown as `None` and a present value uses that field’s formatter. |
| Parsed interpolated intent | A wallet should be able to highlight substituted values separately from the surrounding text. |
| Contract reference resolution | Optional in the initial version. See Contract ID references. |
| Display format references | A `display.format` section that other display definitions can reference. |
| Verifiable provenance | Signature canonicalization, hashing, algorithms, and encoding. See Signature model. |

## References

The following resources provide normative specifications and reference implementations compatible with the Canton Descriptor Schema. The specifications listed below will become **normative with the v1.0.0 release**, while the core packages serve as **reference implementations**.

### Specifications


### Reference Implementations

## Change log

* **2026-11-23**: Initial draft of the proposal.
