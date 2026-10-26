# CIP-?: Canton Access and Privacy Standard

<pre>
  CIP: ?
  Layer: Applications
  Title: Canton Access and Privacy Standard
  Author: RedStone
    Łukasz Kalbarczyk <lukasz@redstone.finance>
    Michał Szynwelski <szynek@redstone.finance>
    Jakub Wojciechowski <jakub@redstone.finance>
  Status: Draft
  Type: Standards Track
  Created: 2026-10-23
  License: CC0-1.0
  License-Code: Apache-2.0
</pre>

## Abstract

This CIP defines a set of Daml interfaces, the Canton Access and Privacy
Standard (CAPS), for publishing, distributing and verifying oracle data on
Canton. Under CAPS a data set is published in numbered rounds whose
price-free records are visible to the feed's readers; the data travels in
capsules that each distributor scopes to its own clients; and a consumer
proves two things on its own participant, with no informee but itself:
that a capsule's content is what the oracle's nodes signed, and that it is
the content fixed in the round of its number. The party that publishes the
data is a stakeholder of nothing a consumer touches, so it learns who holds
a license and nothing about consumption.

The standard is oracle-agnostic: an oracle joins it by providing one
contract, a verifier for its own signing scheme. It builds on the
[Canton Data Standard](https://github.com/kaikodata/canton-data-standard):
every capsule implements `PublishedDataPoint`, so an
application written against that standard reads a CAPS capsule unchanged.
A reference implementation, with verifiers for RedStone payloads and for the
Data Standard's signed envelope, accompanies the proposal.

## Motivation

Price-dependent workflows on Canton have no standard source of a
canonical, auditable price. CIP-0056 defines asset issuance and settlement
but contains no valuation clause, so every price-dependent lifecycle event
in a token workflow takes its reference from outside the standard. The
FINOS CDM implementation demonstrated on Canton models margin and
collateral workflows, but its event types (Valuation, MarginCallIssuance,
Reset) take a price input as a given. The Collateral Subcommittee's work on
haircut schedules and margin thresholds depends on deterministic price
feeds in the same way. Each of these needs the same thing: a price that
every party to a transaction can establish is the one the oracle fixed at a
given time, without trusting the others, and that an auditor can trace
back to a signed attestation. The network already runs on price feeds
without such a record: the reference price of Canton Coin is ingested and
voted by each Super Validator off-ledger (CIP-0079, CIP-0092), and several
Super Validators have committed to bringing market and oracle data onto
Canton (CIP-0061, CIP-0063, CIP-0065). A shared standard lets an
application consume any of these feeds through one code path and lets
their providers compete on data rather than on integration.

The two oracle models in use on other networks each fail one institutional
requirement. A pull oracle, where the submitting party fetches a signed
price certificate off-chain and includes it in its transaction, provides no
canonical fixing: two counterparties to one settlement may hold two valid
certificates with different timestamps or aggregations, and nothing at the
protocol level says which governs. Traditional market infrastructure
resolves this with fixing conventions, such as the 4pm WM/Reuters rates or
ISDA fallback frameworks; the pull model has no equivalent, which is why
its adoption has stayed with latency-sensitive trading rather than with
lending, collateral and structured products, where a single agreed
reference price is required for margin, liquidation and valuation. A push
oracle, where the oracle writes a single on-ledger price contract, gives
the fixing but, on Canton, leaks consumption: reading a contract in a
transaction is an event disclosed to its stakeholders, so an oracle that is
a stakeholder of the price contract observes which participants use which
data, when and how often. Consumption patterns reveal positions, hedging
and transaction timing, which institutions cannot accept as a side effect
of a price lookup.

![Pull: two parties hold two valid prices and no canonical fixing. Push: one
price contract whose every read informs the oracle. CAPS: a round with time
and hash on the ledger, capsules scoped to each client, verification on the
consumer's own participant](images/cip-pull-push-caps.svg)

Canton's model makes it possible to have the push model's fixing without
its leak, provided the design keeps the oracle's contracts off every path
a consumer's transaction takes. A party is informed of a transaction when
it is a stakeholder of a contract the transaction creates or archives, or
a signatory or actor of a contract it fetches or exercises. A verification
that fetches the oracle's contract informs the oracle; a distribution that
archives a shared contract informs every observer of it. Data providers
add a third requirement: the right to distribute and redistribute data is
licensed, and a provider must be able to see who holds a license and to
revoke it, without seeing what the licensee does with the data. Each
oracle on Canton today solves this in its own templates, with its own
notion of a round and its own verification path, so an application that
consumes two feeds codes against two models, and the guarantees it gets
differ in ways that are hard to compare.

The workflows this is meant to serve: the net asset value of a tokenized
fund published at dealing cut-offs, where transfer agents, custodians and
wealth platforms each see the valuation relevant to their holdings and
none can infer another's assets under management; fair-value assessments
for secondary transfers of private company shares, where each transaction
sees the valuation and no participant observes other trades; structured
notes on a basket of private fund NAVs, where investors receive views
scoped to their tranche; and corporate actions fixed once by consensus of
several verifiers and consumed down a custody chain, each custodian
deriving the entitlement relevant to the positions it holds.

The [Canton Data Standard](https://github.com/kaikodata/canton-data-standard),
published by Kaiko, fixes how a data point is read: the
`PublishedDataPoint` interface and the `AnyValue` type. It does
not say how a consumer establishes that a data point is canonical, how
data is licensed and redistributed, or what a distribution reveals. CAPS
fills that gap above the Data Standard, without changing it: it fixes what
a consumer checks, what a publication produces, what a license may do and
what a distribution must not reveal, and leaves everything vendor-specific
to one interface, the verifier.

A standard rather than a product because an interface package on Canton
cannot be smart-contract-upgraded: whatever interface consumers code
against is fixed for the life of its version. Fixing it once, in the open,
lets wallets, dApps and settlement contracts verify any conforming feed
through one code path, lets data providers compete on data and price rather
than on integration, and gives the network a shared definition of a
verified feed.

## Specification

The normative text of this section is restated in full, with the data
types and the reference implementation's choices, in the specification of
the [reference repository][repo] (see Reference implementation). The
interface source, package `caps-api-core-v1`, is the authority where the
two differ.
The words MUST, SHOULD and MAY are used as in RFC 2119.

### 1. Overview

A **data set** (a feed) is identified by a `DataDefinition` contract, whose
view names the canonical `Verifier` instance for the feed. Publication
happens in **rounds**: each round is a `Round` contract holding a round
number, a fixing time and a commitment to the data, never the data itself.
The chain of rounds is driven by one live `RoundHead` contract per data
set, consumed and re-created on every publication, which is what makes
round numbers unique. The data of a round is published as a **capsule**, a
`Capsule` contract carrying the data point, the oracle's signed payload and
the license under which it was created. **Licenses** are `License`
contracts: the root license belongs to the publishing party, and every
sublicense to the licensee it was created for. A license owner distributes
by deriving a new capsule, with the same content, for its own clients. A
license may name a `LicenseDelegate`, the extension point through which a
deployment adds behaviour such as accounting.

![The contracts of one data set with their signatories and observers; above
the line those the operator signs or observes, below it the distributed
capsules and the consumer's own verifier](images/cip-model.svg)

In the terms of the original proposal: the feed producer contract is the
`DataDefinition` together with its canonical `Verifier` and the
`RoundHead`; the root capsule is the root `Capsule` of a round, with the
`Round` as its price-free record; derived capsules are capsules created
through `License_Distribute`; the credentialed verifier that mints the root
is the publisher exercising `RoundHead_CreateRound`; and the licensing
terms live in `License` contracts rather than in the feed producer.

The standard refers to parties by role. One party may hold several roles.

| Role | What it does |
|---|---|
| Operator | Publishes the data set: owns the root license and is the distributor of every root capsule. |
| Publisher | Submits a publication. The operator always may; an implementation may admit others. |
| Readers | The parties entitled to see that a round exists and to check capsules against it. |
| Distributor | The owner of a license, who signs the capsules created under it. |
| Licensee | A party a license entitles to create a sublicense from it. On the root license, also the audience of every root capsule. |
| Client | A party a capsule is distributed to. |
| Consumer | A client that verifies a capsule before acting on it. |
| Auditors | In the reference implementation, parties that co-sign the definition, the head and the rounds, so that the operator cannot archive them, fork the chain or mint a round alone; they may pause publication. Not named by the interfaces. |

The privacy goal is stated in terms of these roles: **the operator learns
who holds a license and who publishes rounds; it does not learn who
consumes, or how much any distributor distributes.**

### 2. The interface package

`caps-api-core-v1` is a Daml package targeting Daml-LF 2.1, built with
`--explicit-serializable=yes`, that depends on the
[Canton Data Standard](https://github.com/kaikodata/canton-data-standard)
packages `canton-data-standard-utils-v1` (for `AnyValue`) and
`canton-data-standard-datapoint-v1` (for `PublishedDataPoint`), version
0.2.0. It defines
seven interfaces and the shared types below, and no executable code: every
choice body is a single call of an interface method.

```haskell
data CapsuleContent = CapsuleContent with
    dataPoint : PublishedDataPointView   -- distributor, publishedAt, values...
    payload : AnyValue                   -- the oracle's signed data, opaque
    license : ContractId License

type RejectionReason = Text
data VerificationResult = Verified with dataHash : Text
                        | Rejected [RejectionReason]
data CheckResult = Passed | Failed [RejectionReason]
data CapsuleSource = ById (ContractId Capsule) | ByView CapsuleView
data CreateRoundResult = CreateRoundResult with
    head : ContractId RoundHead
    round : ContractId Round
    capsule : ContractId Capsule
```

### 3. The interfaces

#### 3.1 `DataDefinition`

The identity and trust anchor of a data set; its contract id is what every
round, capsule and license points at.

```haskell
data DataDefinitionView = DataDefinitionView with
    dataId : Text                  -- a human-readable name, not unique
    verifier : ContractId Verifier -- the canonical verifier instance
```

No choices. An implementation MUST keep a definition's view constant for
its life: a change of verifier or of data set is a new definition. A
definition SHOULD be visible to the readers. Who signs it and how it is
created is left open.

#### 3.2 `Verifier`

The oracle's verification rules as a contract, and the only vendor-specific
piece of a deployment. Its view is empty; its parameters (keys, quorum,
freshness window) are template fields, known to whoever creates an
instance. It answers three questions through non-consuming choices whose
only controller is the asking party, each taking views, never contract ids:

```haskell
nonconsuming choice Verifier_Verify : VerificationResult
  with actor : Party; capsule : CapsuleView
nonconsuming choice Verifier_VerifyRound : CheckResult
  with actor : Party; capsule : CapsuleView; round : RoundView
nonconsuming choice Verifier_VerifyFreshness : CheckResult
  with actor : Party; capsule : CapsuleView; asOf : Time
```

`Verifier_Verify` (authenticity) returns `Verified dataHash` when the
content is authentic by the verifier's rules, typically that `payload`
carries a sufficient set of valid oracle signatures and that `dataPoint` is
the correct aggregate of it; `dataHash` is the verifier's commitment to the
content. `Verifier_VerifyRound` (canonicality) passes when the round
belongs to the capsule's definition, has its round number and fixing time,
and has as `dataHash` this verifier's commitment to the content.
`Verifier_VerifyFreshness` passes when the fixing time is acceptable at
`asOf` by the oracle's window.

Requirements:

- A verifier MUST NOT abort on a bad capsule; it reports.
- Each verdict MUST be a function of the choice's arguments and the
  verifier's own fields only: not of ledger time, the calling party or any
  other contract. A verifier MUST NOT fetch or exercise another contract.
- The commitment MUST be stable across instances with the same parameters,
  and MUST depend only on the fields of `CapsuleContent` that a
  distribution copies unchanged: `publishedAt`, `schemaVersion`, `values`,
  `metadata` and `payload`; never on `license` or on `distributor`.
- Two instances with the same template and parameters MUST give the same
  verdicts, which is what lets a consumer verify against an instance of
  its own.

The signing scheme, the aggregation, the encoding of `payload`, the
commitment function and the freshness window are the implementation's.

#### 3.3 `RoundHead`

The head of a data set's round chain and its publishing endpoint. One live
contract per definition.

```haskell
data RoundHeadView = RoundHeadView with
    definition : ContractId DataDefinition
    round : ContractId Round   -- the latest round; a pointer, may be retired
    roundNumber : Int          -- the latest round's number
    isPaused : Bool

choice RoundHead_CreateRound : CreateRoundResult   -- consuming
  with actor : Party; content : CapsuleContent
```

An implementation of `RoundHead_CreateRound` MUST: consume the head, so
that two concurrent publications are a double spend and the loser creates
nothing; give the new round the previous number plus one and
`content.dataPoint.publishedAt` as its timestamp; fail unless that fixing
time is strictly greater than the previous round's; obtain the verdict of
`Verifier_Verify` from the definition's canonical verifier for the new
capsule's view, fail on `Rejected`, and record the returned `dataHash` in
the round; obtain the verdict of `Verifier_VerifyFreshness` with ledger
time as `asOf` and fail on `Failed`; fail while `isPaused`; create the root
capsule with `content` unchanged, signed by the operator, with the operator
as `distributor`; and fail unless `content.license` is a license of this
definition owned by the operator. The authority to sign the round and the
root capsule MUST flow from the head, not from the caller, so that
publication is open to any party the implementation admits. The head
carries the latest round's number and fixing time itself, so a
publication depends on no round's existence and retiring one never stops
the chain. Who signs the head and the rounds, how publication is paused
and who observes the root capsule are left open.

#### 3.4 `Round`

The immutable, price-free record of one fixing. A consumer reads it from
its own participant and passes the view to `Verifier_VerifyRound`; it is
never fetched inside a consumer's transaction.

```haskell
data RoundView = RoundView with
    definition : ContractId DataDefinition
    roundNumber : Int
    timestamp : Time   -- the fixing time
    dataHash : Text    -- the verifier's commitment to the root capsule
```

```haskell
choice Round_Archive : ()   -- consuming
  with actor : Party
```

A round MUST be created only by `RoundHead_CreateRound`, except round 0,
the genesis round, which the bootstrap of a definition creates with an
empty commitment and no capsule. A round's view MUST NOT change. Rounds
MUST be visible to the readers and MUST NOT carry the data. A round MUST
be archived only by `Round_Archive`, whose authority flows from the round
and which MUST refuse any actor the implementation does not admit; the
reference implementation admits the operator alone. A round SHOULD outlive
every capsule of its number; when it may go is an archiver's rule, not the
standard's.

#### 3.5 `License`

A right to distribute capsules and to sublicense. One interface for every
level of the chain.

```haskell
data LicenseView = LicenseView with
    definition : ContractId DataDefinition
    owner : Party                       -- the signatory; the only distributor
    licensees : [Party]                 -- entitled to sublicense from it
    delegate : Optional (ContractId LicenseDelegate)

nonconsuming choice License_Distribute : ContractId Capsule
  with source : CapsuleSource; clients : [Party]
  controller (view this).owner
nonconsuming choice License_CreateSublicense : ContractId License
  with actor : Party; licenseType : AnyValue; licensees : [Party]
  controller actor
```

`License_Distribute` MUST copy the source capsule's definition, round
number and content unchanged, except for `content.license`, which becomes
this license, and `distributor`, which becomes the owner; MUST fail when
the source belongs to another definition; MUST make `clients` observers of
the new capsule and SHOULD make nobody else, since every added observer
learns the audience, which the delegate exists to avoid; and MUST NOT
verify the source's authenticity, which is the consumer's check.
`License_CreateSublicense` MUST fail unless `actor` is one of the license's
`licensees`; the child,
signed by `actor` alone, MUST have the same definition. A license that
names a delegate MUST exercise `LicenseDelegate_OnDistribute` in every
distribution, after creating the capsule, and MUST give every sublicense
the delegate `LicenseDelegate_Subdelegate` returns. A license's `licensees`
MUST be fixed for its life. An implementation SHOULD provide a way for the
licensor to retire a license. The encoding of `licenseType`, expiry,
revocation and what a distribution costs are left open.

#### 3.6 `Capsule`

The unit of distribution. `Capsule` requires the Data Standard's
`PublishedDataPoint`, so any consumer of that standard reads it unchanged.

```haskell
data CapsuleView = CapsuleView with
    definition : ContractId DataDefinition
    roundNumber : Int
    content : CapsuleContent
```

No choices of its own. `PublishedDataPoint_Fetch` is inherited from the
Data Standard; a consumer that reads a capsule through it informs the
distributor, so a CAPS consumer reads the view from its own participant
instead (section 4). The signatory MUST be `content.dataPoint.distributor`.
`content.dataPoint` MUST equal the view the contract exposes through
`PublishedDataPoint`. The observers MUST be the audience the capsule was
distributed to: for a root capsule, the audience the implementation
defines, which MUST include the root license's licensees (the reference
adds the auditors); for a distributed capsule, the `clients` of
`License_Distribute`, and nobody else unless the implementation chooses to
widen it (3.5). A capsule MUST NOT be modified; retention is the
distributor's.

#### 3.7 `LicenseDelegate`

What a license does on a distribution beyond creating the capsule.
Optional: a license names one, or `None`. Its view is empty.

```haskell
nonconsuming choice LicenseDelegate_OnDistribute : ()
  with distributor : Party; license : ContractId License; roundNumber : Int
       capsule : Optional (ContractId Capsule); clients : Optional [Party]
       context : Optional AnyValue
  controller distributor
nonconsuming choice LicenseDelegate_Subdelegate
    : Optional (ContractId LicenseDelegate)
  with licensor : Party; actor : Party
       licenseType : AnyValue; licensees : [Party]
  controller licensor, actor
```

`LicenseDelegate_OnDistribute` is exercised by the license in the same
transaction as the distribution, so a distribution through the license
cannot happen without it. `LicenseDelegate_Subdelegate` returns the
delegate a sublicense names, with the authority of both owners, which
`License_CreateSublicense` carries. Who signs a delegate decides who learns
of distributions: a delegate signed by the distributor informs nobody new;
one signed by an accountant informs the accountant and makes its
participant a confirming party of every distribution; one signed by the
operator defeats the privacy goal. The licensees of every license that
names a delegate MUST observe the delegate.

### 4. Privacy rules

Canton informs a party of a transaction node when the party is a
stakeholder of a contract the node creates or archives, a signatory or
actor of a contract the node fetches or exercises, or an observer of a
contract a consuming exercise archives. The rules follow.

1. **Verification takes views, never contract ids.** A fetch would inform
   the capsule's distributor and the round's signatories that the consumer
   used the capsule and when.
2. **A consumer verifies against its own verifier instance.** Exercising
   the canonical instance would inform its signatory of every
   verification. The consumer creates an instance from the same template
   with the same parameters and itself as signatory; by 3.2 the verdicts
   are the same.
3. **A consumer reads its round from its own participant.** As an observer
   it has the view without any transaction.
4. **Distribution by view is private; by id is not.** `ByView` passes the
   source as data and informs the owner and the new capsule's clients
   only, plus the delegate's informees if the license names one. `ById`
   fetches the source and informs its signatory of the time of this
   distribution.
5. **Nothing on the consumption path touches a contract the operator
   signs.** The operator is informed of a round's existence, which it
   created, and of nothing downstream.
6. **Disclosure informs the recipient only.** A publisher that is not a
   reader can be shown the contracts a publication touches; a client can be
   shown the license a capsule names. Neither creates a ledger event.

![Who is informed of a publication, a distribution and a verification: the
operator and the auditors of the first, the distributor and its clients of
the second, the consumer alone of the third](images/cip-informees.svg)

A party acting as operator MUST NOT also act as a client's verifier owner
or, where an extension adds the role, as an accountant, or it learns
through those roles what the rules keep from the operator.

### 5. The consumer's procedure

A consumer accepts a capsule only after:

1. **Authenticity.** `Verifier_Verify` on its own verifier instance with
   the capsule's view MUST return `Verified`.
2. **Canonicality.** `Verifier_VerifyRound` with the capsule's view and the
   view of the round of the capsule's number for the capsule's definition,
   read from the consumer's own participant, MUST return `Passed`. A
   consumer that is not a reader cannot perform this check and SHOULD NOT
   accept the capsule.
3. **Freshness.** `Verifier_VerifyFreshness` with the time the consumer
   cares about MUST return `Passed`, or the consumer applies a policy of
   its own to `publishedAt`.
4. **License.** The capsule's `definition` MUST be the definition the
   consumer pinned, and `content.license` SHOULD resolve to a license the
   consumer sees, or is shown, whose `owner` is the capsule's distributor
   and whose definition is the capsule's.
5. **Chain.** The round's signatories, as the Ledger API reports them,
   SHOULD be the signatories of the definition the consumer pinned. In the
   reference implementation both are the operator and the auditors, and the
   auditors' authority over a round exists only inside
   `RoundHead_CreateRound`, so such a round came from the chain.

A consumer that uses a capsule in a transaction with other parties
performs checks 1 to 3 inside that transaction: every informee's
participant re-executes them, so counterparties need not trust the
consumer's reading.

### 6. The publisher's procedure

A publication is one exercise of `RoundHead_CreateRound` on the current
head. Every contract the transaction uses MUST be visible to the
submitter's participant, whatever authority the choice carries; in the
reference implementation these are the head, the canonical verifier and
the root license, so publication is open to whoever sees all three, by
observation or by explicit disclosure. A publisher that
loses the race on the head gets a failed submission, nothing is created,
and it retries on the new head.

### 7. Conformance

- **A deployment** conforms when it runs, for each data set, one
  `DataDefinition`, one `Verifier` the definition points to, a chain of
  `RoundHead` and `Round` contracts, and `License` and `Capsule`
  contracts, all satisfying section 3. It MAY add contracts, choices and
  fields beyond the interfaces.
- **A verifier** conforms when its template implements `Verifier` under
  3.2.
- **A consumer** conforms when it accepts a capsule only after the checks
  of section 5. A consumer written against `PublishedDataPoint` alone
  reads a capsule but does not conform.

### 8. What the standard does not promise

- **A capsule can be created directly.** A template signed by its
  distributor alone can always be created outside any license.
  `Verifier_Verify` rejects fabricated content; nothing rejects a genuine
  capsule that skipped the license. The only structural remedy, a
  co-signatory of the capsule, would see the capsule's audience.
- **License provenance is policed, not proven.** Whether a license was
  issued through the chain is visible to the parties the implementation
  makes observers of it, and known to the licensor it names; it is not
  provable to a consumer from the interface alone.
- **The operator learns who publishes and who holds licenses.** What it
  does not learn is consumption.

### 9. Versioning

An interface package cannot be smart-contract-upgraded. A change to any
view, type or choice signature of `caps-api-core-v1` is a new package,
`caps-api-core-v2`, which a deployment adopts by implementing both during
the transition, as the Token Standard did between CIP-0056 and CIP-0112.
Implementation packages, verifiers among them, MAY be
upgraded in place under Daml's smart-contract upgrade rules, which is where
the executable code lives for that reason.

## Rationale

**Interfaces, not templates.** Oracles differ in signing schemes,
aggregation and payload encodings, and will keep differing. Everything
vendor-specific is behind `Verifier`; everything a consumer, a wallet or a
settlement contract needs to know is in the views and the choices. A
deployment may replace any template of the reference implementation and
remain conforming. The price is that the interface package is frozen for
its version; the executable code is kept out of it so that it can be
upgraded.

**Views, never contract ids, on the verification path.** This is the
single rule from which the privacy guarantee follows. A verifier that
fetched the capsule or the round would inform their signatories, which
include the operator, of every verification. Passing the views as data
costs the consumer nothing: it is an observer of both and already holds
them. The same reasoning gives distribution by view as the private option,
and the rule that a distribution informs its clients and, by default,
nobody else is the principle the Token Standard V2 (CIP-0112) states for
settlement choices: the set of informees only ever decreases along the
chain.

**A consumer's own verifier instance.** The canonical instance a
definition names is the reference the consumer copies its parameters from,
not the contract it exercises. Requiring verdicts to be a pure function of
arguments and parameters is what makes the copy equivalent, and it also
makes every verdict reproducible by any party later, which is what lets the
checks run inside a multi-party settlement.

**A commitment in the round, not the data.** Readers of the rounds learn
that a fixing happened and when, and can check any capsule against it,
without receiving the data. The round is the canonical anchor every reader
shares; the data goes only where it is licensed to go. The requirement that the
commitment cover exactly what a distribution copies unchanged is what makes
a redistributed capsule verify against the same round as the root.

**Lineage to the fixing, not to the path.** Every capsule is anchored to
the round of its number: a consumer proves that the content is the one
fixed in that round, whatever chain of distributions brought it, and the
chain itself is not observable from the capsule. A reference to the parent
capsule would add nothing to the proof, since the round already binds the
content, and following it would inform the parent's signatory. What an
auditor traces is the fixing: the round, its commitment, and the signed
payload every copy carries verbatim.

**Attenuation is structural where the ledger can make it so, policed
elsewhere.** That a child cannot assert rights its parent does not hold is
enforced by the ledger at the points where a choice is involved: a
sublicense can be created only by a party the parent
entitles, a license's licensees are fixed for its life, the root capsule's
audience is the root license's licensees, and a license that names a
delegate calls it in the same transaction as every distribution. What the
ledger cannot enforce is that a capsule or a license was created through a
choice at all: a template signed by one party is always directly
creatable by that party. The standard says so (section 8) and gives the
operator and the licensor the means to see and revoke rather than promise
a guarantee the visibility model does not allow.

**The head as a mutex.** Consuming one contract per publication is the
cheapest way Canton offers to make round numbers unique: concurrent
publications on one head are a double spend, and the loser retries on the
new head. This is the contention pattern Splice adopted for its own
automation (CIP-0064), where every Super Validator may submit the same
action and the ledger picks one. The standard does not rely on contract
keys: the interface package stays on Daml-LF 2.1, which the Data Standard
and Splice target, and a key lookup on the consumption path would inform
the key's maintainers; an implementation on a later LF version may use
keys for its own purposes. A k-of-n approval of every publication is
likewise left to deployments that need it: the authority to publish flows
from the head, so a propose-and-accept workflow around it is an
implementation choice, paid for in publication latency.

**Who signs the head and the rounds.** On Canton every guarantee of the
form "the operator cannot do X alone" is somebody's signature, and every
signatory's participant is a confirming party of every transaction that
touches the contract. Confirmation is validation, not consent: a
participant cannot refuse a valid transaction, only be unavailable. The
standard therefore leaves the signatories open and the reference
implementation chooses co-signature by every auditor: the ledger excludes
a fork of the chain, at the cost that an auditor's outage stops
publication, which multi-hosting the auditors' parties addresses in
topology. The alternatives are documented with the reference
implementation: auditors as observers who acknowledge rather than co-sign,
with a consumer-side check (a fork becomes detectable rather than
excluded); a subset of co-signers with
pause thresholds; and a governance party in a decentralized namespace with
a k-of-n confirmation threshold. None changes the interfaces, which is the
point: the consumer's chain check (section 5, check 5) is what adapts.

**Checking signatories outside the verifier.** A verifier sees views, and a
view can carry any field its creator writes; signatories are facts of the
ledger, visible in the Ledger API events. The chain check belongs to the
consumer's application for that reason.

**Provenance of licenses is policed, not proven.** A license template
signed by its owner alone can always be created directly, as can a capsule.
The structural remedy, a second signatory of every capsule, would see every
capsule's audience and defeat the privacy goal. The standard therefore
leaves who observes or co-signs a license to the implementation: the
reference makes the operator and the licensor observers, so that a license
created outside the chain is visible to them the moment it exists and
either may revoke it; a deployment may add accountants or other observers,
or co-sign licenses, and detect a forged one on the ledger, at the cost of
making those parties confirming parties of every distribution. What no
variant can do is prove provenance to a consumer from the interface alone,
and section 8 says so rather than promising what the ledger cannot
deliver.

**Building on the Canton Data Standard.** A capsule is a
`PublishedDataPoint`, and payloads and license types use `AnyValue`, so
consumers of the Data Standard read CAPS feeds unchanged and the two
standards do not compete. CAPS does not extend `PublishedDataPoint` itself
because canonicality and licensing need contracts of their own (the round,
the head, the license), not more fields on the data point.

**Delegates as the extension point.** Accounting, metering and quotas vary
by deployment and by jurisdiction; the standard fixes only that a license
calls its delegate in the same transaction as the distribution, so that
whatever a deployment records cannot be skipped by a distributor that uses
the license. Who signs the delegate is the deployment's choice, with the
trade-off between privacy and confirmation stated in 3.7. The reference
repository ships an accounting delegate as an example; it is not part of
the standard.

**Community feedback.** To be summarized after the cip-discuss thread.

## Backwards compatibility

The proposal adds new interfaces and changes nothing that exists. Contracts
of oracles already deployed on Canton are unaffected; an oracle adopts CAPS
by deploying a conforming set of contracts alongside its existing ones and
a verifier for its scheme. Applications written against the Canton Data
Standard's `PublishedDataPoint` read CAPS capsules without change, and gain
the checks of section 5 when they adopt the `Capsule` and `Verifier`
interfaces. A CIP-0056 asset registry, or any settlement contract, consumes
a capsule through an ordinary contract read within the existing
stakeholder model, and may run checks 1 to 3 inside its own transaction so
that every informee's participant re-executes them; no new ledger
primitive is involved, and a wallet or dApp reaches the contracts through
the dApp API (CIP-0103) as it reaches any other. An oracle's off-chain
signing is
unchanged: the RedStone verifier consumes the payloads RedStone's nodes
already sign, and the Data Standard verifier the envelope that standard
defines. Later versions of the standard are new interface packages
(section 9), adopted by implementing both during a transition.

## Reference implementation

The reference implementation is at
<https://github.com/redstone-finance/canton-access-privacy-standard-public>;
the tag this proposal refers to: TODO.

The repository contains the interface package `caps-api-core-v1`, a
reference implementation `caps-core` generic over the oracle (templates for
the definition and its bootstrap proposal, the head, the round, the license
and the capsule), two verifiers (`caps-verifier-redstone` for payloads
signed by RedStone oracle nodes, verified by the RedStone Daml SDK, and
`caps-verifier-datastandard` for data signed in the Canton Data Standard's
own envelope, verified by its codecs), an extended set of license kinds and
an accounting delegate as examples of extensions, archivers for capsules
and for rounds that apply one retention rule, and a Daml Script test suite
covering bootstrap, publication and its rejections, the race on the head,
pause, distribution by view and by id, sublicensing, revocation, round
retirement and every visibility claim of section 4. The
documentation includes the full specification, the data model, consumer
and implementer guides, the governance variants and the threat model.

Interface package hash at the tag: TODO.

The work is funded by the Development Fund (CIP-0082, governed by
CIP-0100) under a grant whose first milestone includes this proposal. Code
is licensed under Apache-2.0 (see License-Code).

## Copyright

This CIP is licensed under CC0-1.0. The reference implementation is
licensed under Apache-2.0.

## Changelog

- 2026-10-23: initial draft.

[repo]: https://github.com/redstone-finance/canton-access-privacy-standard-public
