# Canton NFT Profile on Token Standard V2

<pre>
  CIP: ?
  Layer: Daml
  Title: Canton NFT Profile on Token Standard V2
  Author:
    Boris Nelkin (Fairmint)
    Nick Mancuso (Fairmint)
  Discussions-To: https://lists.sync.global/g/cip-discuss
  Status: Draft
  Type: Standards Track
  Created: 2026-10-05
  License: CC0-1.0
  License-Code: Apache-2.0
  Requires: CIP-0056, CIP-0112
</pre>

## Abstract

This CIP defines a profile for unique items on Canton Network Token Standard
V2. A conforming NFT is a CIP-0112 `Holding` with `amount = 1.0`, one
instrument per item, whose template also implements a thin `Nft` interface.
The profile defines item identity, a soulbound mode, and where an item's
content lives. It adds no transfer protocol: transferable items use the
CIP-0112 transfer and allocation flows. A balance greater than `1.0` is a
fungible instrument, not an NFT.

## Copyright

This CIP is licensed under CC0-1.0:
[Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
Reference code is licensed under Apache-2.0.

## Specification

### 1. Terms

| Term | Meaning |
| ---- | ------- |
| Item | One non-fungible asset. |
| Registry | The party that issues items and is the CIP-0056 `instrumentId.admin` for each of them. |
| Collection | A named group of items under one registry sharing a `token_id` namespace. |
| Conforming NFT | A `Holding` contract that meets sections 3 to 9 and implements the `Nft` interface. |
| Transferable mode | The holder may move the item through the CIP-0112 transfer and allocation flows. |
| Soulbound mode | The holder cannot transfer or allocate the item. |

### 2. Packages

The profile is one pinned interface package, built on the Splice
token-standard packages.

| Package | Module | Contents |
| ------- | ------ | -------- |
| `nft-profile-v1` | `Nft.Profile.V1` | `Nft` interface and its types (section 8) |

The package depends on `splice-api-token-holding-v2` for `InstrumentId`.
Daml interface packages are not changed in place. Adding a field or a
reserved key ships as `Nft.Profile.V2` and an amendment to this
CIP. A template implements the current version and MAY implement earlier
ones alongside it.

### 3. Identity

```haskell
data NftId = NftId with
    admin         : Party
    collection_id : Text
    token_id      : Text
```

`admin` is the registry party. `collection_id` names a collection under that
party. `token_id` names one item in that collection. Both texts are assigned
by the registry. `NftId` is the business identity of an item: transfer,
lock, and metadata amendment MUST preserve it. Burn and revocation end the
item.

#### Verification

A verifier checks the holding's signatories and `instrumentId.admin` against
the registry and operator parties it trusts, and checks that the holding
implements `Nft` with `nft_id.admin` equal to `instrument_id.admin`. The
`collection_id` and `token_id` texts name the item inside that party's
namespace; they are not a proof of authenticity on their own.

#### Uniqueness

A registry SHOULD NOT have two active holdings with the same `NftId`. The
registry MAY declare how it upholds this in `NftView.uniqueness`:

| Value | Meaning |
| ----- | ------- |
| `enforced` | Issuance MUST fail on-ledger if that `NftId` already has an active holding. |
| `policy` | The check is an off-ledger registry undertaking. |

If `uniqueness` is absent, no claim is made. A per-collection contract that
records live ids, read and updated by the issuing choice, is one way to
enforce it. A `token_id` MAY be issued again after the earlier item was
burned or revoked; the new holding is a new item, and applications identify
a live item by its active holding.

#### Canonical text

The canonical text of an `NftId` is `collection_id` and `token_id` in order,
each written as the UTF-8 byte length in shortest decimal form, a colon, and
the raw bytes of the part, joined by `|`:

```text
<len>:<collection_id>|<len>:<token_id>
```

Example: `7:posters|1:7`. Each part MUST be non-empty. Canonical texts are
compared as UTF-8 bytes. The admin party is not in the text; it is
`instrumentId.admin`.

#### Identifier privacy

`instrumentId.id` and the instrument entry's `name` and `symbol` are public.
They MUST NOT contain personal data or an identifier of a holder or account.
A `token_id` MAY name the item (a serial, a title, a domain name).

### 4. Instruments and holdings

Each item is one CIP-0056 instrument and exactly one holding of
`amount = 1.0`. `instrumentId.admin` is the registry party and
`instrumentId.id` is the canonical text of the item's `NftId`. Supply per
instrument is 0 or 1. Every instrument entry MUST set `decimals` to `0`.

The template exposes no split, merge, or partial-transfer choice. Every
transfer or allocation of an item is for amount `1.0` with one input
holding. Burn is a transfer of `1.0` to the CIP-0112 burn account where the
registry accepts it.

### 5. Transfer and mode

Mode is `transferable` or `soulbound`, fixed for the life of the item, and
reported in `NftView.mode`.

In transferable mode the registry MUST expose the CIP-0112 transfer
factory, and the CIP-0112 allocation factory if allocation is supported.
Delivery versus payment uses the CIP-0112 allocation flow; each item
appears as amount `1.0` on its leg. The asset follows CIP-0112 section 5.1
for V1 wallet compatibility.

In soulbound mode the registry MUST NOT expose a transfer factory or an
allocation factory for the instrument, and the instrument's `supportedApis`
SHOULD omit the `splice-api-token-transfer-instruction-*` and
`splice-api-token-allocation-*` entries, so wallets do not offer actions
that cannot succeed. A transfer or allocation of an existing soulbound
holding MUST fail, including on a factory the registry also uses for other
instruments, except a burn the registry accepts. A mint offer stays
acceptable: the recipient accepts the
instruction contract the registry created, which does not depend on
`supportedApis`. `token-metadata-v1.yaml` makes these APIs optional per
instrument; omitting them is conforming.

### 6. Issuance and revocation

Issuance mechanics are registry-defined. A mint SHOULD be a transfer offer
from the mint account (CIP-0112 section 4.3.2.1) that the recipient accepts
through the ordinary transfer-instruction flow.

A registry MAY declare in `NftView.revocable` whether it can burn the item
without the owner's authority. The declaration states intent; it is not a
ledger guarantee. A revocation or burn SHOULD carry a human-readable
`splice.lfdecentralizedtrust.org/reason` (CIP-0056). A new item MAY set
`NftView.supersedes` to the `NftId` it replaces. The pointer names that id,
not one past holding: if the id has been issued more than once, it does not
select which holding.

### 7. Metadata and content

Content is off-ledger. The holding carries identity, content URIs, and an
optional hash. The URIs live in `Holding` `meta`, so token-standard wallets
that do not implement the `Nft` interface can still display the item.
Wallets SHOULD render `cip-<nr>/nft-image`, or else
the `image` of the document at
`cip-<nr>/nft-uri`.

| Key | Presence | Value |
| --- | -------- | ----- |
| `cip-<nr>/nft-name` | Required | Display name of the item |
| `cip-<nr>/nft-description` | Optional | Short description |
| `cip-<nr>/nft-image` | Recommended | URI of a public rendering |
| `cip-<nr>/nft-uri` | Recommended | URI of a metadata document; RECOMMENDED to follow the ERC-721 metadata JSON schema (`name`, `description`, `image`, `attributes`) |
| `cip-<nr>/nft-content-hash` | Optional | Hash of the document or asset, hex with an algorithm prefix (`sha256:`) |
| `cip-<nr>/nft-confidentiality-ref` | Optional | Opaque reference to access-controlled off-ledger content |

`cip-<nr>/nft-*` keys not defined here are reserved
for later versions of this profile and SHOULD NOT be written. Keys under
other prefixes are free, following the CIP-0056 prefix rule. Transfer and
lock MUST copy `meta` unchanged.

The template defines who may amend `meta`. An amendment recreates the
holding with the same `NftId` and increments `NftView.metadata_version`
by `1`. It MUST NOT change `NftId`, `mode`, or `uniqueness`, and it MUST
preserve `HoldingView.account`. It MUST NOT change the lock: an
amendment fails on a locked holding and does not attach one to an
unlocked holding. A lock belongs to the token-standard lifecycle, and a
relative lock measures its deadline from the holding's creation, which
an amendment would reset.

### 8. The `Nft` interface

```haskell
module Nft.Profile.V1 where

import Splice.Api.Token.HoldingV2 (InstrumentId)
import Splice.Api.Token.MetadataV1 (Metadata)

data NftId = NftId with
    admin         : Party
    collection_id : Text
    token_id      : Text

data NftMode = NftMode_Transferable | NftMode_Soulbound

data NftUniqueness = NftUniqueness_Enforced | NftUniqueness_Policy

data NftView = NftView with
    nft_id           : NftId
    instrument_id    : InstrumentId
    owner            : Party
    mode             : NftMode
    uniqueness       : Optional NftUniqueness
    revocable        : Optional Bool
    supersedes       : Optional NftId
    metadata_version : Int
    meta             : Metadata

interface Nft where
  viewtype NftView
```

The same template implements CIP-0112 `Holding` and `Nft`. The interface
defines no choices. Prose in this CIP names constructors by their lowercase
suffix (`soulbound`, `enforced`).

`NftView.owner` MUST equal the party in `HoldingView.account.owner`, which
is `Some` for every conforming holding. `NftView.instrument_id` and
`NftView.meta` MUST match the corresponding `HoldingView` fields.
`NftView.nft_id.admin` MUST equal `NftView.instrument_id.admin`.
`metadata_version` is `0` at issuance.

### 9. Privacy and listing

CIP-0056 registry metadata is public: `GET /registry/metadata/v1/instruments`
lists every instrument, and therefore every item. It discloses how many
items a collection has, not who holds them. Active holdings SHOULD be
visible only to the owner, the account provider, the registry, any
operator signatory, and the parties CIP-0112 requires for locks and pending
instructions. Holder enumeration is out of scope.

#### Sharing an item

The public instrument listing shares an item's existence and identity. It
does not share a holding. To show a holding to a party that is not a
stakeholder, a stakeholder hands them the holding's created event, sent
off-ledger. The event MUST carry its created-event blob and the computed
`Nft` interface view: the stakeholder requests both explicitly, because
the default event filter omits them. The interface view renders the
item, the party lists carry the signatories that section 3 checks, and the
blob authenticates the contract: the
recipient attaches it to a command submission as a disclosed contract
(Canton explicit disclosure). The shared view is a rendering copy;
verification does not trust it. The recipient fetches the disclosed
contract through the `Nft` interface from code of their own (a small
verifier template or a Daml Script on their own participant, since
`Nft` defines no choices), and the ledger computes the view from the
authenticated contract. The recipient renders and verifies the item
per section 3 without the registry or the holder online.

A shared created event is a snapshot: later amendments or transfers are
not visible to the recipient, and they archive the holding, so
verification by explicit disclosure works only while the shared contract
is active. Verifying the item afterwards takes a fresh created event
from the current holding. The event carries the full template
arguments and party lists, which can hold fields the `Nft` and `Holding`
views do not expose; the sender reviews the event before sharing it.
Adding observers to a holding to share it is not part of this
profile; it would widen visibility beyond the parties listed above.

### 10. Use cases (informative)

| Use case | Conforming configuration |
| --- | --- |
| One-of-one art, or a numbered edition | Each copy is its own `token_id` and its own holding of `1.0`. |
| Interchangeable copies as a balance greater than one | Not this profile. One CIP-0056 instrument with `decimals = 0` and amount equal to the supply. |
| Ticket redeemed | Burn the ticket, or issue a soulbound pass at the door. |
| Membership, credential, or badge | Soulbound. `revocable` set if the issuer may cancel. |
| License or domain reissued under the same id after burn | Permitted. Applications identify the live item by its active holding. |
| Issuer inventory, later sold | Mint to the registry's own party, then transfer. |
| Lost key | Revoke, then issue a new item that carries `supersedes`. |
| Holder updates the picture or attributes | The template permits owner amendment. |
| Airdrop | A mint offer the recipient accepts. |
| Marketplace trade | A token-standard transfer or allocation. Listings, escrow, and royalties are out of scope. |
| Regulated certificate | Soulbound, `revocable` set, `uniqueness` `enforced`, registry-only amendment. |

### 11. Conformance

An implementation conforms if it satisfies every normative requirement in
this CIP and passes the conformance suite published with the reference
implementation. The suite tests every on-ledger MUST.

## Motivation

CIP-0056 gives wallets one way to hold and transfer assets without depending
on the template behind them. CIP-0112 adds accounts, mint and burn accounts,
and a mint offer the receiver accepts. Neither defines item identity,
per-item content, or a non-transferable mode. Two issuers who each put
`amount = 1.0` on a holding do not interoperate on those points.

Collectibles, tickets, memberships, licenses, domain names, and regulated
certificates are different choices on this profile, not different
standards. A marketplace trades a transferable item through the token
standard the asset already implements.

## Rationale

### A profile on Token Standard V2

The profile reuses CIP-0112's holding and transfer surfaces and adds
identity, mode, and content. A second transfer protocol would make
token-standard wallets blind to these assets. A V1-only holding does not
conform. V1 wallets see a conforming asset when it also implements the V1
interfaces, which CIP-0112 section 5.1 makes a SHOULD, and this profile
does not raise that to a MUST.

### One instrument per item

`amount = 1.0` and a ban on split and merge make a holding an item rather
than a balance. Each item is its own instrument because a token-standard
transfer or allocation leg names an instrument and an amount, not an
`NftId`: if several items shared one instrument, a wallet that is not
NFT-aware could move the wrong holding, and CIP-0112 net settlement could
complete a 1.0-for-1.0 exchange with no holdings moving. The cost is that
the public instrument list shows every item.

### Declarations are intent

`uniqueness`, `revocable`, and `supersedes` state what the registry
undertakes. They are not ledger proof: a package owner can add a choice in a
later version, and Daml cannot prove which choice created a holding.
On-ledger uniqueness is optional because the record it needs has a cost.
Mode is fixed per item so a soulbound declaration stays true. The `Nft`
interface defines no choices. Transfer, allocation, and burn use CIP-0112.
Revoke and amend stay on the template.

### The metadata key prefix

CIP-0056 requires metadata keys to carry a prefix that identifies who
defines them, so keys from different sources do not collide. This profile
uses its own CIP number, `cip-<nr>/`, the convention of other in-flight
Standards Track drafts. It names the defining document rather than a
company or a project the authors do not control. Any registry may write
the keys. If the package is later maintained inside Splice, a successor
version may move the keys to the `splice.lfdecentralizedtrust.org/`
prefix; until then the number is the namespace.

### Rejected alternatives

A company domain as the key prefix, because a company name does not belong
in a network standard. A Splice prefix and `splice-api-*` package name,
because the package is not part of Splice.
One instrument per collection with many holdings, for the reasons above.
Mandating on-ledger uniqueness, because it is an issuer policy with a
visible cost. Semi-fungible balances, because the token standard already
represents them. A V1 conformance path, because it is a second holding
shape for the same profile.

### Scope

Marketplace listings, offers, escrow, royalties, interchangeable balances
greater than one, and changing mode after issuance are out of scope. An
existing CIP-0112 holding adopts the profile by meeting sections 3 to 9.

## Backwards compatibility

The profile adds one interface package to the token-standard packages and
changes nothing in CIP-0056, CIP-0112, or any deployed asset. A V1-only
holding does not
conform. V1 wallets see a conforming asset when the CIP-0112 section 5.1
interfaces are implemented.

## Reference implementation

A Daml reference implementation (`NftApi`, `NftReference`) will ship with
the conformance suite of section 11 once reworked onto CIP-0112.

## Security considerations

1. **Off-path creation.** Daml cannot prove which choice created a holding.
   Registries SHOULD require an independent operator signatory on issuance
   and publish their registry and operator parties so verifiers can check
   the signatory set.
2. **Uniqueness record growth.** Under `enforced` uniqueness, the on-ledger
   record grows with the collection and concurrent issuance serializes on
   it. Shard if needed.
3. **Registry authority.** A set `revocable` flag means the registry can
   burn the item without the owner's signature. Buyers of such items trust
   the registry with that power.

## References

- [CIP-0056: Canton Network Token Standard](https://github.com/canton-foundation/cips/blob/main/cip-0056/cip-0056.md)
- [CIP-0112: Canton Network Token Standard V2](https://github.com/canton-foundation/cips/blob/main/cip-0112/cip-0112.md)
- [`Splice.Api.Token.HoldingV2`](https://github.com/canton-network/splice/blob/main/token-standard/splice-api-token-holding-v2/daml/Splice/Api/Token/HoldingV2.daml): `HoldingView`, `Account`, `InstrumentId`
- [`Splice.Api.Token.TransferInstructionV2`](https://github.com/canton-network/splice/blob/main/token-standard/splice-api-token-transfer-instruction-v2/daml/Splice/Api/Token/TransferInstructionV2.daml): `TransferFactory`, `TransferInstruction`
- [`token-metadata-v1.yaml`](https://github.com/canton-network/splice/blob/main/token-standard/splice-api-token-metadata-v1/openapi/token-metadata-v1.yaml): instrument listing, per-instrument `supportedApis` and `decimals`
- [ERC-721 metadata JSON schema](https://eips.ethereum.org/EIPS/eip-721): the document format recommended for `cip-<nr>/nft-uri`
