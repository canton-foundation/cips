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
| Operator | A party other than the registry that signs a holding or a registry contract alongside it, such as an independent co-signer of issuance. |
| Account provider | The `provider` of a CIP-0112 account, such as a custodian. |
| Conforming NFT | A CIP-0112 `Holding` contract that implements the `Nft` interface and meets every normative requirement of this CIP (section 11). |
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
first `/` after the prefix; `tokenId` MAY contain `/`. The registry checks
this when it builds an id from its parts: once built, the id of collection
`a/b` and token `1` is also the id of collection `a` and token `b/1`. Ids are
compared as UTF-8 bytes, with no Unicode normalization, so two ids that look
the same and differ in bytes are different ids. Example:
`cip-<nr>/id:nft/posters/7`. The prefix tells a reader
where the format is defined. Transfer, lock, and any recreation of the
holding MUST preserve the instrument id. Burn and revocation end the item.

#### Verification

A verifier checks the holding's signatories and `instrumentId.admin` against
the registry and operator parties it trusts, and checks that the holding
implements `Nft`, that its amount is `1.0`, and that `instrumentId.id` has
the form above. The created event names the holding's template, and the
verifier checks that template id against the template ids the registry
publishes (section 6). The id names
the item inside that party's namespace; it is not a proof of authenticity on
its own.

#### Uniqueness

A registry MUST NOT have two active holdings of the same instrument
(section 4). It MAY declare how it upholds this in `NftView.uniqueness`:

| Value | Meaning |
| ----- | ------- |
| `enforced` | Issuance MUST fail on-ledger if the instrument id was ever issued, checked against a uniqueness record that the registry and any operator signatories sign. |
| `policy` | The check is an off-ledger registry undertaking. |

If `uniqueness` is absent, no claim is made about how. A per-collection
contract that records every id issued, read and updated by the issuing
choice, is one way to enforce it. Canton has no contract keys, so the
ledger cannot prove that a registry keeps only one such record; operator
signatures make a second record visible to the operators (security
consideration 1). A registry SHOULD fix a collection's uniqueness when it
first issues in it, so that every item of the collection declares the same
value; otherwise an item declared `policy` could duplicate an id the record
holds.

A registry MUST NOT issue an instrument id again after its item is burned
or revoked. A replacement is a new item with a new id, which MAY set
`NftView.supersedes` (section 6). Under `enforced`, creating the mint offer
is the step that fails when the id was ever issued, including when an offer
for that id is already open. The id stays issued if that offer is rejected,
withdrawn, or lapses.

#### Identifier privacy

`instrumentId.id` and the instrument entry's `name` and `symbol` reach every
party the item is shared with, and they are public when the registry lists
the item (section 9). They MUST NOT contain personal data or an identifier
of a holder or account. A `tokenId` MAY name the item (a serial, a title, a
name with an issuance number). For an item the registry does not list, the `tokenId` SHOULD
be unguessable unless the registry answers a lookup only for callers it
has authorized to read that item (section 9).

### 4. Instruments and holdings

Each item is one CIP-0056 instrument and exactly one holding of
`amount = 1.0`, with the instrument id of section 3. Supply per instrument
is 0 or 1. Every instrument entry MUST set `decimals` to `0`.
`HoldingView.account.owner` MUST be `Some`, and that party is the item's
owner. A holding that implements only the CIP-0056 V1 interfaces does not
conform.

The template exposes no split, merge, or partial-transfer choice. Every
transfer or allocation of an existing item is for amount `1.0` with one
input holding. A mint offer has no input holding. Burn is a transfer of
`1.0` to the CIP-0112 burn account where the
registry accepts it.

### 5. Transfer and mode

Mode is `transferable` or `soulbound`, fixed for the life of the item, and
reported in `NftView.mode`.

In transferable mode the registry MUST expose the CIP-0112 transfer
factory, and the CIP-0112 allocation factory if allocation is supported.
Delivery versus payment uses the CIP-0112 allocation flow; each item
appears as amount `1.0` on its leg. Each allocation settles its own account,
so the registry carries the item's content from the sender's allocation to
the receiver's: the receiver's holding MUST keep the instrument id, `meta`,
and `Nft` view, as after a transfer. A transferable item SHOULD also
implement the CIP-0056 V1 interfaces, as CIP-0112 section 5.1 recommends,
so it trades on venues and wallets that support only V1.

