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
| Collection | A named group of items under one registry sharing a `tokenId` namespace. |
| Conforming NFT | A `Holding` contract that meets sections 3 to 9 and implements the `Nft` interface. |
| Transferable mode | The holder may move the item through the CIP-0112 transfer and allocation flows. |
| Soulbound mode | The holder cannot transfer or allocate the item. |

### 2. Packages

The profile is one pinned interface package, named and laid out like the
Splice token-standard packages it builds on.

| Package | Module | Contents |
| ------- | ------ | -------- |
| `splice-api-token-non-fungible-v1` | `Splice.Api.Token.NonFungible.V1` | `Nft` interface and its types (section 8) |

The package depends on `splice-api-token-holding-v2` for `InstrumentId`.
Metadata is the extension point: a later version of this profile adds
information as `cip-<nr>/nft-*` keys (section 7), which takes an amendment
to this CIP and no new package. Only a new typed field in the view ships as
`splice-api-token-non-fungible-v2`, because Daml interface packages are not
changed in place. A template implements the current version and MAY
implement earlier ones alongside it.

### 3. Identity

An item's identity is its CIP-0056 `InstrumentId`. `instrumentId.admin`
is the registry party, and `instrumentId.id` names the collection and the
item:

```text
cip-<nr>/id:nft/<collectionId>/<tokenId>
```

`collectionId` names a collection under the registry party, and `tokenId`
names one item in that collection. The registry assigns both, and both MUST
be non-empty. `collectionId` MUST NOT contain `/`, so the id splits at the
first `/` after the prefix; `tokenId` MAY contain `/`. Ids are compared as
UTF-8 bytes. Example: `cip-<nr>/id:nft/posters/7`. The prefix tells a reader
where the format is defined. Transfer, lock, and any recreation of the
holding MUST preserve the instrument id. Burn and revocation end the item.

#### Verification

A verifier checks the holding's signatories and `instrumentId.admin` against
the registry and operator parties it trusts, and checks that the holding
implements `Nft` and that `instrumentId.id` has the form above. The id names
the item inside that party's namespace; it is not a proof of authenticity on
its own.

#### Uniqueness

A registry SHOULD NOT have two active holdings of the same instrument. The
registry MAY declare how it upholds this in `NftView.uniqueness`:

| Value | Meaning |
| ----- | ------- |
| `enforced` | Issuance MUST fail on-ledger if the instrument already has an active holding. |
| `policy` | The check is an off-ledger registry undertaking. |

If `uniqueness` is absent, no claim is made. A per-collection contract that
records live ids, read and updated by the issuing choice, is one way to
enforce it. A `tokenId` MAY be issued again after the earlier item was
burned or revoked; the new holding is a new item, and applications identify
a live item by its active holding.

#### Identifier privacy

`instrumentId.id` and the instrument entry's `name` and `symbol` are public.
They MUST NOT contain personal data or an identifier of a holder or account.
A `tokenId` MAY name the item (a serial, a title, a domain name).

### 4. Instruments and holdings

Each item is one CIP-0056 instrument and exactly one holding of
`amount = 1.0`, with the instrument id of section 3. Supply per instrument
is 0 or 1. Every instrument entry MUST set `decimals` to `0`.
`HoldingView.account.owner` is `Some` for every conforming holding, and
that party is the item's owner.

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
appears as amount `1.0` on its leg. A transferable item SHOULD also
implement the CIP-0056 V1 interfaces, as CIP-0112 section 5.1 recommends,
so it trades on venues and wallets that support only V1.

In soulbound mode the registry MUST NOT allow a transfer or allocation of
the item other than a mint from, or a burn to, the CIP-0112 special
accounts (`cip-112/mint`, `cip-112/burn`; CIP-0112 section 4.3.2.1) that
the registry accepts. Every other transfer or allocation MUST fail,
including on a factory the registry also uses for other instruments. Mint
offers and burn requests are transfer offers, so the registry MAY expose
the transfer factory for them. The instrument's `supportedApis` SHOULD
list only the APIs its mints and burns use; `token-metadata-v1.yaml` makes
these APIs optional per instrument. A burn request uses the same transfer
API as an ordinary transfer, so `supportedApis` cannot tell a wallet that
only burns succeed: a wallet that reads `NftView.mode` SHOULD offer no
transfer of a soulbound item other than a burn, and one that does not may
offer a transfer the registry then refuses.

Every change to an item's holding, including a mint, transfer, burn,
revocation, or a content change that recreates it, MUST be reported as
CIP-0112 section 5.1 requires for any holding: exactly one
`EventLog_HoldingsChange` event (`splice-api-token-transfer-events-v2`)
for each holding created or archived.

### 6. Issuance and revocation

Issuance mechanics are registry-defined. A mint SHOULD be a transfer offer
from the mint account (CIP-0112 section 4.3.2.1) that the recipient accepts
through the ordinary transfer-instruction flow.

A registry MAY declare in `NftView.revocable` whether it can burn the item
without the owner's authority. The declaration states intent; it is not a
ledger guarantee. A revocation or burn SHOULD carry a human-readable
`splice.lfdecentralizedtrust.org/reason` (CIP-0056). A new item MAY set
`NftView.supersedes` to the instrument id it replaces. The pointer names
that instrument, not one past holding: if the id has been issued more than
once, it does not select which holding.

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

