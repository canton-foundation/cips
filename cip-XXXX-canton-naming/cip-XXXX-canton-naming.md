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
</pre>

## Abstract

This CIP defines **Canton Naming**, a registry for human-readable `.canton` names on the Canton Network. Names like `alice.canton` resolve on-chain to Canton parties, providing a single source of truth for identity and discovery across decentralised applications.

The protocol is designed up-front to be decentralised, where a pool of registrars can each sell name records to their end users but have them backed by a shared, logically centralised registry on-chain.

We believe that this is key to having a naming service be a value-add on the network, as names are only useful to end users if they can be relied upon to resolve to the same party. 

The collective pool of registrars will operate a shared party, the "Decentralised Registry Operations party" (DRO, modelled on the DSO — the Decentralised Synchroniser Operations party that operates the Global Synchronizer). This will allow for all records to be created by a single party and means that we have a single maintainer of the contract keys used on-chain regardless of who has registered a given name.

Governance of the service is managed by consensus among the approved registrars. Parameters of the service (like min pricing, vote thresholds etc) can be agreed upon by the governance layer and then are stored in the Name Registry contract itself. Registrars compete to provide name sales, renewals, and support to end users, but every name they sell is recorded in the same canonical `NameRegistry` contract. 

The reference implementation (to follow) is a DAML contract package targeting Canton SDK 3.6.0. All authorisation flows through DAML's signatory model; the DAR would be vetted, so holders can exercise their own choices directly via the JSON Ledger API.

## Motivation

Applications building on the Canton Network today address users by raw Canton party IDs — long, opaque strings that can't be memorised or shared verbally. Without a shared naming convention, every application ships its own ad-hoc directory or relies on out-of-band identity exchange.

A naming layer only adds value if every name resolves to a single, agreed-upon entity — like a phone number or a bank account number. Two competing registries for the same namespace don't add resilience; they create confusion and erode user trust. Canton Naming is a **single source of truth** for `.canton` names: publicly queryable on-chain, backed by one canonical on-chain registry, while permitting any number of competing registrar products to participate in name sales, renewals, and support.

Resilience is built in at both layers — the registry is operated by a multi-hosted DRO party so it survives any single hosting participant going down, and the set of registrars is governed on-chain so individual registrars can come and go without interrupting the registry itself.

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
  -> Fee split via chained TransferFactory calls:
       1. Treasury transfer (paymentHoldingCids -> DRO); capture senderChangeCids
       2. Sibling[0] transfer (senderChangeCids from step 1); capture senderChangeCids
       3. Sibling[1] transfer (senderChangeCids from step 2); ...
       Each transfer consumes its inputHoldingCids and returns new change holdings.
       Registrar retains their fee as the final change holdings (no transfer needed).
  -> create NameRecord (live immediately; usable from this point)
```

#### Transfer

Names can be transferred either in the case of:

* a holder voluntarily moving between parties (sale or gift etc)
* an expired entry being reclaimed and issued to another party.

**With approval (voluntary):**
```
Holder + DRO co-sign TransferApproval {holder, name, newHolder}
    |
Facilitating registrar exercises TransferWithApproval
  -> Validate: allowlist, approval.holder == record.holder, name match, newHolder match
  -> assertMsg "Has active disputes" (null disputes)
  -> Consume TransferApproval (archive)
  -> Archive old NameRecord
  -> Create new NameRecord (holder=newHolder)
```

**Without approval (expired name reclaim):**
```
Claiming registrar + newHolder exercise TransferWithoutApproval
  -> assertMsg "Registrar in allowlist"
  -> assertMsg "Name has expired" (expiresAt < now)
  -> assertMsg "Has active disputes" (null disputes)
  -> assertMsg "New expiry in future", "New expiry <= maxExtension"
  -> Archive old -> Create new NameRecord
```

#### Dispute lifecycle

Disputes occur in the case that a disputing registrar claims the registration should not stand — e.g. a rogue registrar registering an agreed reserved name, or a holder using the name in a way that violates registrar conduct policy.

Names are live from the moment they are registered. Any registrar in the allowlist can raise a dispute at any time after registration; the dispute goes to a staked vote and either confirms the name (`DisputeLost`) or archives it (`DisputeWon`). While a dispute is open the `null disputes` guard blocks transfers and renewals on the record.

```
1. Disputer creates DisputeStake (DRO + disputer co-sign)
      |
2. NameRecord.Dispute (any time after registration)
   -> Validates registrar status, stake name/disputer match
   -> Adds (disputer, reason) to disputes list
      |
