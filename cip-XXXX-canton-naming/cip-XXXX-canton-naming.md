# Canton Naming — registry for .canton names

<pre>
  CIP: ?
  Layer: Applications
  Title: Canton Naming — registry for .canton names
  Author: Axymos
  Status: Draft
  Type: Standards Track
  Created: 2026-05-13
  License: CC0-1.0
  Version: 1.1
</pre>

## Version History

Updated to capture:
* Clearer outline, focused on the end-user
* Alignment to standards — `NameRecord` now implements CIP-56 token standard as well as the in-flight `RegistryV1.Credential`
* `NameRegistry` now also implements `RegisterV1.CredentialFactory`
* DRO is now an multi-hosted external party under a decentralised namespace definition, with each on-boarded registrar being 
  * a quorum for the DND
  * a signer of manual TXs as the DRO
  * a whitelisted registrar in their own right (e.g. for attribution)
* simplified elements like disputes on-chain (which can now be raised by a single registrar and then executed by simple DRO quorum)
* simplified payment structure for things like after-market sales, which now go through CIP-56 standard flows for DvP.
* simplified payment strucutre for registrations, which now are two straight transfers from…
  * holder -> DRO
  * holder -> facilitating registrar
* added the concept of a "Treasury" contract for paying fees to DRO members, to reduce the number of transfers for each registration
* added a "Pauseable" concept to the registry as an 'emergency break' on the system
* Moved the concept of "reserved list" on-chain by pre-registering names that should be reserved at bootstrap phase (e.g. names of existing supervalidators/validators/featured apps, so they can be claimed by these parties)

## Abstract

This CIP defines **Canton Naming**, a registry for human-readable `.canton` names on the Canton Network. Names like `alice.canton` resolve on-chain to Canton parties, providing a single source of truth for identity and discovery across decentralised applications.

The protocol is designed up-front to be decentralised, where a pool of registrars can each sell name records to their end users but have them backed by a shared, centralised registry on-chain.

We believe that this is key to having a naming service be a value-add on the network, as names are only useful to end users if they can be relied upon to resolve to the same party. 

The collective pool of registrars will operate a shared party, the "Decentralised Registry Operator" (DRO, modelled on the DSO — the Decentralised Synchroniser Operator party that operates the Global Synchronizer). This will allow for all records to be created by a single party and means that we have a single maintainer of the contract keys used on-chain regardless of who has registered a given name.

Governance of the service is managed by consensus among the approved registrars. Parameters of the service (like min pricing, vote thresholds etc) can be agreed upon by the governance layer and then are stored in the Name Registry contract itself. Registrars compete to provide name sales, renewals, and support to end users, but every name they sell is recorded in the same canonical `NameRegistry` contract. 

The reference implementation (to follow) is a DAML contract package targeting Canton SDK 3.5.2. All authorisation flows through DAML's signatory model; the DAR would be vetted, so holders can exercise their own choices directly via the JSON Ledger API.

## Motivation

Applications building on the Canton Network today address users by raw Canton party IDs — long, opaque strings that can't be memorised or shared verbally. Without a shared naming convention, every application ships its own ad-hoc directory or relies on out-of-band identity exchange.

A naming layer only adds value if every name resolves to a single, agreed-upon entity — like a phone number or a bank account number. Two competing registries for the same namespace don't add resilience; they create confusion and erode user trust. Canton Naming is a **single source of truth** for `.canton` names: publicly queryable on-chain, backed by one canonical on-chain registry, while permitting any number of competing registrar products to participate in name sales, renewals, and support.

Resilience is built in at both layers — the registry is operated by a multi-hosted DRO party so it survives any single hosting participant going down, and the set of registrars is governed on-chain so individual registrars can come and go without interrupting the registry itself.

## Overview

A higher-level walk-through of the system — the UX, the economic model, and the technical implementation — ahead of the formal specification below.

### User flows

- **Register a name** — signed by a facilitating registrar and the end-user holder. Users transfer funds from their wallet directly. The facilitating registrar takes a fee, with a remaining percentage going to the treasury (which provides a share of the fee to all whitelisted registrars, to cover the cost of governance operations). Name records are created as their own contract which itself implements CIP-56 and RegistryV1.Credentials interfaces
- **Renew** — `UpdateCredentials` extends an existing record, signed by the holder and the DRO.
- **Transfer** — supported via the CIP-56 standard.
- **Sale** — registrars can facilitate a sale, which again leans on the CIP-56 interfaces.
- **Expired names** — registrars can archive an expired record and reissue it to a new holder. This is not gated — any whitelisted registrar can do this. There's no vendor lock-in.

### Governance flows

There are a couple of "emergency brakes" on the system:

- A whitelisted registrar can raise a dispute against a record. A disputed record can be archived by a k-of-n signing from the DRO, which constitutes a vote.
- Any registrar can pause the registry if needed. Pausing freezes the registry's whole write surface — new registrations, transfers, allocations, and renewals. Unpausing requires a 2/3 registrar governance vote (`GA_Unpause`).

Abuse of these is left to governance policy, agreed between the registrars themselves (TBD). They should be treated like "break glass" mechanisms — not expected to be used in normal operation of the system.

Rogue registrars, acting in bad faith, can be removed: as a host of the DRO via the standard decentralised namespace definition flows, and from the on-chain registrar allowlist via a `GA_RemoveRegistrar` governance vote.

To provide for fair competition between different companies, a baseline floor for pricing is set in the `NameRegistry` contract itself, and is subject to a registrar governance vote (`GA_UpdateFees`) to change.