A registry MAY change an item's content by recreating its holding, as it
can for any holding. This profile does not require it to let the owner do
so. The new holding MUST keep its instrument id, mode, `uniqueness`, and
`HoldingView.account`. The registry MUST NOT change the content of a locked
holding: a relative lock measures its deadline from the holding's
creation, which recreation would reset.

### 8. The `Nft` interface

```haskell
module Splice.Api.Token.NonFungible.V1 where

import Splice.Api.Token.HoldingV2 (Holding, HoldingView, InstrumentId)

data NftMode = NftMode_Transferable | NftMode_Soulbound
  deriving (Eq, Show)

data NftUniqueness = NftUniqueness_Enforced | NftUniqueness_Policy
  deriving (Eq, Show)

data NftView = NftView with
    mode       : NftMode
    uniqueness : Optional NftUniqueness
    revocable  : Optional Bool
    supersedes : Optional InstrumentId
  deriving (Eq, Show)

-- | What `Nft_PublicFetch` returns, computed by the ledger from the contract.
data Nft_PublicFetchResult = Nft_PublicFetchResult with
    holdingView : HoldingView
    nftView     : NftView
    signatories : [Party]
  deriving (Eq, Show)

interface Nft requires Holding where
  viewtype NftView

  nonconsuming choice Nft_PublicFetch : Nft_PublicFetchResult
    -- ^ Read the item. Any party may call it on a disclosed contract.
    with
      actors : [Party]
    controller actors
    do pure Nft_PublicFetchResult with
         holdingView = view (toInterface @Holding this)
         nftView = view this
         signatories = signatory this
```

The same template implements CIP-0112 `Holding` and `Nft`; `Nft` requires
`Holding`, so the compiler checks it. The `Nft` view carries only what
`Holding` does not: identity, owner, and content stay in `HoldingView`
(`instrumentId`, `account.owner`, and `meta`). Prose in this CIP names
constructors by their lowercase suffix (`soulbound`, `enforced`).

The interface defines one choice, `Nft_PublicFetch`, and it only reads.
Daml authorizes a `fetch` only when a stakeholder of the contract is among
the authorizers, so a party that is not a stakeholder reads a disclosed
item through a choice it controls, as with the token standard's
`*_PublicFetch` choices (section 9). As there, "public" means that any
party the contract is disclosed to may call it; it does not make the item
public, and the holding's stakeholders decide whom to disclose it to. The
body is defined in the interface, so the result comes from the ledger and
the template's views, with no further implementation code.

### 9. Privacy and listing

CIP-0056 registry metadata is public: `GET /registry/metadata/v1/instruments`
lists every instrument, and therefore every item. It discloses how many
items a collection has, not who holds them. Reading one item does not
need the listing: a wallet reads its own items through the Ledger API, and
anyone can look up one instrument with
`GET /registry/metadata/v1/instruments/{instrumentId}`, percent-encoding
the id because it contains `/`. Browsing a collection does: the listing
pages but has no filter, so a reader pages through every item of the
registry. The id prefix `cip-<nr>/id:nft/<collectionId>/` is a natural
filter for a later revision of the metadata API. Active holdings SHOULD be
visible only to the owner, the account provider, the registry, any
operator signatory, and the parties CIP-0112 requires for locks and pending
instructions. Holder enumeration is out of scope.

#### Sharing an item

The public instrument listing shares an item's existence and identity. It
does not share a holding. To show a holding to a party that is not a
stakeholder, a stakeholder hands them the holding's created event, sent
off-ledger. The event MUST carry its created-event blob and the computed
`Holding` and `Nft` interface views: the stakeholder requests them
explicitly, because the default event filter omits them. The `Holding`
view renders the item, the `Nft` view gives its mode, the party lists
carry the signatories that section 3 checks, and the
blob authenticates the contract: the
recipient attaches it to a command submission as a disclosed contract
(Canton explicit disclosure). The shared views are rendering copies;
verification does not trust them. The recipient exercises
`Nft_PublicFetch` on the disclosed contract with itself as the actor, from
a Daml Script or a command on its own participant, and the ledger computes
the views and signatories from the authenticated contract. A plain `fetch`
would fail, because the recipient is not a stakeholder. The recipient's
participant must have vetted the item's template package. The recipient
then renders and verifies the item per section 3, and neither the registry
nor the holder submits anything. The transaction still needs confirmation
from the participants hosting the holding's signatories, so those must be
online, and the signatories see the check and who made it. It also costs
the recipient a transaction's traffic. A registry MAY also offer an
off-ledger check that a holding is active; this profile does not
standardize one, and such a check relies on trusting the registry, since
Canton has no third-party proof yet that a contract is active.