In soulbound mode the registry MUST NOT allow a transfer or allocation of
the item other than a mint from, or a burn to, the CIP-0112 special
accounts (`cip-112/mint`, `cip-112/burn`; CIP-0112 section 4.3.2.1) that
the registry accepts. Every other transfer or allocation MUST fail,
including on a factory the registry also uses for other instruments. Mint
offers and burn requests are transfer offers, so the registry MAY expose
the transfer factory for them. The instrument's `supportedApis` SHOULD
list only the APIs its mints and burns use. CIP-0056 permits a registry to
omit an API, and the instrument entry records which APIs that instrument
uses. A burn request uses the same transfer
API as an ordinary transfer, so `supportedApis` cannot tell a wallet that
only burns succeed: a wallet that reads `NftView.mode` SHOULD offer no
transfer of a soulbound item other than a burn, and one that does not may
offer a transfer the registry then refuses.

In either mode, a registry MUST serve, through the CIP-0056 off-ledger
APIs, the choice contexts for every transfer, allocation, mint offer, and
burn request it accepts. Whether a holder may burn an item is registry
policy.

Every change to an item's holding, including a mint, transfer, settlement,
burn, revocation, or a content change that recreates it, MUST be reported as
CIP-0112 section 5.1 requires for any holding: each create and each
archive of a holding is represented in exactly one
`EventLog_HoldingsChange` event (`splice-api-token-transfer-events-v2`),
an event of that holding's account. A holding created and archived in the
same transaction is reported for both.

### 6. Issuance and revocation

Issuance mechanics are registry-defined. A mint SHOULD be a transfer offer
from the mint account (CIP-0112 section 4.3.2.1) that the recipient accepts
through the ordinary transfer-instruction flow. A registry SHOULD require
an independent operator signatory on issuance and publish its registry and
operator parties and the template ids it issues from.

A registry MAY declare in `NftView.revocable` whether it can burn the item
without the owner's authority. The declaration states intent; it is not a
ledger guarantee. A revocation or burn SHOULD carry a human-readable
`splice.lfdecentralizedtrust.org/reason` (CIP-0056). A new item MAY set
`NftView.supersedes` to the instrument id it replaces.

### 7. Metadata and content

Content is off-ledger. The holding carries identity, content URIs, and an
optional hash. The URIs live in `Holding` `meta`, so token-standard wallets
that do not implement the `Nft` interface can still display the item.
Wallets SHOULD render `cip-<nr>/nft-image`, or else
the `image` of the document at
`cip-<nr>/nft-uri`, and SHOULD show `cip-<nr>/nft-name` as the item's name.
The instrument entry's `name` SHOULD equal it.

| Key | Presence | Value |
| --- | -------- | ----- |
| `cip-<nr>/nft-name` | Required | Display name of the item |
| `cip-<nr>/nft-description` | Optional | Short description |
| `cip-<nr>/nft-image` | Recommended | URI of a public rendering |
| `cip-<nr>/nft-uri` | Recommended | URI of a metadata document; RECOMMENDED to follow the ERC-721 metadata JSON schema (`name`, `description`, `image`, `attributes`) |
| `cip-<nr>/nft-content-hash` | Optional | Hash of the bytes at `cip-<nr>/nft-uri`, hex with an algorithm prefix (`sha256:`) |
| `cip-<nr>/nft-confidentiality-ref` | Optional | URI of access-controlled off-ledger content (see below) |

`cip-<nr>/nft-*` keys not defined here are reserved
for later versions of this profile and SHOULD NOT be written. Keys under
other prefixes are free, following the CIP-0056 prefix rule. Transfer,
allocation, and lock MUST copy `meta` unchanged.

Content behind `cip-<nr>/nft-confidentiality-ref` is access-controlled by
the registry and is not part of the holding: it MAY change without
recreation, including while the holding is locked, and
`cip-<nr>/nft-content-hash` does not cover it.

A registry MAY change an item's content by recreating its holding, as it
can for any holding. This profile does not require it to let the owner do
so. The new holding MUST keep its instrument id, mode, `uniqueness`,
`revocable`, `supersedes`, and `HoldingView.account`. The registry MUST NOT recreate a locked holding: a
relative lock measures its deadline from the holding's creation, which
recreation would reset.

### 8. The `Nft` interface

The data types derive `Serializable`, so the package builds with
`--explicit-serializable=yes`, as the Splice token packages do.