### UX

*What problems are solved, and what UX flows are provided to solve them.*

This CIP is aimed to be a shared foundation that allows multiple registrars to operate without conflict in the same shared namespace.

In that light, the exact end-user experience that will be created in an individual registrar's dApp is out of scope of the CIP itself, and for competing offerings to decide upon. But each registrar should be able to offer the following:

* Browse the registry and see which names are pre-existing
* If a name isn't listed, sell it as available
* Allow holders of names to renew, extending their expiry
* Allow holders of names to sell or transfer the name to others

ALl of these flows are unlocked "out of the box" by adhering to the existing CIP-56 standards and the in-flight standards from CIP-XXX (metadata/credentials) and would be supported by any registrar. There's no "vendor lock-in", i.e. a name registered by one registrar could be renewed by another etc.

### Economic model

*Who does what, and why are they willing to do this?*

Individual companies can be onboarded as a registrar. Since they're hosting the DRO, we assume for simplicity that these would also be companies running their own validator to host the party. To onboard, they will:

- Host the DRO
- Have their own registrar party added as an approved (whitelisted) registrar

The registrar can then facilitate registration / renewal / sale for end users. Facilitating registrars can take X percent of the fee for registration — they're competing on the UX of their product itself.

Other registrars (since they're required to run the DRO) also get a fee share on registrations. The flow:

- The user makes a payment
- `NameRegistry` guarantees it's above the minimum floor and done on the basis of validaity (e.g. `minFloorRate * expiry`)
- The fee that the end-user pays is split into two transfers, both sent by the user: the facilitating registrar's commission goes straight to them, and the remainder goes to the DRO treasury

The treasury accrual to the registrar group can be withdrawn every X via a `Treasury` contract, which gives an even split of the treasury pool to currently whitelisted registrars.

### Technical implementation

*Component view: dApp(s), backends running at registrars, `.dar` packages vetted by users, `.dar` packages vetted by registrars only.*

Since `NameRecords` are implementing `RegistryV1.Credential` the holder is a party on the contract instance itself. As such, we assume that any validator who wants to offer name sales to their user will have the DAR vetted. 

Each whitelisted registrar would be expected to provide off-chain resolution of names from their own stack, but should be free to put controls in place to prevent abuse (e.g. API keys, rate limits etc).

In addition to vetting the DAR, validators who are themselves registrars would also need to run a service to counter-sign transactions as the DRO, where needed.

The "human in the loop" decisions are sparse (full table below) but mainly voting on disputes and on governance proposals (add/remove registrar, fee changes, unpausing) — routine registrations and renewals are signed automatically.

End-users should have visibility over their own assets via the CIP-56 standard, even without the DAR installed, but interacting with their records would require the DAR available.

| Role | Vets the XNS DAR | Holds a DRO key + runs signer/policy | Runs the registry HTTP service | In the on-ledger allowlist |
|------|:---:|:---:|:---:|:---:|
| **Registrar validator** | ✓ | ✓ | ✓ (may be shared) | ✓ |
| **Holder validator** | ✓ | — | — | — |


#### Information flows

TBC.

#### Key design decisions

**Ensuring uniqueness of names.** There are two layers to this:

1. How to stop a rogue registrar acting unilaterally
2. How to prevent honest registrars from hitting a race condition

For the first, `NameRecord`s require the DRO's signing authority. On bootstrapping of the service, this comes from a k-of-n ceremony between the initial hosting registrars. Any `NameRecord` created via `NameRegistry.RegisterName()` then inherits this automatically.

A rogue registrar cannot bypass or forge this authority by manually creating a `NameRecord` — directly creating a DRO-signed contract needs fresh DRO authority, and an honest quorum of signers will refuse to countersign a bare record create. (The residual risk is a colluding quorum of k registrars.)

For race conditions, we've implemented a sharding mechanism, whereby a "consistent hashing" of names picks a deployed shard to consume. In a race where honest registrars A and B both try to register `alice.canton` against the same offset:

- They both prepare and submit a transaction that aims to consume the same shard
- The loser of the race has their transaction rejected — it's trying to exercise a choice on a now-archived contract
- Resubmitting at the next block means the contract keys now pick up the existing `alice.canton` record

#### Link to PoC implementation

TBC.

## Specification

### Overview

Two core contracts drive the system: **NameRegistry** (a singleton gateway for all name operations) and **NameRecord** (one per registered name, keyed by `(dro, name)`). All flows below operate through these contracts.

### Lifecycle flows

#### Registration

```
Off-chain: Registrar does 'pre-flight' checking of availability / blacklist, holder funds etc.
    |
On-chain: RegisterName (on NameRegistry)
  -> assertMsg "Registrar not in allowlist"
  -> assertMsg "Invalid name format" (isValidName — lowercase, .canton suffix, no leading/trailing hyphens, 1–63 chars)
  -> assertMsg "Payment >= minPriceFloor"
  -> lookupByKey @NameRecord -> assertMsg "Name not already registered"
  -> Fee collection via two holder-funded TransferFactory_Transfer legs:
       1. holder -> registrar, the registrar commission.
       2. holder -> DRO treasury, the remainder.
       The holder is the transfer sender and fee payer; the second leg
       chains the first leg's change holdings so the unspent balance flows
       through. The treasury remainder is later split across the registrars
       by the Treasury contract's Treasury_Payout.
  -> create NameRecord (live immediately; usable from this point)
```

#### Transfer

Names can be transferred either in the case of:

* a holder voluntarily moving between parties (sale or gift etc)
* an expired entry being reclaimed and issued to another party.

**Holder-instructed transfer (voluntary):** name transfers ride the CIP-56
(Canton Network Token Standard) transfer rails — `NameRegistry` implements the
`TransferFactory` interface, so a `.canton` name moves like any standard token.
```
Holder exercises RequestNameTransfer on NameRegistry (CIP-56 TransferFactory_Transfer)
  -> assertMsg "Registry is paused" (not paused)
  -> fetchByKey NameRecord; assert sender == holder, null disputes, not locked, not expired
  -> create NameTransferInstruction (pending; the NameRecord stays live)
    |
Receiver exercises AcceptNameTransfer on the instruction (CIP-56 TransferInstruction_Accept)
  -> re-check holder / disputes / lock / expiry
  -> Archive old NameRecord -> Create new NameRecord (holder = receiver)
```
The two-step instruct/accept handshake binds both parties' consent. Either side
can abandon a pending instruction (reject / withdraw); the `NameRecord` is only
archived-and-recreated atomically at the accept step, so the `(dro, name)` key
is never free mid-transfer.

**Without approval (expired name reclaim):**
```
Claiming registrar + newHolder exercise TransferWithoutApproval
  -> assertMsg "Registry is paused" (not paused)
  -> assertMsg "Registrar in allowlist"
  -> assertMsg "Name has expired" (expiresAt < now)
  -> assertMsg "Has active disputes" (null disputes)
  -> assertMsg "New expiry in future", "New expiry <= maxExtension"
  -> Archive old -> Create new NameRecord
```

#### Dispute lifecycle

The Dispute mechanism is mainly a safety net, but exists in case a record needs to be revoked. Any whitelisted registrar can raise a dispute against a record via `NameRecord.Dispute` appends `(registrar, reason)` to the record's `disputes` list. 

Each registrar then operates as the DRO using a `k-of-n` signature threshold to follow through and remove the record:

```
1. Any registrar -> NameRecord.Dispute(reason)
     -> validates the caller is an allowlisted registrar
     -> validates the registrar has not already disputed this name
     -> appends (registrar, reason) to NameRecord.disputes
        |
2. Registrars deliberate off-ledger
        |
3. The DRO resolves with one k-of-n-signed transaction:
   - uphold  -> NameRecord_Archive with AR_DisputeWon(reason) archives the record
   - dismiss -> NameRecord.ResolveDispute(disputer) drops that disputer
                from the disputes list
```

`AR_DisputeWon` carries a `reason : Text` audit field recorded by the resolving transaction, and `NameRecord_Archive` asserts the record has an open dispute — so a name cannot be archived as "dispute won" without one.

#### Governance

```
Proposer (registrar) + DRO co-sign GovernanceProposal
  {action, registrars snapshot, expiresAt}
    |
Registrars vote via GovVote
    |
GovExecute (by any registrar, passing live registryCid)
  -> Fetch LIVE registry (not proposal snapshot)
  -> assertMsg "executor in live registrars"
  -> Count only votes from live registrars
  -> threshold = ceiling(N_live * 2/3)
  -> assertMsg "approvals >= threshold"
  -> Execute GovernanceAction against the live registry
```

Governance also serves as the enforcement mechanism for registrar conduct — behaviours that are impractical to prevent on-chain (e.g. self-dispute griefing) are delegated to the collective registrar pool, which can evolve acceptable-use policies and remove offending registrars via `GA_RemoveRegistrar`.

Governance votes are also used for elements like changing min fee for records.

#### Registrar onboarding/offboarding

**Onboarding:** `GovernanceProposal` with `GA_AddRegistrar` -> 2/3 vote -> `GovExecute` adds the candidate to the on-chain allowlist.

**Offboarding:** `GovernanceProposal` with `GA_RemoveRegistrar` -> 2/3 vote -> `GovExecute` removes the registrar from the allowlist.

### Parties and trust model

#### The DRO party

The Decentralised Registry Operator (DRO) is the single primary signatory of every core contract. It is a Canton **external party**: its authority is a set of signing keys — one held by each registrar — under a **k-of-n threshold**. It is additionally multi-hosted across registrar participant nodes, which provides **technical failover**: if one hosting participant goes down, the DRO remains reachable through the others.

Any transaction that needs *fresh* DRO authority — directly creating a DRO-signed contract: the `NameRegistry` singleton, the `RegistrarShard` pool, a `GovernanceProposal` — is prepared and then signed by k of the n registrar keys before it can execute. Each registrar's signer independently validates the prepared transaction and refuses anything off-policy. 

The k-of-n signing requirement is what closes the direct-`createCmd` path: a registrar cannot fabricate a `NameRecord` unilaterally, since they need the DRO authority to create one. In a honest path, this flows from the `NameRegistry` contract itself, but then cannot be forged as an honest quorum of signers will not sign a bare record create.

The legitimate path pays no per-registration "cost". `RegisterName` is a choice exercised on the *existing* `NameRegistry`; the DRO authority for the `NameRecord` it creates is delegated through that registry contract, which the DRO signed once at bootstrap. A name registration is therefore an ordinary registrar transaction — no signing ceremony. The k-of-n cost is paid only to establish or change the registry and governance contracts.

The DRO's *namespace identity* — which participants may host the party and which host-set changes are valid — is a `DecentralizedNamespaceDefinition` owned by the registrars, each holding their own key, with a quorum threshold. Onboarding a new namespace owner and offboarding a rogue or unresponsive one are both quorum decisions of the *other* owners, so no single owner is a point of control or failure and a rogue host cannot block its own eviction. This mirrors the on-ledger `GovernanceProposal` 2/3 model. Key-management detail is in `docs/dro-key-management.md`.

#### Single-signatory model

Every core contract has DRO as a signatory; some (`NameRecord`, `NameTransferInstruction`) add a domain co-signatory — the holder or transfer sender — to bind that party's consent. A single shared primary signatory (DRO) keeps contract keys maintainable and searchable across the network. Write actions are gated by an on-chain allowlist lookup against individual registrars before being carried out — every registrar-controlled choice checks `party \`elem\` registrars`.

#### Registrar allowlist

The `NameRegistry.registrars` list is the admission gate:
- Registrars are added/removed only via governance (`GA_AddRegistrar` / `GA_RemoveRegistrar`) with `ceiling(N * 2/3)` approval.
- Every registrar-controlled choice checks `party \`elem\` registrars` before proceeding.

#### Authorisation boundaries

| Actor | Can do | Cannot do |
|-------|--------|-----------|
| **Outsider** | Nothing | Any ledger operation (blocked by signatory + allowlist) |
| **Holder** | Release / archive own name | Transfer (needs registrar), register, dispute |
| **Registrar** | Register, transfer, renew, dispute, vote on governance | Change fees or other registry parameters outside governance, archive a name outside an `ArchiveReason` |
| **DRO** | Resolve disputes, archive (with `ArchiveReason`), execute governance | Bypass registrar allowlist checks |
| **Governance (2/3)** | All registry parameter changes, add/remove registrars | Bypass the threshold |

### Contract model

#### NameRegistry

The singleton gateway for all name operations. Every `NameRecord` is created through this contract — DRO's signatory authority flows from here.

```
template NameRegistry
  signatory dro
  observer registrars, observers
```

**Fields:**
- `dro : Party` — the multi-hosted DRO party
- `registrars : [Party]` — authorised registrar allowlist
- `observers : [Party]` — parties that can resolve names
- `paused : Bool` — emergency kill switch (see the `Pause` choice)
- `maxExtension : RelTime` — governance-configurable cap on name renewal duration
- Fee config: `minPriceFloor`, `registrarFeePercent`
- Governance config: `governanceVoteWindow` — default expiry for `GovernanceProposal`s
- CC plumbing: `transferFactoryCid`, `ccInstrumentId`, `featuredAppRightCid`

**Choices:**

| Choice | Controller | Description |
|--------|-----------|-------------|
| `RegisterName` | registrar, holder | Validates name format (`isValidName`); serializes concurrent registrations by consuming the name's `RegistrarShard` and then checking `lookupByKey`; enforces `paymentAmount >= minPriceFloor`; collects the holder-funded fee as two `TransferFactory` transfers — holder to registrar (commission) and holder to DRO treasury (remainder). Creates a NameRecord that is live immediately. Holder co-controller provides signatory authority for NameRecord creation |
| `RequestNameTransfer` | sender (current holder) | CIP-56 `TransferFactory_Transfer` — produces a pending `NameTransferInstruction`. The receiver completes the transfer via `AcceptNameTransfer`. Rejected if paused, the name is locked, or it has active disputes |
| `TransferWithoutApproval` | claimingRegistrar, newHolder | Reclaim expired name without holder consent. newHolder co-controller provides signatory authority for new NameRecord creation. Asserts expired and no active disputes |
| `ResolveName` | resolver | Read-only lookup via `fetchByKey`, returns (holder, expiry). Asserts not expired |
| `Pause` | any allowlisted registrar | Emergency kill switch: sets `paused = True`, freezing `RegisterName`, expired-name reclaim, and transfer/allocation requests. Any single allowlisted registrar can pause; unpausing requires a 2/3 governance vote (`GA_Unpause`) — easy to raise the alarm, hard to silence it |

The name-operation choices are **nonconsuming** — the registry persists across operations. `Pause` and governance changes (add/remove registrar, update fees, `GA_Unpause`) go through choices that archive and re-create the registry.

**Fee distribution — holder-pays, treasury accrual:** name fees are funded by the holder. The holder is the transfer sender, and `RegisterName` (and renewal) collect the fee as two `TransferFactory_Transfer` legs: holder to registrar for the commission (`registrarFeePercent`), then holder to the DRO treasury for the remainder. The second leg chains the first's change holdings so the unspent balance flows straight through. Distributing the accrued treasury to registrars is a separate, batched payout: the `Treasury` contract's `Treasury_Payout` splits the DRO-held balance across all registrars — rate-limited, and open for anyone to trigger because the DRO signature gates the rules rather than the caller — so the registration hot path stays just the two holder-funded transfers.

**Interface implementation — CredentialFactory:** `NameRegistry` implements the CIP-56 `Splice.Api.Credential.RegistryV1.CredentialFactory` interface, which makes XNS discoverable as a standard credential registry. `CredentialFactory_PublicFetch` exposes the factory view (admin = DRO). `CredentialFactory_UpdateCredentials` is the single renewal path: it archives the old `NameRecord` and creates a renewed one with an extended `expiresAt`, preserving `registeredAt`. Renewal carries the same holder-funded, length-proportional fee model as registration. Because the JSON Ledger API cannot dispatch interface choices, `NameRegistry` also exposes `RenewName` — a template-level alias that forwards directly to `CredentialFactory_UpdateCredentials` — so JSON-API clients and the web app drive renewal through it, with the on-ledger effect identical to the interface choice.

#### NameRecord

One per registered name. Tracks both existence (via contract key) and ownership.

```
template NameRecord
  signatory dro, holder
  key (dro, name) : (Party, Text)
  maintainer key._1
```

**Lifecycle:** registered (live) -> archived (expired, voluntarily released, or dispute-won)

**Fields:** `dro`, `holder`, `name`, `registeredAt`, `expiresAt`, `disputes : [(Party, Text)]`, `locked : Bool`

`locked` is the escrow flag: while `True` the name is committed as the delivery leg of a pending settlement and the transfer/renewal choices reject. It is also surfaced as the CIP-56 `Holding` lock (see *Interface implementation*).

**Choices:**

| Choice | Controller | Description |
|--------|-----------|-------------|
| `Dispute` | registrar | Stake-free dispute against the record; raisable any time after registration by any allowlisted registrar. Appends `(registrar, reason)` to the `disputes` list |
| `ResolveDispute` | dro | Dismiss a dispute — drops the named disputer from the `disputes` list. Under the k-of-n DRO, the threshold signature is the resolution |
| `Credential_ArchiveAsHolder` | holder | Voluntarily archive (burn) the name. Choice name aligns with `Credential` interface |
| `Release` | holder | **Transitional** template-level alias for `Credential_ArchiveAsHolder` — same body, same controller. Present only because the current test/client path cannot dispatch the interface choice via a template contract id; once that path is wired through, `Release` will be removed. |
| `NameRecord_Archive` | dro | Guarded archive choice. Takes `ArchiveReason`: `AR_Expired` (name expired) or `AR_DisputeWon` (an upheld dispute, carrying an audit `reason`). Each reason is validated inline — no unguarded DRO archive path exists. Whatever the reason, the choice first cancels any `NameAllocation` the name was escrowed in (the caller supplies its cid exactly when the record is `locked`), so archiving an escrowed name can never orphan its allocation. Holder-instructed transfers archive the record directly inside `AcceptNameTransfer`, not via this choice. |

**Interface implementations:** `NameRecord` implements two CIP-aligned
interfaces. (1) `Splice.Api.Credential.RegistryV1.Credential` — the upstream
`CredentialView` (`admin`, `issuer`, `holder`, `claims : Claims`, `createdAt`,
`expiresAt`, `meta`), `Credential_ArchiveAsHolder`, and `Credential_PublicFetch`
(validates `expectedAdmin`). (2) `Splice.Api.Token.HoldingV1.Holding` — each
name is a 1-of-1 CIP-56 token (`InstrumentId { admin = dro, id = name }`,
`amount = 1.0`), so any CIP-56-aware wallet or explorer displays a holder's
`.canton` names natively. The `Holding` lock reflects `NameRecord.locked`.

#### NameTransferInstruction

A pending holder-instructed transfer, produced by `NameRegistry`'s
`TransferFactory` and implementing the CIP-56 `TransferInstruction` interface.

```
template NameTransferInstruction
  signatory dro, transfer.sender
  observer transfer.receiver
```

**Fields:** `dro`, `transfer : Transfer` (the CIP-56 transfer spec — sender, receiver, instrument, deadline).

The current holder (`transfer.sender`) instructs a transfer via
`RequestNameTransfer` on `NameRegistry`; the receiver completes it with
`AcceptNameTransfer`, which archives the old `NameRecord` and creates a new one
held by the receiver in a single transaction. Either party can abandon a
pending instruction (`RejectNameTransfer` / `WithdrawNameTransfer`). `sender`
co-signs so the sender-held `NameRecord` can be archived at the accept step.

Each choice exists in two forms: the CIP-56 interface choice
(`TransferInstruction_Accept` etc.) for interoperable wallets, and a
template-level alias (`AcceptNameTransfer` etc.) for JSON-Ledger-API clients —
the JSON API cannot dispatch interface choices. The two share one
implementation so they cannot diverge.

#### GovernanceProposal

Threshold voting for all governance actions. Requires `ceiling(N * 2/3)` registrar approvals.

```
template GovernanceProposal
  signatory dro, proposer
  observer registrars
```

**Fields:** `dro`, `proposer`, `registrars` (snapshot), `action : GovernanceAction`, `votes : [(Party, Bool)]`, `expiresAt`

**Governance actions** (the `GovernanceAction` ADT):
- `GA_AddRegistrar` / `GA_RemoveRegistrar`
- `GA_UpdateFees` / `GA_UpdateObservers`
- `GA_UpdateTransferFactory` / `GA_UpdateMaxExtension`
- `GA_Unpause` — lift the emergency pause set by the `Pause` choice

**Proposal validation:** `GovernanceProposal` has an `ensure` clause requiring `proposer \`elem\` registrars`, preventing non-registrars from creating proposals even with DRO access.

**Vote validation:** `GovVote` takes a `voteRegistryCid` parameter and validates the voter against the **live** registry's registrar list, not the proposal snapshot.

**Key design:** `GovExecute` fetches the **live registry** at execution time. The threshold, executor validation, and vote counting all use the live registrar list — not the proposal snapshot. This prevents padded-snapshot attacks.

#### Treasury

The `Treasury` contract holds the **payout rules** for the accrued registration fees — it is `signatory dro`, created at bootstrap alongside the `NameRegistry`. It carries `minPayoutInterval` (a payout may not run more often than this), `triggerBountyPercent`, the registrar set, and the CIP-56 transfer plumbing.

`Treasury_Payout` distributes the accrued treasury — the Canton Coin the DRO party holds from each `RegisterName` fee — evenly across the registrars, as one batched, chained sequence of `TransferFactory_Transfer` calls. Any registrar may trigger it once `minPayoutInterval` has elapsed; the triggering registrar keeps `triggerBountyPercent` of the payout as the incentive to run it. The DRO signature on the contract gates the *rules* — the interval, the even split, the bounty — not the caller, which is why the choice is safe to leave open to any registrar.

#### Marketplace — NameListing and NameSale

The marketplace layer composes the core `NameRecord` with the CIP-56 Allocation API to give the holder a hosted-but-permissionless way to sell a `.canton` name. A `NameListing` is the seller's standing offer; a registrar brokers it to a buyer, producing a `NameSale`; the facilitator then settles the sale atomically against three CIP-56 `Allocation` legs — the name itself, the buyer's payment, and the facilitator's fee.

**Fields and signatories.** `NameListing` is `signatory seller, observer registrars` — it is an off-book advert by the holder, not a registry-issued artefact, so no DRO signature is needed to publish or withdraw it. `NameSale` is `signatory seller, buyer, observer facilitator` — the buyer commits on accept, and the facilitator (settlement executor) observes for the settlement choice. The buyer-driven `NameListing_Accept` (`controller facilitator, buyer`) is where the holder's listing is committed into a sale; seller authority flows in through the listing's own signatory.

**Where DRO authority enters settlement.** Settling the name leg archives the seller's `NameRecord` and creates a fresh one for the buyer — both effects require DRO authority because `NameRecord` is `signatory dro, holder`. That authority is supplied by the name-leg `NameAllocation` (`signatory dro, sender`), which the seller produces by exercising `RequestNameAllocation` on the registry: the exercise happens on contracts where DRO is already a signatory, so DRO authority is captured at allocation time and carried through to settlement. No fresh DRO signature is needed at listing or at sale creation; the keep-DRO-out-of-routine-actions property of an ordinary marketplace is preserved end to end.

**Atomic three-leg DvP.** `NameSale_Settle` (`controller facilitator`) takes the three Allocation `ContractId`s and executes them in one transaction — either all three settle or the transaction rolls back. Before execution, the choice validates each leg against the sale's agreed terms: sender, receiver, amount, instrument id, settlement executor, and settlement reference must all match. These pinning asserts close a substitution attack where a colluding facilitator might pair the buyer's payment with a name leg for a different (cheaper) name, or with a payment leg denominated in a worthless token.

**Unwind paths.** Either party may walk away from a committed sale before settlement (`NameSale_Abort` / `NameSale_AbortBySeller`); the seller's name-leg escrow is released through the standard Allocation API (`WithdrawNameAllocation` or `CancelNameAllocation`), which restores `NameRecord.locked = False`. A listing that has not yet been accepted is withdrawn with `NameListing_Cancel`.

#### Name-addressed escrow — NameEscrow

`NameEscrow` lets a sender lock Canton Coin against a `.canton` *name* rather than a party id, with the recipient resolved on-chain at claim time. If `alice.canton` changes hands while the escrow is in flight, the new holder receives the funds; resolution always happens at the moment `Claim` is exercised, not at escrow creation.

**Signatories.** `NameEscrow` is `signatory sender, observer dro`. The sender consents to locking funds by signing; DRO is an observer so it can drive the `Claim` choice without needing a signature at escrow creation. Daml permits a controller to be an observer (the idiomatic shape for "actor outside the signatory set drives a choice", used by the CIP-56 TransferFactory as well), so the DRO ceremony is concentrated where it is doing real work — at claim time, resolving the name and releasing the locked CC — and opening an escrow is a single-signer action on the sender's side.

**Lifecycle and windows.** Before `unlockAt` the sender can cancel (escrow has not matured). Between `unlockAt` and `reclaimAfter` is the DRO's exclusive `Claim` window, during which the registry's `ResolveName` choice maps the name to its current holder and releases the funds. At or after `reclaimAfter` the sender can reclaim the funds if DRO did not act in its window. `ResolveName` itself rejects expired or unknown names, so a `Claim` against a dead name fails — the sender's reclaim path handles that case.

### Security design

#### Signatory model and authorisation boundaries

Every contract has explicit signatories that the DAML ledger enforces at the authorisation layer:

| Contract | Signatories | Rationale |
|----------|------------|-----------|
| NameRegistry | `dro` | Singleton gateway; DRO authority flows to all name operations |
| NameRecord | `dro, holder` | Only creatable via NameRegistry; holder co-signs at creation (see note) |
| NameTransferInstruction | `dro, transfer.sender` | The current holder (sender) instructs the transfer; the receiver accepts |
| GovernanceProposal | `dro, proposer` | Proposer identified; registrars are observers who vote |
| Treasury | `dro` | Holds the payout rules; registrars observe and may trigger `Treasury_Payout` |
| NameListing | `seller` | Off-book advert by the holder; registrars observe to broker. No DRO at listing time |
| NameSale | `seller, buyer` | Buyer-committed agreement; facilitator observes to settle. DRO authority for settlement flows in via the name-leg `NameAllocation`, not via NameSale itself |
| NameEscrow | `sender` (observer: `dro`) | Sender locks the funds; DRO drives `Claim` as an observer-controller. The DRO ceremony is at claim time, not at escrow creation |

The holder **is a co-signatory** on NameRecord (`signatory dro, holder`). This aligns with the upstream Credential interface (`signatory issuer, holder`). Holder authority flows into the create via `RegisterName` (where holder is a co-controller) and `AcceptNameTransfer` (where the receiver is the controller and the sender co-signs the `NameTransferInstruction`). The `NameRecord_Archive` choice (`controller dro`) is guarded by `ArchiveReason` — each archive path validates its precondition inline (expired, or dispute won). No unguarded DRO archive path exists.

#### DRO authority flow

The k-of-n DRO signs a small set of foundational contracts — `NameRegistry`, the 256 `RegistrarShard`s, `Treasury` — once at registry bootstrap. That signature is in scope inside every choice exercised on those contracts (and on the dro-signed children they create), so subsequent operations carry DRO authority without re-signing. A fresh k-of-n ceremony is needed only when DRO is the *acting* party: the direct controller of a choice, or a co-signer of a direct contract creation.

| Operation | DAML entrypoint | Submitter | DRO authority via | Fresh ceremony? |
|---|---|---|---|---|
| **Bootstrap** | | | | |
| Stand up the registry | `createCmd` `NameRegistry`, `RegistrarShard` × 256, `Treasury` | DRO | Direct | ✅ once |
| **Name lifecycle** | | | | |
| Register a name | `RegisterName` on `NameRegistry` | registrar + holder | `NameRegistry` signatory | — |
| Renew a name | `RenewName` on `NameRegistry` (alias → `CredentialFactory_UpdateCredentials`) | holder | `NameRegistry` signatory | — |
| Resolve a name (read) | `ResolveName` on `NameRegistry` | anyone | nonconsuming read | — |
| File a dispute | `Dispute` on `NameRecord` | any registrar | `NameRecord` signatory | — |
| Burn / release own name | `Credential_ArchiveAsHolder`, `Release` on `NameRecord` | holder | `NameRecord` signatory | — |
| Request a transfer | `RequestNameTransfer` on `NameRegistry` | sender | `NameRegistry` signatory | — |
| Accept / reject / withdraw a transfer | choices on `NameTransferInstruction` | receiver / sender | `NameTransferInstruction` signatory | — |
| Force-reclaim an expired-and-unrenewed name | `TransferWithoutApproval` on `NameRegistry` | registrar + newHolder | `NameRegistry` signatory | — |
| Sell a name: list, accept, settle | `NameListing`, `NameListing_Accept`, `NameSale_Settle` | seller / facilitator+buyer / facilitator | `NameAllocation` signatory at settle | — |
| Allocation lifecycle: request, execute, withdraw, cancel | `RequestNameAllocation`, `Allocation_ExecuteTransfer`, `WithdrawNameAllocation`, `CancelNameAllocation` | sender / executor | `NameRegistry` / `NameAllocation` signatory | — |
| Open / cancel a name-addressed CC escrow | `createCmd NameEscrow`, `Cancel` | sender | none — escrow is not DRO-signed | — |
| **Registry operations** | | | | |
| Pause the registry | `Pause` on `NameRegistry` | any registrar | `NameRegistry` signatory | — |
| Trigger a treasury payout | `Treasury_Payout` on `Treasury` | any registrar | `Treasury` signatory | — |
| Vote on a governance proposal | `GovVote` on `GovernanceProposal` | any registrar | n/a — vote is data | — |
| Execute a passed governance proposal | `GovExecute` on `GovernanceProposal` | any registrar | `GovernanceProposal` + `NameRegistry` signatories | — |
| **DRO-controlled actions** | | | | |
| Propose a governance action | `createCmd GovernanceProposal` | DRO + proposer | Direct submission | ✅ per proposal |
| Resolve a dispute — uphold | `NameRecord_Archive` + `AR_DisputeWon` | DRO | Direct controller | ✅ per action |
| Resolve a dispute — dismiss | `ResolveDispute` on `NameRecord` | DRO | Direct controller | ✅ per action |
| Archive an expired name | `NameRecord_Archive` + `AR_Expired` | DRO | Direct controller | ✅ per action |
| Claim a name-addressed escrow | `Claim` on `NameEscrow` | DRO | Direct controller | ✅ per action |
| Reclaim a cancelled allocation | `Allocation_ReclaimCancel` | DRO | Direct controller | ✅ per action |

The bottom group is the entire surface that routes through the k-of-n coordinator — and is exactly the surface the demo's *Ceremony view* renders. Everything else is an ordinary submission to the JSON Ledger API.

#### Consuming-choice replay prevention

DAML's consuming choices provide structural replay prevention:

- **NameTransferInstruction**: `AcceptNameTransfer` is consuming — a pending transfer cannot be accepted twice
- **NameRecord**: archived and re-created atomically during transfers — no key gap for race conditions
- **GovernanceProposal**: consumed by `GovExecute` — cannot be executed twice
- **RegistrarShard**: consumed and re-created by `RegisterName` — the contention point that serialises concurrent registration

#### Emergency pause

Any single allowlisted registrar can call `Pause`, immediately setting `NameRegistry.paused = True`. While paused, the registry's name-creation and transfer/allocation choices — `RegisterName`, `TransferWithoutApproval`, `RequestNameTransfer`, `RequestNameAllocation`, and the `TransferFactory` / `AllocationFactory` interface flows — all reject with "Registry is paused". Read operations (`ResolveName`) and dispute handling continue. Unpausing requires a 2/3 governance vote (`GA_Unpause`): the alarm is cheap to pull and deliberate to silence, so a single compromised registrar cannot grief the registry into a permanent freeze.

The pause gates the registry's *gateway choices*. A direct `createCmd` of a DRO-signed contract is closed separately, by the DRO's k-of-n signing requirement (see *The DRO party*). The pause itself is an incident-response control — freezing legitimate activity so an incident can be investigated and resolved from a clean state — not an attack-prevention mechanism.

#### On-chain assertions

Critical field-match and state assertions prevent argument manipulation:

| Assertion | Choice | Prevents |
|-----------|--------|----------|
| `isValidName proposedName` | RegisterName | Malformed names (uppercase, missing `.canton`, leading/trailing hyphens, etc.) |
| `registrar \`elem\` registrars` | RegisterName, Dispute, CredentialFactory_UpdateCredentials, etc. | Outsider registration/dispute |
| `paymentAmount >= minPriceFloor` | RegisterName | Below-floor pricing |
| `isNone existing` (lookupByKey) | RegisterName | Duplicate names |
| `sender == record.holder` | RequestNameTransfer, AcceptNameTransfer | Transferring a name the sender does not hold |
| `not paused` | RegisterName, RequestNameTransfer, RequestNameAllocation, TransferWithoutApproval, CredentialFactory_UpdateCredentials | Operating the registry while emergency-paused |
| `voter \`notElem\` map fst votes` | GovVote | Double voting |
| `null record.disputes` | RequestNameTransfer, AcceptNameTransfer, TransferWithoutApproval, CredentialFactory_UpdateCredentials | Movement / renewal of a name while a dispute is open |
| `not record.locked` | RequestNameTransfer, AcceptNameTransfer, CredentialFactory_UpdateCredentials, Release, Credential_ArchiveAsHolder | Moving or holder-archiving a name escrowed in a pending settlement |
| `record.expiresAt < now` | TransferWithoutApproval | Premature expiry reclaim |
| `record.expiresAt > now` | ResolveName | Stale name resolution |
| `expiry > now` | RegisterName | Registration with past expiry |
| `newExpiry > now` | TransferWithoutApproval | Transfer with past expiry |
| `newExpiry <= now + maxExtension` | TransferWithoutApproval | Unbounded extension (permanent names) |
| `newExpiry <= newCreatedAt + maxExtension` | CredentialFactory_UpdateCredentials | Unbounded renewal extension (permanent names) |
| `record.expiresAt > newCreatedAt` | CredentialFactory_UpdateCredentials | Renewing an already-expired name (reclaim it via TransferWithoutApproval instead) |
| `feeAmount >= minPriceFloor * lengthInYears` | CredentialFactory_UpdateCredentials | Free or under-priced renewals bypassing the economic model |
| `proposer \`elem\` registrars` | GovernanceProposal (ensure) | Non-registrar governance proposals |
| `voter \`elem\` registry.registrars` (live) | GovVote | Removed registrar voting on governance proposals |

### Contract key summary

| Template | Key | Maintainer |
|----------|-----|-----------|
| NameRecord | `(dro, name)` | `dro` |

Contract keys use Canton's non-unique key semantics, so a `lookupByKey`-before-`create` check is not on its own sufficient against concurrent registration. `RegisterName` therefore serializes concurrent registrations through a sharded allocator: a fixed pool of 256 `RegistrarShard` contracts (keyed `(dro, shardId)`) seeded at bootstrap. Each name maps deterministically to one shard; `RegisterName` consumes and recreates that shard, so two concurrent registrations of the same name contend on a single contract id and the ledger admits exactly one. Names in different shards register in parallel.

## Rationale

### Design Goals

1. **Decentralised** — Trusted registrars can be on-boarded to provide name sales to end-users. All registrars are centrally backed by a decentralised on-chain registry. A multi-hosted "Decentralised Registry Operator" (DRO) party provides technical failover across registrar nodes. As a core goal, the system needs to be able to outlive any single registrar as a point of failure.

2. **Registrar incentives** — Registrars are rewarded for their work via fees claimable from each registration and renewal. The facilitating registrar keeps a governance-configurable share of each fee directly; the remainder accrues to the DRO treasury and is distributed to registrars by a separate, batched payout.

3. **Dispute resolution** — Generally new registrations should go through without issue as individual registrars are following the same standards and rules, but we've provided a dispute mechanism that registrars can use in the event of issues. This is deliberately light-weight in that it doesn't affect the "happy path" of registration (as disputes should be rare).

4. **On-chain integrity** — Name uniqueness is enforced on-chain: concurrent registrations of the same name are serialized through the sharded `RegistrarShard` allocator, so contract-key non-uniqueness cannot produce a duplicate name. All authorisation flows through DAML's signatory model.


### Open Questions 

Items still to be ironed out before this moves out of draft:

- Proposed fee structure, including floors etc
- "Physical" governance of the DRO party — the DRO root namespace is a `DecentralizedNamespaceDefinition` owned by the registrars (see `docs/dro-key-management.md`): delegated signing keys rotate without changing the party ID, and host onboarding/offboarding is a quorum decision of the namespace owners. The remaining open item is confirming the exact `PartyToParticipant` offboarding mechanics — whether a removed host's signature is required — on the target Canton build; tracked for the Canton identity SIG.
- Bonds/Staking for registrars: If we're doing on-chain staking/slashing of funds (e.g. to deter registrar misbehaviour — disputes themselves are stake-free), how can we correctly protect funds of registrars so that:  
  - a consensus of registrars can slash funds, without needing the offending registrar to agree 

## Backwards Compatibility

No direct prior on-chain state for compatibility as an applications-layer CIP.

## Reference Implementation

Reference implementation to follow. Currently targeting Canton SDK 3.5.2 (LF target 2.3).
Have also aimed to align the `NameRecord` itself to the upstream `Splice.Api.Credential.RegistryV1` interface, which is in an unmerged PR.

## Copyright

This document is licensed under [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/).