A shared created event is a snapshot: later content changes or transfers are
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
| One-of-one art, or a numbered edition | Each copy is its own `tokenId` and its own holding of `1.0`. |
| Interchangeable copies as a balance greater than one | Not this profile. One CIP-0056 instrument with `decimals = 0` and amount equal to the supply. |
| Ticket redeemed | Burn the ticket, or issue a soulbound pass at the door. |
| Membership, badge, or a credential the holder shows as an item | Soulbound. `revocable` set if the issuer may cancel. |
| A claim about a party that an app only checks, such as a published service URL or eligibility to hold an asset | Not this profile. |
| License or domain reissued under the same id after burn | Permitted. Applications identify the live item by its active holding. |
| Issuer inventory, later sold | Mint to the registry's own party, then transfer. |
| Lost key | Revoke, then issue a new item that carries `supersedes`. |
| Updated picture or attributes | The registry recreates the holding with new content keys (section 7). |
| Airdrop | A mint offer the recipient accepts. |
| Marketplace trade | A token-standard transfer or allocation. Listings, escrow, and royalties are out of scope. |
| Regulated certificate | Soulbound, `revocable` set, `uniqueness` `enforced`. |

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

A transferable item is worth most when every venue and wallet that
handles token-standard assets can trade it. Building on CIP-0112, plus the
V1 interfaces where a registry adds them, gets it there with no
marketplace-specific protocol. Collectibles, tickets, memberships, licenses,
domain names, and regulated certificates are different choices on this
profile, not different standards.

## Rationale

### A profile on Token Standard V2

The profile reuses CIP-0112's holding and transfer surfaces and adds
identity, mode, and content. A second transfer protocol would make
token-standard wallets blind to these assets. A V1-only holding does not
conform. A conforming NFT can and should also implement CIP-0056: V1
wallets and venues see it when it implements the V1 interfaces, which
CIP-0112 section 5.1 and section 5 here make a SHOULD for transferable
items. The profile does not raise that to a MUST, so V2-only registries and
soulbound items, which never trade, can conform.

### One instrument per item

`amount = 1.0` and a ban on split and merge make a holding an item rather
than a balance. Each item is its own instrument because a token-standard
transfer or allocation leg names an instrument and an amount, not an
item: if several items shared one instrument, a wallet that is not
NFT-aware could move the wrong holding, and CIP-0112 net settlement could
complete a 1.0-for-1.0 exchange with no holdings moving. The cost is that
the public instrument list shows every item, including how many items a
collection has and their token ids.

### Identity in the instrument id

Wallets and explorers show instrument ids as text. Putting the collection
and token ids in `instrumentId.id`, behind a prefix that names this CIP,
makes the item readable wherever the id appears and leaves one identity
for readers to check. The `Nft` view therefore does not repeat identity,
owner, or content, and needs no rules to keep copies equal.

### Declarations are intent

`uniqueness`, `revocable`, and `supersedes` state what the registry
undertakes. They are not ledger proof: a package owner can add a choice in a
later version, and Daml cannot prove which choice created a holding.
On-ledger uniqueness is optional because the record it needs has a cost.
Mode is fixed per item so a soulbound declaration stays true. The `Nft`
interface defines one choice, and it only reads. Transfer, allocation, and
burn use CIP-0112.
Revocation and content changes stay on the template.

### Soulbound items

A soulbound item is a holding. It has an instrument, an amount of `1.0`,
content a wallet renders, and an identity that issuance, burn, and
revocation act on. Use this profile when the item must appear in the
holder's wallet as an asset, such as a certificate of a registered
position. A fact an application only checks, such as eligibility to hold
an asset, is outside this profile.

### The metadata key prefix

CIP-0056 requires metadata keys to carry a prefix that identifies who
defines them, so keys from different sources do not collide. This profile
uses its own CIP number, `cip-<nr>/`, the convention of other in-flight
Standards Track drafts, and the same prefix starts its instrument ids. It
names the defining document rather than a company. Any registry may write
the keys.

### Rejected alternatives

- **Metadata only, with no interface.** Content already lives in
  metadata, so wallets that know only `Holding` display items. The
  interface adds what metadata cannot. `Holding` defines no choices, so
  metadata alone leaves a party that is not a stakeholder no on-ledger way
  to read a shared item; `Nft_PublicFetch` gives it one (section 9). Apps
  and wallets find NFTs with one Ledger API interface filter on `Nft`
  instead of reading every holding and parsing its metadata, and Daml
  workflows such as escrow, settlement, or a certificate check read mode
  and uniqueness as typed values instead of parsing text. An app that wants only NFTs queries active contracts with
  an interface filter on `Nft`. A wallet queries with interface filters
  for both `Holding` and `Nft`, views requested: filters combine, so every
  holding returns with its `Holding` view, and NFTs also carry an `Nft`
  view.
- **A typed `NftId` with a length-prefixed text form.** It is unambiguous
  for any characters, but it repeats the instrument id, needs rules to keep
  the copies equal, and reads poorly where ids are shown.
- **A company domain as the key prefix.** A company name does not belong in
  a network standard.
- **One instrument per collection with many holdings.** See "One
  instrument per item".
- **Mandatory on-ledger uniqueness.** It is an issuer policy with a visible
  cost.
- **Semi-fungible balances.** The token standard already represents them.
- **A V1-only conformance path.** A holding that implements only CIP-0056
  would be a second holding shape for the same profile.

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