```haskell
module Splice.Api.Token.NonFungible.V1 where

import Splice.Api.Token.HoldingV2 (Holding, HoldingView, InstrumentId)

data NftMode = NftMode_Transferable | NftMode_Soulbound
  deriving (Eq, Show, Serializable)

data NftUniqueness = NftUniqueness_Enforced | NftUniqueness_Policy
  deriving (Eq, Show, Serializable)

data NftView = NftView with
    mode       : NftMode
    uniqueness : Optional NftUniqueness
    revocable  : Optional Bool
    supersedes : Optional InstrumentId
  deriving (Eq, Show, Serializable)

-- | What `Nft_PublicFetch` returns, computed by the ledger from the contract.
data Nft_PublicFetchResult = Nft_PublicFetchResult with
    holdingView : HoldingView
    nftView     : NftView
    signatories : [Party]
  deriving (Eq, Show, Serializable)

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

An item is private unless its registry lists it. Each item is its own
instrument (section 4), so a list of a registry's instruments is a list of
its items: it discloses that each item exists, how many items a collection
has, and their token ids. Active holdings SHOULD be visible only to the
owner, the account provider, the registry, any operator signatory, and the
parties CIP-0112 requires for locks and pending instructions. Holder
enumeration is out of scope.

#### Listing and lookup

A registry is not required to return an item from
`GET /registry/metadata/v1/instruments`, and SHOULD list only items it means
to be publicly discoverable, such as a collection offered on venues. The
listing pages but has no filter, so a reader browsing one collection pages
through every listed item of the registry. The id prefix
`cip-<nr>/id:nft/<collectionId>/` is a natural filter for a later revision
of the metadata API.

Reading one item does not need the listing, and `listInstruments` omits
unlisted items, so a wallet SHOULD look up each held instrument by id. A
wallet reads its own items
through the Ledger API and looks up each instrument with
`GET /registry/metadata/v1/instruments/{instrumentId}`, percent-encoding
the id because it contains `/`. A registry SHOULD answer that lookup
whether or not it lists the item, so wallets can read `decimals` and
`supportedApis`. An unlisted item's id is known only to the holding's
stakeholders and the parties they share the item with, and it protects the
entry as a contract id protects the other CIP-0056 registry endpoints. A
registry MAY instead answer a lookup only for callers it has authorized to
read that item. Authenticating the caller is not enough: another
authenticated caller could still probe a guessable id. Such a registry
MUST answer any other caller the same way whether or not the item exists,
or the refusal itself confirms a guessed id. CIP-0056
standardizes no authentication scheme, so wallets that do not support the
registry's own cannot read the entry. A wallet that cannot read the entry
SHOULD render the item from its `Holding` metadata (section 7) and treat
`decimals` as `0`.

#### Sharing an item

Listing an item shares its existence and identity. It does not share a
holding. To show a holding to a party that is not a
stakeholder, a stakeholder hands them the holding's created event, sent
off-ledger. The stakeholder MUST include the created-event blob and the
computed `Holding` and `Nft` interface views, and requests them explicitly,
because the default event filter omits them. The `Holding`
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
| An attestation about a party that an app only checks and that has no economic terms or lifecycle of its own, such as a published service URL or eligibility to hold an asset | Not this profile. |
| License or entitlement that the registry issues, amends, and revokes, such as a data license | Soulbound, `revocable` set, `uniqueness` `enforced`. The licensee is the owner and signs nothing; only the registry revokes the license or changes its terms. Terms change by recreating the holding (section 7). |
| Item whose existence is confidential | Not listed (section 9). |
| License or name issued again after a burn or revocation | A new item with a new id that carries `supersedes`. |
| Issuer inventory, later sold | Mint to the registry's own party, then transfer. |
| Lost key | Revoke, then issue a new item that carries `supersedes`. |
| Updated picture or attributes | The registry recreates the holding with new content keys (section 7). |
| Airdrop | A mint offer the recipient accepts. |
| Marketplace trade | A token-standard transfer or allocation. Listings, escrow, and royalties are out of scope. |
| Regulated certificate | Soulbound, `revocable` set. |
| Item that records a quantity, such as a share count, face value, or seat count | The quantity is content under the registry's own metadata prefix. The holding's amount stays `1.0`. |
| Item that must settle against payment between holders | Transferable mode. A soulbound item is allocated only for a mint or a burn, so it can be paid for at issuance and not resold. |

### 11. Conformance

An implementation conforms if it satisfies every normative requirement in
this CIP. The conformance suite published with the reference implementation
tests the on-ledger requirements.

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
a registry's instrument list would show every item, including how many
items a collection has and their token ids. Listing is therefore the
registry's choice (see "Private by default").

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
Mode is fixed per item so a soulbound declaration stays true. An id is
issued once so that a reference to it, such as `supersedes` or a record
kept outside the ledger, never comes to mean a different item. The `Nft`
interface defines one choice, and it only reads. Transfer, allocation, and
burn use CIP-0112.
Revocation and content changes stay on the template.

### Soulbound items

A soulbound item is a holding. It has an instrument, an amount of `1.0`,
content a wallet renders, and an identity that issuance, burn, and
revocation act on. Use this profile when the thing is an item in its own
right: it is issued to an owner, appears in that owner's wallet as an
asset, and is amended or revoked as one unit. A certificate of a registered
position and a license with its own terms are examples. An attestation
about a party that an application only checks and that has no economic
terms or lifecycle of its own, such as eligibility to hold an asset, is
outside this profile.

### Private by default

CIP-0056 expects registry metadata to be public, and its metadata API
describes `listInstruments` as listing every instrument of the registry.
That fits fungible assets, where an instrument is an asset class and the
list says nothing about holdings. Under this profile each item is its own
instrument with a supply of 0 or 1, so the list enumerates holdings, which
CIP-0056 shares on a need-to-know basis. A registry of certificates or
licenses often cannot publish how many it has issued. Listing is therefore
a disclosure the registry chooses. Lookup by id stays open because CIP-0056
already protects its other registry endpoints with identifiers that are
hard to guess, and a wallet never needs the list: it reads holdings from
the Ledger API and looks up each instrument by id.

### The metadata key prefix

CIP-0056 asks for metadata keys to carry a DNS-subdomain prefix that
identifies the organization defining them, so keys from different sources
do not collide. This profile uses its own CIP number, `cip-<nr>/`, as
CIP-0112 does with `cip-112/` and as other in-flight Standards Track drafts
do, and the same prefix starts its instrument ids. It is a valid DNS label
that names the defining document rather than a company. Any registry may write
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
  and uniqueness as typed values instead of parsing text.
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
greater than one, changing mode after issuance, validity periods,
conditions on who may receive a transfer, and collection-level metadata
such as a collection name or edition size are out of scope. A registry
carries them under its own metadata prefix or in its own contracts. An
existing CIP-0112 holding adopts the profile by meeting its requirements.

## Backwards compatibility

The profile adds one interface package to the token-standard packages and
changes nothing in CIP-0056, CIP-0112, or any deployed asset. A registry
that leaves its items out of `listInstruments` departs from the CIP-0056
expectation that registry metadata is public (see "Private by default").
V1 wallets see a conforming asset when the CIP-0112 section 5.1
interfaces are implemented.

## Reference implementation

The Daml reference implementation is built on CIP-0112. It has the `Nft`
interface package, a reference registry, a soulbound certificate built on
the profile, and the conformance suite of section 11. The registry covers
mint offers, transfers in one or two steps (V2 and V1), allocations settled
in batches, soulbound items, burns, revocation, content changes, and
enforced uniqueness. The suite is not complete yet: it does not cover
iterated settlement, allocations of mints and burns, or holdings created
and archived in one transaction. It will be completed and published with
built packages before this CIP is `Final`.

## Security considerations

1. **Off-path creation.** Daml cannot prove which choice created a holding.
   An independent operator signatory on issuance, and published registry
   and operator parties, let verifiers check the signatory set (section 6).
   Published template ids let a verifier reject a holding from a template
   the registry no longer issues (section 3).
2. **Uniqueness record growth.** Under `enforced` uniqueness, the on-ledger
   record keeps every id issued, including burned and revoked ones, so it
   only grows, and concurrent issuance serializes on it. Shard if needed.
3. **Registry authority.** A set `revocable` flag means the registry can
   burn the item without the owner's signature. Buyers of such items trust
   the registry with that power.
4. **Unlisted items.** Leaving an item out of the listing hides it from
   enumeration, not from a party that learns its id. A registry that
   answers a lookup without checking that the caller may read that item,
   or that refuses differently for an item that exists and one that does
   not, confirms a guessed id (sections 3 and 9).

## References

- [CIP-0056: Canton Network Token Standard](https://github.com/canton-foundation/cips/blob/main/cip-0056/cip-0056.md)
- [CIP-0112: Canton Network Token Standard V2](https://github.com/canton-foundation/cips/blob/main/cip-0112/cip-0112.md)
- [`Splice.Api.Token.HoldingV2`](https://github.com/canton-network/splice/blob/main/token-standard/splice-api-token-holding-v2/daml/Splice/Api/Token/HoldingV2.daml): `HoldingView`, `Account`, `InstrumentId`
- [`Splice.Api.Token.TransferInstructionV2`](https://github.com/canton-network/splice/blob/main/token-standard/splice-api-token-transfer-instruction-v2/daml/Splice/Api/Token/TransferInstructionV2.daml): `TransferFactory`, `TransferInstruction`
- [`token-metadata-v1.yaml`](https://github.com/canton-network/splice/blob/main/token-standard/splice-api-token-metadata-v1/openapi/token-metadata-v1.yaml): instrument listing, per-instrument `supportedApis` and `decimals`
- [ERC-721 metadata JSON schema](https://eips.ethereum.org/EIPS/eip-721): the document format recommended for `cip-<nr>/nft-uri`