3. Counter-stake window:
   a. No counter-stake by deadline
      -> ClaimTimeout -> DisputeWon (disputer's stake returned)
      -> jump to step 6
   b. Counter-stake placed by any registrar in the allowlist
      -> CounterStake (takes registryCid) -> fetches live registry -> sets voteDeadline (now + registry.voteWindow)
      -> continue to step 4
      |
4. Registrars vote via AddVote (True = for dispute, False = against)
      |
5. Resolve (acting as the DRO after voteDeadline; any registrar can submit since all host DRO)
   -> Tally votes -> DisputeWon or DisputeLost
   -> Create DisputeResolution (protection of staked funds is an open
      design question — see Open Questions in Rationale)
      |
6. If DisputeLost: NameRecord.ResolveDispute removes disputer from list
   If DisputeWon: NameRecord_Archive with AR_DisputeWon archives the record
                   and consumes the DisputeResolution (cannot be replayed)
```

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

#### Registrar onboarding/offboarding

**Onboarding:** `GovernanceProposal` with `GA_AddRegistrar` -> 2/3 vote -> `GovExecute` adds the candidate to the on-chain allowlist.

**Offboarding:** `GovernanceProposal` with `GA_RemoveRegistrar` -> 2/3 vote -> `GovExecute` removes the registrar from the allowlist.

### Parties and trust model

#### DRO as multi-hosted party

The Decentralised Registry Operator (DRO) is a single Canton party multi-hosted across registrar nodes. Multi-hosting provides **technical failover** — if one hosting participant goes down, the DRO party remains accessible through other participants. This ensures the registry service is not locked to a single hosted setup.

Multi-hosting does **not** provide human-in-the-loop consensus or distributed approval. Any participant hosting the DRO can submit DRO-signed transactions. Trust in individual write operations is enforced at the DAML level via the registrar allowlist (see *Registrar allowlist* below), not at the topology layer.

#### Single-signatory model

Every core contract has DRO as a signatory; some (`NameRecord`, `TransferApproval`, `DisputeStake`, `DisputeResolution`) add a domain co-signatory — the holder, new holder, or disputer — to bind that party's consent. A single shared primary signatory (DRO) keeps contract keys maintainable and searchable across the network. Write actions are gated by an on-chain allowlist lookup against individual registrars before being carried out — every registrar-controlled choice checks `party \`elem\` registrars`.

#### Registrar allowlist

The `NameRegistry.registrars` list is the admission gate:
- Registrars are added/removed only via governance (`GA_AddRegistrar` / `GA_RemoveRegistrar`) with `ceiling(N * 2/3)` approval.
- Every registrar-controlled choice checks `party \`elem\` registrars` before proceeding.

#### Authorisation boundaries

| Actor | Can do | Cannot do |
|-------|--------|-----------|
| **Outsider** | Nothing | Any ledger operation (blocked by signatory + allowlist) |
| **Holder** | Release / archive own name | Transfer (needs registrar), register, dispute |
| **Registrar** | Register, transfer, renew, dispute, counter-stake, vote | Change fees or other registry parameters outside governance, archive a name outside an `ArchiveReason` |
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
- `maxExtension : RelTime` — governance-configurable cap on name renewal duration
- Fee config: `minPriceFloor`, `registrarFeePercent`, `siblingFeePercent`
- Staking config: `minDisputeStake`, `counterStakeWindow`, `voteWindow`
- Governance config: `governanceVoteWindow` — default expiry for `GovernanceProposal`s
- CC plumbing: `transferFactoryCid`, `ccInstrumentId`, `featuredAppRightCid`

**Choices:**

| Choice | Controller | Description |
|--------|-----------|-------------|
| `RegisterName` | registrar, holder | Validates name format (`isValidName`), enforces uniqueness via `lookupByKey`, enforces `paymentAmount >= minPriceFloor`, and splits fees via chained `TransferFactory` calls. Creates a NameRecord that is live immediately. Holder co-controller provides signatory authority for NameRecord creation |
| `TransferWithApproval` | facilitatingRegistrar | Archive old + create new NameRecord atomically; requires TransferApproval. Rejected if the record has active disputes |
| `TransferWithoutApproval` | claimingRegistrar, newHolder | Reclaim expired name without holder consent. newHolder co-controller provides signatory authority for new NameRecord creation. Asserts expired and no active disputes |
| `ResolveName` | resolver | Read-only lookup via `fetchByKey`, returns (holder, expiry). Asserts not expired |
| `CreateDisputeStake` | dro, stakeDisputer | Factory: fetches LockedAmulet, validates `amount >= minDisputeStake`, creates DisputeStake with full lifecycle fields |

All choices are **nonconsuming** — the registry persists across operations. Governance changes (add/remove registrar, update fees) go through `GovernanceProposal.GovExecute`, which archives and re-creates the registry.

**Fee distribution — chained transfer pattern:** `RegisterName` distributes fees across multiple parties (treasury, sibling registrars, registrar) using a sequence of `TransferFactory_Transfer` calls. Because each call *consumes* its `inputHoldingCids`, the calls must be chained: the `senderChangeCids` returned by one transfer become the `inputHoldingCids` for the next. The order is: (1) treasury transfer using the original `paymentHoldingCids`, (2) sibling transfers in sequence each using the change from the previous step. The registrar retains their commission as the final change — no explicit transfer is needed.

#### NameRecord

One per registered name. Tracks both existence (via contract key) and ownership.

```
template NameRecord
  signatory dro, holder
  key (dro, name) : (Party, Text)
  maintainer key._1
```

**Lifecycle:** registered (live) -> archived (expired, voluntarily released, or dispute-won)

**Fields:** `dro`, `holder`, `name`, `registeredAt`, `expiresAt`, `disputes : [(Party, Text)]`

**Choices:**

| Choice | Controller | Description |
|--------|-----------|-------------|
| `Dispute` | disputer/registrar | Stake-backed dispute against the record; raisable any time after registration. Requires a DisputeStake CID and the disputer to be in the registrar allowlist |
| `ResolveDispute` | dro | Remove a disputer after DisputeResolution proves DisputeLost; consumes the resolution |
| `Renew` | renewingRegistrar | Registrar-facilitated extension; requires payment >= `minPriceFloor`; enforces `maxExtension` cap; distributes fees via chained TransferFactory calls (same pattern as `RegisterName`) |
| `Credential_ArchiveAsHolder` | holder | Voluntarily archive (burn) the name. Choice name aligns with `Credential` interface |
| `Release` | holder | **Transitional** template-level alias for `Credential_ArchiveAsHolder` — same body, same controller. Present only because the current test/client path cannot dispatch the interface choice via a template contract id; once that path is wired through, `Release` will be removed. |
| `NameRecord_Archive` | dro | Guarded archive choice. Used by Transfer flows to provide atomic transfer of name from one party to another within a TX. Takes `ArchiveReason`: `AR_Expired` (name expired), `AR_TransferApproved` (holder consented via TransferApproval), or `AR_DisputeWon` (DisputeResolution with DisputeWon outcome). Each reason is validated inline — no unguarded DRO archive path exists. |

**Interface implementation:** NameRecord fully implements `Splice.Api.Credential.RegistryV1.Credential` with the upstream `CredentialView` (`admin`, `issuer`, `holder`, `claims : Claims`, `createdAt`, `expiresAt`, `meta`), `Credential_ArchiveAsHolder` (returns `Credential_ArchiveAsHolderResult`), and `Credential_PublicFetch` (validates `expectedAdmin`).

#### TransferApproval

On-chain proof that a holder authorised a specific transfer.

```
template TransferApproval
  signatory dro, holder, newHolder
```

**Fields:** `dro`, `holder`, `name`, `newHolder`

The `newHolder` co-signatory provides newHolder's authority inside `TransferApproval_Use`, allowing creation of a new NameRecord with `signatory dro, newHolder` without requiring newHolder in the outer `actAs`.

Consumed by `TransferApproval_Use` (controller dro) during `TransferWithApproval`. The consuming choice prevents replay — once used, the approval is archived and cannot be exercised again.

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
- `GA_UpdateFees` / `GA_UpdateMinDisputeStake`
- `GA_UpdateDisputeWindows` / `GA_UpdateObservers`
- `GA_UpdateTransferFactory` / `GA_UpdateMaxExtension`

**Proposal validation:** `GovernanceProposal` has an `ensure` clause requiring `proposer \`elem\` registrars`, preventing non-registrars from creating proposals even with DRO access.

**Vote validation:** `GovVote` takes a `voteRegistryCid` parameter and validates the voter against the **live** registry's registrar list, not the proposal snapshot.

**Key design:** `GovExecute` fetches the **live registry** at execution time. The threshold, executor validation, and vote counting all use the live registrar list — not the proposal snapshot. This prevents padded-snapshot attacks.

#### DisputeStake and DisputeResolution

Staked dispute lifecycle from creation through resolution.

```
template DisputeStake
  signatory dro, disputer
  observer registrars
```

**Fields:** `dro`, `disputer`, `registrars` (snapshot at dispute time), `nameRecordCid`, `name`, `reason`, `stakeLockedAmuletCid`, `counterStaker : Optional Party`, `counterStakeLockedAmuletCid : Optional ...`, `createdAt`, `counterStakeDeadline`, `voteDeadline : Optional Time` (set when counter-stake lands), `votes : [(Party, Bool)]`.

**Lifecycle:**
1. **Open** — disputer stakes CC, exercises `NameRecord.Dispute`
2. **CounterStake** — any registrar in the allowlist (except the disputer) can counter-stake within `counterStakeDeadline`; takes a `registryCid` parameter, fetches the live registry, and sets `voteDeadline = now + registry.voteWindow`
3. **Vote** — registrars vote (`AddVote` with `voteRegistryCid`) within `voteDeadline` (duration governed by `NameRegistry.voteWindow`, configurable via `GA_UpdateDisputeWindows`). Voters are validated against the **live** registry, not the frozen snapshot
4. **Resolution** — `Resolve` (by DRO after vote window; any registrar can submit since all host DRO), or `ClaimTimeout` (if no counter-stake)

**DisputeStake fetch-not-consume at dispute time:** `NameRecord.Dispute` **fetches** the `DisputeStake` contract (read-only) rather than consuming it. This is by design — the stake must remain active throughout the dispute lifecycle so that `Resolve` or `ClaimTimeout` can exercise it (consuming it) at resolution time. Archiving the stake at dispute time would orphan the resolution paths.

A `DisputeStake` is technically reusable across separate name registrations (each `Dispute` choice only fetches it), but this is low-risk: the `Already disputed by this registrar` guard (`disputer \`notElem\` map fst disputes`) prevents the same disputer from filing a second dispute on any single name. The locked CC remains committed regardless, preserving the economic deterrent. The stake is consumed exactly once — by whichever resolution choice (`Resolve` or `ClaimTimeout`) settles the outcome.

```
template DisputeResolution
  signatory dro, disputer
```

Outcome record. The `disputer` co-signatory prevents forgery — only the legitimate dispute resolution path (through DisputeStake choices) can create these records, since disputer authority flows from the consuming DisputeStake.

**Consuming choice:** `DisputeResolution_Consume` (controller dro) archives the resolution after use. Both `NameRecord.ResolveDispute` (DisputeLost path) and `NameRecord_Archive` with `AR_DisputeWon` (DisputeWon path) exercise this choice, preventing the same resolution from being reused across multiple names.

**Outcome rules:**
- Strict majority `forDispute=True` → `DisputeWon` (registration blocked)
- Strict majority `forDispute=False` → `DisputeLost` (registration stands)
- Tie or no votes → `DisputeLost` (registration stands)
- No counter-stake by deadline → `DisputeWon` automatically (ClaimTimeout)

Protecting staked funds against misappropriation is an open design question — see Open Questions in Rationale.

### Security design

#### Signatory model and authorisation boundaries

Every contract has explicit signatories that the DAML ledger enforces at the authorisation layer:

| Contract | Signatories | Rationale |
|----------|------------|-----------|
| NameRegistry | `dro` | Singleton gateway; DRO authority flows to all name operations |
| NameRecord | `dro, holder` | Only creatable via NameRegistry; holder co-signs at creation (see note) |
| TransferApproval | `dro, holder, newHolder` | Both current holder and new holder must consent to transfer |
| GovernanceProposal | `dro, proposer` | Proposer identified; registrars are observers who vote |
| DisputeStake | `dro, disputer` | Disputer commits to the dispute |
| DisputeResolution | `dro, disputer` | Prevents forgery — disputer must co-sign |

The holder **is a co-signatory** on NameRecord (`signatory dro, holder`). This aligns with the upstream Credential interface (`signatory issuer, holder`). Holder authority flows into the create via `RegisterName` (where holder is a co-controller) and `TransferApproval_Use` (where newHolder is a signatory on TransferApproval). The `NameRecord_Archive` choice (`controller dro`) is guarded by `ArchiveReason` — each archive path validates its precondition inline (expired, transfer approval, or dispute won). No unguarded DRO archive path exists.

#### Consuming-choice replay prevention

DAML's consuming choices provide structural replay prevention:

- **TransferApproval**: consumed by `TransferApproval_Use` during transfer — cannot be reused
- **DisputeStake**: consumed by `Resolve` or `ClaimTimeout` — cannot be double-resolved
- **NameRecord**: archived and re-created atomically during transfers — no key gap for race conditions
- **GovernanceProposal**: consumed by `GovExecute` — cannot be executed twice

#### On-chain assertions

Critical field-match and state assertions prevent argument manipulation:

| Assertion | Choice | Prevents |
|-----------|--------|----------|
| `isValidName proposedName` | RegisterName | Malformed names (uppercase, missing `.canton`, leading/trailing hyphens, etc.) |
| `registrar \`elem\` registrars` | RegisterName, Dispute, Renew, etc. | Outsider registration/dispute |
| `paymentAmount >= minPriceFloor` | RegisterName | Below-floor pricing |
| `isNone existing` (lookupByKey) | RegisterName | Duplicate names |
| `approval.holder == record.holder` | TransferWithApproval | Cross-holder approval reuse |
| `approval.name == record.name` | TransferWithApproval | Cross-name approval reuse |
| `voter \`notElem\` map fst votes` | AddVote, GovVote | Double voting |
| `null record.disputes` | TransferWithApproval, TransferWithoutApproval, Renew | Movement / renewal of a name while a dispute is open |
| `record.expiresAt < now` | TransferWithoutApproval | Premature expiry reclaim |
| `record.expiresAt > now` | ResolveName | Stale name resolution |
| `expiry > now` | RegisterName | Registration with past expiry |
| `newExpiry > now` | TransferWithApproval, TransferWithoutApproval | Transfer with past expiry |
| `newExpiry <= now + maxExtension` | Renew, TransferWithApproval, TransferWithoutApproval | Unbounded extension (permanent names) |
| `expiresAt > now` | Renew | Resurrection of expired names without re-registration |
| `renewalPaymentAmount >= minPriceFloor` | Renew | Free renewals bypassing economic model |
| `proposer \`elem\` registrars` | GovernanceProposal (ensure) | Non-registrar governance proposals |
| `voter \`elem\` registry.registrars` (live) | GovVote, AddVote | Removed registrar voting on proposals/disputes |

### Contract key summary

| Template | Key | Maintainer |
|----------|-----|-----------|
| NameRecord | `(dro, name)` | `dro` |

Contract keys use Canton 3.6's non-unique key semantics. `RegisterName` performs `lookupByKey` before `create` to enforce uniqueness — the DRO is sole signatory and key maintainer, eliminating race conditions.

## Rationale

### Design Goals

1. **Decentralised** — Trusted registrars can be on-boarded to provide name sales to end-users. All registrars are centrally backed by a decentralised on-chain registry. A multi-hosted "Decentralised Registry Operator" (DRO) party provides technical failover across registrar nodes. As a core goal, the system needs to be able to outlive any single registrar as a point of failure.

2. **Registrar incentives** — Registrars are rewarded for their work via fees claimable from each registration and renewal. The fee split (registrar, sibling registrars, treasury) is governance-configurable and enforced on-chain via chained `TransferFactory_Transfer` calls.

3. **Dispute resolution** — Generally new registrations should go through without issue as individual registrars are following the same standards and rules, but we've provided a dispute mechanism that registrars can use in the event of issues. This is deliberately light-weight in that it doesn't affect the "happy path" of registration (as disputes should be rare).

4. **On-chain integrity** — Names are guaranteed unique via on-chain checks. We rely on the underlying infrastructure to solve for the race conditions/atomicity of these registrations. All authorisation flows through DAML's signatory model.


### Open Questions 

Items still to be ironed out before this moves out of draft:

- Proposed fee structure, including floors etc
- "Physical" governance of the DRO party
  - i.e. if a registrar is off-boarded, is it possible to do something like a key rotation while maintaining the party ID? 
- Bonds/Staking for registrars: If we're doing on-chain staking/slashing of funds (e.g. to prevent spurious disputes), how can we correctly protect funds of registrars so that:  
  - a consensus of registrars can slash funds, without needing the offending registrar to agree 
- attack vectors of a "rogue" DRO host
  - i.e. the ability to act unilaterally as one of the hosts of the multi-hosted party. (it's our understanding that a multi-hosted party is giving you technical failover but that there's no "human in the loop" element agreeing or declining to sign individual transactions) 

## Backwards Compatibility

No direct prior on-chain state for compatibility as an applications-layer CIP.

## Reference Implementation

Reference implementation to follow. Currently targeting Canton SDK 3.6.0 (LF target 2.3-staging), which is still in an alpha phase.
Have also aimed to align the `NameRecord` itself to the upstream `Splice.Api.Credential.RegistryV1` interface, which is in an unmerged PR.

## Copyright

This document is licensed under [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/).
