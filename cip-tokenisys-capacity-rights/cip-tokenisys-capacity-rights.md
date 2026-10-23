<pre>
  CIP: XXXX
  Title: Holdings-Denominated Capacity Rights
  Author:
    Tokenisys <ds@tokenisys.com>
  Discussions-To: https://lists.sync.global/g/cip-discuss/topic/draft_cip/121390753
  Status: Draft
  Type: Tokenomics
  Created: 2026-08-27
  License: CC0-1.0
  Requires: 0104, 0116
</pre>

# CIP XXXX: Holdings-Denominated Capacity Rights

## Abstract

This CIP proposes that locked Canton Coin confer a **direct, proportional
claim on synchronizer throughput**, replacing the current arrangement in
which applications burn traffic and separately earn minted CC to offset that
burn.

Under this proposal, synchronizer capacity is offered periodically at auction,
in a quantity bounded below the capacity the synchronizer undertakes to
deliver. A party locking Canton Coin at auction receives an entitlement
denominated in **absolute bytes per epoch, fixed for the term**, not a share
of a contested pool. The entitlement does not move with the locking decisions
of other parties and does not move with subsequent changes in network
capacity, so a participant can state and budget its throughput on the day it
acquires it.

Locking further separates the holding into two fungible, tradeable
instruments: a **utility strip (TU)** carrying the capacity entitlement for a
fixed term, and a **capital strip (TC)** redeeming to unlocked CC at maturity,
where TU + TC reconstitutes the locked holding. TU expires at maturity; TC
redeems. This allows a party to purchase throughput without taking token price
exposure, and a holder to monetise capacity without surrendering capital
exposure. The forward curve of TU prices across maturities becomes the control
input for capacity provisioning, replacing the periodic human price
recommendation established by CIP-0084.

The network has already adopted locking as a commitment signal for Super
Validators (CIP-0105) and Featured Apps (CIP-0116). This CIP completes that
direction of travel: today locked CC buys *eligibility to be voted on*; this
proposal makes it buy *the resource itself*. In doing so it removes the reward
attribution machinery specified in CIP-0104, the per-transaction reward cap of
CIP-0098, and the Foundation good-standing gate that CIP-0116 still depends on.

## Motivation

### The present model prices capacity as a difference of two policy variables

An application's net cost to transact is the traffic it burns minus the app
rewards it earns. Both terms are set by governance: the burn by the $/MB
parameter under CIP-0084, the reward by the minting schedule and the CIP-0098
cap. The quantity that actually matters to a builder, the net price of
throughput, is therefore the *difference between two administered numbers*,
and is not directly set by anyone.

This is a badly conditioned control problem. Small errors in either term
produce large proportional swings in net price, and the sign of the net price
can invert. CIP-0098 documents precisely this inversion having occurred:

> Uncapped App Rewards create outsized returns under low load ... Apps may
> optimize for reward farming rather than sustainable usage ... rewards can
> exceed fees considerably.

The remedy adopted was a hard-coded $1.50 per-transaction ceiling. That is a
patch on a structural property, not a correction of it. CIP-0096 (removal of
liveness rewards) is a second patch of the same kind. Each is sound in
isolation; together they indicate that the reward-offset construction requires
continuous administered correction to stay in a sane regime.

### Governance overhead has been reduced but not removed

CIP-0104 removed the need for applications to author `FeaturedAppActivityMarker`
contracts and made reward weight objective. It did not remove Featured App
designation itself. CIP-0116 added an objective capital gate to that
designation, but retained "good standing with the Foundation" as a condition,
retained the on-chain vote, retained Foundation-ordered application review, and
requires SV operators to run a rapid-response unfeaturing process with a
30-minute response obligation. CIP-0116 explicitly defers the remainder:
"Automating this process will be presented in a future CIP."

Separately, CIP-0084 places a standing human body, the Tokenomics Committee,
in the loop on the $/MB parameter, reviewing on- and off-chain data
periodically and recommending adjustments to Super Validators.

The 2026-2028 Foundation roadmap states the target directly: tokenomics
"should be designed such that offchain governance decisions are limited, both
in time and scope." Two recurring human decision processes remain in the
critical path of network access: who is featured, and what capacity costs.

### Capacity is scarce and rationed by committee

CIP-0084's own motivation records a waiting list for validators, retail
onboarding "by the tens of thousands," and multiple assets arriving in
sequence, with price tuning offered as the instrument to "manage increasing
demand in a controlled and orderly manner" while scaling investments land.
That is administrative rationing of a scarce resource. A capacity right is the
market instrument that performs the same function without a committee.

## Specification

### 1. Issuable capacity

For a synchronizer `S` and a term `T`, let `C_floor(S, T)` be the conservative
lower bound of traffic capacity, in bytes per epoch, that the synchronizer
undertakes to deliver in every epoch until `T`. `C_floor` is a forecast against
provisioned infrastructure, not an expectation: it is the floor, not the mean.

The quantity of capacity offered as term commitments is bounded below that
floor by a reserved headroom fraction `h`:

```
issuable(S, T) = C_floor(S, T) x (1 - h)
```

The headroom `h` is a governed parameter. It is the only quantity in this
proposal set by governance rather than by market or by measurement.

**1.1 Two tiers follow necessarily.** Because term commitments are capped
strictly below deliverable capacity, capacity always exists that is not
committed: the headroom, plus whatever margin `C_max` runs above `C_floor` in
practice. That residual is available on an uncommitted, best-effort basis and
priced at spot. The design therefore has a committed tier and a spot tier, in
the manner of reserved and on-demand capacity in every other market for a
provisioned physical resource.

**1.2 Committed capacity is senior to spot.** If delivered capacity falls
below the sum of outstanding commitments plus spot demand, spot is curtailed
first and in full before any commitment is impaired. Sizing `h` such that
commitments remain deliverable under foreseeable degradation is the substance
of the headroom parameter.

### 2. Issuance by auction

Term capacity is issued periodically by auction. At each auction, for each
maturity on the ladder of section 4.3, the protocol offers `issuable(S, T)`
bytes per epoch. Participants bid Canton Coin to be locked.

The auction clears to a rate:

```
r(S, T) = bytes per epoch, per locked CC, for term T
```

Price formation is therefore entirely a market outcome. Governance sets neither
the rate nor the price of capacity; it sets only `h`, the maturity ladder, and
the methodology by which `C_floor` is forecast. The quantity offered is an
engineering fact about provisioned infrastructure, and the price of that
quantity is discovered.

### 3. Entitlement

A party `p` locking `L` Canton Coin at an auction clearing at rate `r(S, T)`
receives an entitlement fixed for the whole term:

```
entitlement(p, S) = L x r(S, T)      bytes per epoch, every epoch until T
```

Three properties follow, and they are the substance of this proposal:

**3.1 The entitlement is absolute and fixed at issuance.** It is a quantity of
bytes per epoch, not a share of a contested pool. It does not move with the
subsequent locking decisions of other parties, and it does not move with
subsequent changes in `C_max`. A participant can state its throughput for the
term, in bytes, on the day it acquires it, and budget against that figure.

**3.2 Capacity expansion creates issuable capacity rather than diluting it.**
Raising `C_floor` raises `issuable`, which is offered at the next auction and
must be bought with newly locked Canton Coin. Expansion therefore increases
demand for locking. Under a share-denominated alternative the same expansion
would have distributed additional bytes to existing holders at no cost, which
inverts the incentive to fund expansion.

**3.3 Entitlement is enforced, not rationed.** A submission that would take a
party beyond its epoch entitlement is rejected at admission. There is no
slashing, no adjudication, and no dispute process: a party cannot exceed what
it holds, so there is nothing to punish. Every behaviour that CIP-0098's
reward cap and CIP-0116's unfeaturing process exist to deter is either
impossible or self-financed under this construction.

### 4. Utility and capital separation

Locking CC at an auction for term `T` mints two instruments against the locked
holding:

```
TU(p, T)   utility strip  - the entitlement of section 3, in absolute bytes
                            per epoch, in every epoch until maturity T
TC(p, T)   capital strip  - a claim redeeming to unlocked CC at maturity T

TU(p, T) + TC(p, T) == the locked holding
```

Both instruments are transferable. At maturity TU expires and confers nothing
further; TC becomes redeemable for the underlying CC, subject to the unlock
schedule of section 5.

**4.1 Entitlement follows TU, not the lock.** The holder of TU at the epoch
snapshot receives the entitlement. The holder of TC has no capacity claim
during the term and the full capital claim at its end.

**4.2 TU is a rate, not a bucket.** TU confers its entitlement in *each* epoch
until maturity. It does not confer a redeemable aggregate that may be consumed
at will, which would permit a term's capacity to be discharged in a single
epoch and defeat the purpose of provisioning against `C_floor`. Carry-forward
of unused epoch entitlement is not permitted.

**4.3 Maturities are laddered.** TU is issued against a schedule of staggered
maturity dates rather than a single common date, so that rollover demand and
auction supply are distributed across the calendar rather than concentrated at
one. The schedule is a governed parameter.

**4.4 No counterparty credit risk.** TU is collateralised by CC locked in the
protocol, not by an obligation of the party that minted it. A TU holder's
entitlement does not depend on the continued solvency, cooperation, or
existence of that party.

**4.5 Purpose.** The separation addresses two populations that presently exist
and are conflated. A participant requiring throughput must today hold a
volatile asset to obtain it, and so takes an economic exposure incidental to
its actual requirement. A participant wishing to hold the asset must operate
capacity it does not use. Under separation the first buys TU and takes no
price exposure; the second retains TC and sells capacity it was never going to
consume. Aggregate utilisation rises without either party taking a position it
did not want.

### 5. Epoch snapshots and unlock

Entitlement is determined from a snapshot of TU holdings at each epoch
boundary and is fixed for that epoch. Transfers within an epoch affect the
next epoch's entitlement, never the current one. This prevents intra-epoch
acquisition of capacity for a single burst and bounds entitlement
recomputation to once per epoch per synchronizer.

Lock and unlock mechanics follow the pattern established by CIP-0105 and
CIP-0116: funds held in a segregated, identifiable PartyId with a graduated
unlock. This CIP adopts CIP-0116's 60-day, 1/60-per-day schedule, applied at
TC redemption, so that CC already locked under CIP-0116 satisfies this CIP
without being moved.

### 6. Provisioning feedback

Three quantities are published per synchronizer and together form the control
input for capacity provisioning:

1. The **TU forward curve**: auction clearing rates across the maturity
   ladder, expressed in CC per byte per epoch.
2. The **spot price** of uncommitted residual capacity.
3. The **commitment ratio**: outstanding commitments as a fraction of
   `C_floor`.

Sustained forward rates above the upper bound of a target band indicate
expected scarcity at that horizon and signal expansion of `C_floor`
(additional sequencer and mediator capacity, or an additional synchronizer
under CIP-0117). Rates below the lower band indicate expected slack.
Adjustment is bounded per period and subject to a dead band.

**6.1 Model-implied term structure.** The maturity ladder of section 4.3 is
itself a distribution of commitment across time: let `S_t` be the fraction of
supply committed at maturity `t`, with `sum(S_t) = S`. Its first two moments,
and their ratio, are observable without estimation:

```
D = sum(S_t x t)      C = sum(S_t x t^2)      kappa = D / C
```

A model-implied rate at each maturity follows from the same `S(1-S)` primitive
that governs issuance in section 7:

```
Z(t) = gamma(t) x S(1-S) x (1 + tanh(S t)) / 2
gamma(t) = 1 / (1 + (kappa/2) t)^2
```

`gamma` is a convexity correction on the commitment distribution, penalising
long maturities in proportion to how front-weighted commitment is; the `tanh`
term maps the risk factor forward, rising from one half at `t = 0` toward one,
with `S` setting the steepness. Nothing in `Z` is exogenous; it is a function
of the commitment distribution alone.

The control signal is then the **deviation of observed auction rates from
`Z(t)`**, rather than the observed level. This matters because the observed
curve moves for two distinct reasons. If commitment crowds into short
maturities, `kappa` rises, `gamma` falls at long `t`, and the curve steepens
without any change in scarcity; `Z` steepens with it and the deviation stays
flat. A steepening that departs from `Z` is information about capacity. One
that tracks `Z` is information about the maturity mix, and should not move a
provisioning decision.

Both this curve and the issuance rule of section 7 are driven by the single
observable `S` and its distribution across maturities. No second measurement
is introduced.

This derivation is adapted from a yield surface constructed for a different
instrument and has not been validated against capacity auction data, which does
not yet exist. It is proposed here as a diagnostic against which observed rates
are scored, not as a binding rule, and should not be made load-bearing until
the reference implementation has produced enough auction history to test it.

**6.2** A forward curve is materially better suited to this problem than a spot
price alone. Capacity cannot be provisioned instantaneously; hardware, operator
onboarding and synchronizer deployment all carry lead times. A spot signal is
necessarily reactive and reports only scarcity that has already arrived. The
forward curve reports the market's expectation of scarcity at each horizon,
which is the quantity a provisioning decision requires. The spot tier of
section 1.1 supplies the contemporaneous reading against which the curve's
prior expectations can be scored.

### 7. Issuance

The reward machinery deprecated by this CIP is also, at present, the mechanism
by which Canton Coin enters circulation. Removing it requires an issuance rule
to replace it. This CIP proposes that issuance cease to be a calendar schedule
and become a function of the same commitment ratio that drives capacity.

Let `P` be circulating supply as a fraction of the supply cap, and let `S` be
the fraction of circulating supply locked in capacity commitments. Per period:

```
U(S)      = 4 x S x (1 - S)                    commitment response
delta     = k x P x (1 - P) x U(S)             index advance
issuance  = SUPPLY_CAP x delta
P         = P + delta
```

`k` is a base rate parameter requiring calibration; `U` is normalised so that
`U(0.5) = 1`.

**7.1 Issuance is demand-driven, not time-driven.** The index `P` advances by
`delta`, which is itself throttled by `U(S)`. A period in which little capacity
is committed therefore does not merely emit less; it advances the network less
far along its own issuance curve. The supply cap is approached at a rate set by
actual commitment, not by the calendar. This is the substantive difference from
a round-based schedule with scheduled halvings, which emits on a fixed timetable
regardless of whether the network is being used, and which creates
front-runnable discontinuities at each halving.

**7.2 Issuance vanishes at both extremes.** `U(0) = U(1) = 0`. If nothing is
committed to capacity, new supply would be purely dilutive and none is created.
If everything is committed, the scarce resource is bytes rather than coins, and
minting more coins cannot relieve it. Emission is maximal at `S = 0.5`, the
regime in which new supply can be absorbed by either side. `S(1 - S)` is the
Bernoulli variance of the liquid/committed split; issuance is proportional to
the system's uncertainty about that split.

**7.3 The equilibrium is a pull, not a target.** No parameter states a desired
commitment ratio and no process steers toward one. The curve is symmetric about
`S = 0.5` and the incentive to commit falls away on either side of it. There is
nothing to govern.

**7.4 Destination.** Issuance under this rule funds validator operation; see
*Backwards compatibility*. Because `delta` is throttled by `U(S)`, validators
are funded in proportion to the network being committed to productive use,
without any per-transaction attribution being computed.

**7.5 Prior art and calibration.** This is the emission model deployed in
production as the DeltaForce curve in the Meta token contract, where `P` is a
self-advancing index and `U(S)` throttles both emission and index advance
(`Meta.sol::_processDays`). That deployment carries Halmos proofs, Certora
specifications, and Echidna fuzzing, and provides a reference implementation of
the arithmetic including its fixed-point handling and catch-up behaviour.

Calibration does not carry over, and the calibration problem is materially
worse than a change of units. It is set out in the appendix. In summary: the
value of `k` that preserves today's issuance depends on today's commitment
ratio, which is currently near zero, and a `k` fitted at a low `S` produces
catastrophic issuance growth as `S` rises toward the equilibrium the curve is
designed to pull toward. This CIP therefore proposes terminal calibration with
a ratchet, per appendix A.3.

### 8. What this deprecates

| Mechanism | Status under this CIP |
|---|---|
| CIP-0104 activity records, reward roots, `RewardCouponV2` | No longer required for app rewards; the computation exists to determine who deserves minted CC, and nothing is minted for use |
| CIP-0098 $1.50 per-transaction reward cap | Moot; no per-transaction reward exists to cap |
| CIP-0116 Foundation good-standing gate and FA vote | Moot for capacity purposes; committed capital confers the resource directly. FA designation may persist for non-capacity purposes if the Foundation wishes |
| CIP-0116 30-minute rapid-response unfeaturing | Moot; entitlement expires with TU at maturity and cannot be exceeded before it |
| CIP-0084 periodic $/MB recommendation | Replaced by auction price formation in section 2 and the bounded controller in section 6 |
| Round-based minting schedule and scheduled halvings | Replaced by the commitment-responsive curve of section 7 |

Validator rewards under CIP-0120 are **not** addressed by this CIP; see
*Backwards compatibility*.

## Rationale

### Why entitlement is absolute rather than proportional

Proportional-stake bandwidth systems (EOS being the best-documented) set
entitlement as `your_stake / total_staked`. That denominator floats on other
participants' decisions, so an entitlement silently decays as others stake. No
participant can forecast its own future capacity without forecasting everyone
else's locking behaviour. For institutional users this is disqualifying.

Fixing the denominator at a constant, such as the supply cap, removes that
particular defect: a share of a fixed denominator is stable against others'
behaviour. It does not remove the second one. A share of `C_max` still moves
with `C_max`, so the absolute throughput a participant commands is only as
stable as the network's capacity, and remains unknowable in advance.

Absolute denomination removes both. The cost is that the protocol, rather than
the purchaser, carries the risk that delivered capacity falls short, which is
why issuance is bounded below a conservative floor (section 1) and committed
capacity is made senior to spot (section 1.2).

The compensating advantage is an incentive one, and it is decisive. Under
share denomination, expanding capacity distributes additional bytes to
existing holders at no cost, so expansion dilutes the value of each unit of
capacity already held and nobody is paid for funding it. Under absolute
denomination, expansion creates new issuable capacity that must be bought with
newly locked Canton Coin. Expansion raises demand for locking. The economics
point the same way as the engineering.

EOS's secondary lesson is also instructive: a secondary market for capacity
(REX) emerged regardless of whether one was specified. Here the secondary
market is the intended structure rather than an unplanned consequence.

### Why the controller acts on the stock

EIP-1559-style fee controllers act on the flow and respond to per-block
demand, which is why base fee oscillates. A controller acting on capacity
rights inherits damping from two sources already present in the design: the
epoch snapshot, which quantises adjustment, and the unlock period, which makes
the stock sticky. The controlled variable therefore integrates over the
unbonding horizon rather than differentiating over blocks.

### Why separation rather than a rental market

An earlier form of this proposal recovered idle capacity through epoch-scoped
leasing of unused entitlement. Separation is preferred on four grounds.

1. **Fungibility.** Leases are bilateral and epoch-scoped, and fragment
   liquidity across counterparties and periods. TU of a given maturity is
   homogeneous and trades in a single market.
2. **Term structure.** A rental market reveals a spot price. A strip market
   reveals a curve, which is the input the provisioning problem needs.
3. **Less protocol machinery.** Leasing requires per-epoch matching or
   clearing inside the protocol. Separation requires only minting at lock and
   redemption at maturity; all trading is ordinary token transfer conducted
   off to the side. This is a reduction in protocol surface, consistent with
   the objective of the proposal as a whole.
4. **No credit risk.** See section 4.4.

The discount at which TC trades to spot CC is additionally informative: it is
the market's implied cost of capital for locked CC over the term, observable
without survey or estimation.

### Why issuance responds to commitment rather than to time

A fixed emission schedule is a forecast of demand made once, in advance, by
whoever set it. Where the forecast is wrong the error is absorbed as price
volatility, and correcting it requires a governance action of exactly the kind
this proposal exists to reduce. A commitment-responsive curve makes no forecast:
it emits where new supply can be absorbed and stops where it cannot, and it
approaches the cap at whatever rate the network is actually used.

Scheduled halvings have a further defect independent of forecast error. They
are known discontinuities on a public calendar, and are therefore positioned
around in advance. A smooth curve has no such dates.

The choice of `S(1 - S)` rather than a linear interpolation toward a governed
target ratio, as used in several proof-of-stake networks, is deliberate. A
target ratio is a governed parameter and invites periodic revision. A symmetric
curve has an equilibrium without anyone having declared one.

### Alternatives considered

**Retain reward-offset and continue to patch.** The status quo, extended.
CIP-0096 and CIP-0098 are the two patches applied so far, and CIP-0120 extends
the reward construction to validators. This is viable and incremental, but each
patch adds an administered constant, and the net price of capacity remains a
difference of governed quantities rather than a quantity anyone sets.

**Pure fee market with no entitlement.** Charge for traffic at a
demand-responsive price and abolish rewards entirely. Simpler than this
proposal, and it prices capacity directly. It provides no forward guarantee: an
institution cannot secure capacity ahead of demand, only bid for it on the day.
Given the validator waiting list recorded in CIP-0084, forward certainty is a
substantial part of what participants are seeking.

**Locking for eligibility only.** CIP-0116 as adopted. Retains committee
review, the FA vote, and a rapid-response unfeaturing obligation on SV
operators, and does not connect committed capital to the resource that capital
is committed in order to obtain.

## Backwards compatibility

This proposal changes what Canton Coin *is* for holders who acquired it under a
reward-earning regime, and that has distributional consequences that must be
measured before adoption rather than asserted:

- **Large passive holders gain** a leasable capacity right they did not
  previously have.
- **Active applications with small holdings must acquire or lease** capacity
  they previously financed out of reward income.
- **CC already locked under CIP-0105 and CIP-0116 carries over** without
  being moved, provided the unlock schedule in section 2 is adopted unchanged.

A transition analysis quantifying the transfer across each cohort, over the
unlock horizon, is a prerequisite for this CIP advancing beyond Draft. It is
the principal open item.

**Reconciliation with CIP-0116 locks.** CC already locked for Featured App
eligibility is a candidate to be treated as the lock event that mints TU and
TC, so that existing locked positions convert without being moved. CIP-0116
locks are indefinite subject to a 60-day unlock, whereas TU/TC has a hard
maturity; the reconciliation proposed is that TC redemption at maturity
initiates, rather than bypasses, the 60-day unlock.

**Capacity shortfall.** Absolute denomination places the risk of a capacity
shortfall on the protocol rather than on the purchaser. Three provisions bound
it: issuance is capped below a conservative floor rather than an expectation
(section 1); the reserved headroom `h` is sized against foreseeable
degradation; and spot capacity is curtailed in full before any commitment is
impaired (section 1.2). Residual risk remains if delivered capacity falls
below outstanding commitments alone, at which point commitments are impaired
pro rata. Sizing `h` such that this does not occur is the central operational
parameter of the design, and calibrating it against observed synchronizer
availability is a prerequisite for adoption. It is the third open item.

**Characterisation of the separated instruments.** TU is a prepaid claim on a
service and TC is a claim redeeming to an asset at a fixed future date. The
separated instruments do not necessarily carry the same legal or regulatory
characterisation as the unseparated holding, and the answer is likely to vary
by jurisdiction. Given that Super Validators include regulated financial
institutions, this should be assessed by counsel in the relevant jurisdictions
before adoption. The authors express no view on it and note it as a gating
dependency rather than a technical open item.

**Capacity withholding.** A term instrument makes it possible in principle to
acquire TU in order to deny capacity to a competitor rather than to consume it.
This CIP proposes no mechanism against it. Withholding requires outbidding the
intended victim at auction and financing the locked capital for the term, so
the cost is borne entirely by the party attempting it and scales with the
capacity withheld; a market in which participants may pay to secure capacity
they do not immediately consume is functioning as intended, and the remedies
available (issuance caps, per-party limits, use-it-or-lose-it clawbacks) each
reintroduce an administered judgement about legitimate use, which is the
overhead this proposal exists to remove. The cost curve of withholding at
various network sizes is nonetheless reported by the reference simulator, so
that the claim of self-limitation is measured rather than asserted.

**Validator economics.** Under this proposal validators no longer receive
app-reward income. Section 7 proposes that they be funded from issuance
instead, which has two properties worth stating against the alternative in
CIP-0120. First, no per-transaction attribution is computed: validators are
paid from a curve, not from a measured share of traffic, so none of the
mediator inspection, activity-record, or reward-consensus machinery is required
to pay them. Second, the funding is throttled by `U(S)`, so validators are paid
in proportion to the network being committed to productive use rather than in
proportion to traffic volume, which is the quantity an adversary can inflate.

CIP-0120 proposes instead to extend traffic-based rewards to validators and is
currently at Proposed status. The two approaches are mutually exclusive and
this CIP does not assume its own adoption. What is claimed here is narrower:
that a commitment-responsive issuance stream is a viable funding mechanism for
validator operation that requires no attribution infrastructure, and that it
should be evaluated against CIP-0120 on measured grounds before either is
settled. The split of issuance between validators, Super Validators and
treasury is not specified by this CIP and remains the second open item.

**Multi-synchronizer semantics.** Section 1 defines entitlement per
synchronizer, so a holding commands the same share of each synchronizer's
capacity. Under CIP-0117 logical synchronizers, adding a synchronizer is then
pure capacity expansion accruing to holders pro rata. The alternative,
entitlement against aggregate capacity across synchronizers, would require a
cross-synchronizer accounting mechanism that does not presently exist. The
per-synchronizer reading is proposed; the aggregate reading is noted as the
principal design alternative.

## Reference implementation

The mechanism is implementable without protocol changes, as a Traffic
Enforcement App (TEA) behind the gRPC boundary specified by the in-flight
user-paid traffic accounting work. The TEA's account-balance check becomes an
entitlement check: does this party's epoch-`e` snapshot entitle it to the
traffic this submission requires. This allows the model to be evaluated
against production traffic traces alongside the existing mechanism rather than
in place of it.

Planned reference deliverables:

1. A TEA implementing sections 1-3 against the published gRPC specification.
2. An open-source simulator running both the reward-offset model and this
   model over identical traffic traces, reporting: net cost of capacity per
   party, distributional concentration, reward-farming break-even under the
   incumbent model, aggregate utilisation under both, capacity withholding
   cost, and **offchain governance decisions required per epoch**.
3. The transition analysis required by *Backwards compatibility*. A first
   version accompanies this CIP as `sim.py`, which runs both models over
   identical traffic traces and produces the figures in appendix B.
4. A calibration of `k` in section 7 against the current `P`, with the
   resulting issuance path compared to the schedule it would replace.

A production implementation of the section 7 arithmetic exists in the Meta
token contract (`_processDays`), including fixed-point handling and bounded
catch-up for unprocessed periods, and is available as a reference for the
numerical behaviour of the curve independent of this CIP's adoption.

## Appendix B: Validator income across the transition

The day-one issuance reduction in appendix A.3 is not the reduction validators
experience, because validators do not receive all issuance today. Under the
present tranche split for the 1.5–5 year band they receive 18% of emission net
of the 5% development fund, or 1.71e9/yr of the 10e9/yr ceiling.

Under section 7.4 issuance funds validator operation. Taking the limiting case
in which validators receive all of it:

| `S` | issuance/yr | vs validator income today |
|---|---|---|
| 0.020 | 0.78e9 | 0.46x |
| 0.030 | 1.16e9 | 0.68x |
| **0.045** | **1.72e9** | **1.01x** |
| 0.050 | 1.90e9 | 1.11x |
| 0.100 | 3.60e9 | 2.11x |
| 0.200 | 6.40e9 | 3.74x |
| 0.500 | 10.00e9 | 5.85x |

**Parity is reached at a commitment ratio of approximately 4.5%**, or about
1.71e9 CC committed against a circulating supply of 38e9. For scale, CIP-0116
already requires 5,000,000 CC locked per non-issuer featured party, so parity
corresponds to roughly 340 featured-app-sized locks, or a far smaller number
of asset-issuer locks at 25,000,000 each.

This is the load-bearing number in the proposal and it should be read with its
limits in mind. It assumes validators receive the whole issuance stream, which
section 7.4 does not settle; at a 60% share parity moves to roughly 8%
commitment. It also holds validator cost base constant, which is conservative
in the proposal's favour, since the attribution infrastructure, reward-consensus
participation and 30-minute unfeaturing obligation all disappear. And below
parity the shortfall is real: at a 2% commitment ratio validators would receive
under half their present income, so the transition requires either a floor
during ramp or a credible expectation that commitment reaches ~4.5% quickly.

Two further results from the same simulation are worth recording.

**The CIP-0098 reward cap bounds the farming margin without removing it.** The
cap is a fixed $1.50 per transaction while traffic cost scales with transaction
size, so expected value per transaction is positive wherever a transaction
costs less than $1.50 of traffic. CIP-0098 states this explicitly, targeting
"at most, a 50% positive expected value relative to the fees it generates when
the network is below Validator and Application equilibrium." The arbitrage is
bounded by design rather than eliminated, and the bound is a governed constant
requiring periodic revision as the CC price moves. Under capacity rights no
reward exists, so the margin is structurally zero and no constant governs it.

**Concentration of received value falls.** In the simulated population the Gini
coefficient of app rewards under the incumbent model is 0.76 against 0.49 for
capacity entitlement. The mechanism differs more than the number: entitlement
tracks committed holdings, which an adversary must buy, whereas rewards track
traffic, which an adversary can manufacture.

## Appendix A: Calibration of `k`

### A.1 The schedule being replaced

The issuance curve presently in force is a piecewise function of time since
bootstrap, defined by `Schedule RelTime IssuanceConfig` and sampled by
`issuingFor`. Its values are:

| Years since bootstrap | `amuletToIssuePerYear` | Validator | App | SV (implicit) |
|---|---|---|---|---|
| 0 – 0.5 | 40e9 | 5% | 15% | 80% |
| 0.5 – 1.5 | 20e9 | 12% | 40% | 48% |
| 1.5 – 5 | 10e9 | 18% | 62% | 20% |
| 5 – 10 | 5e9 | 21% | 69% | 10% |
| 10+ | 2.5e9 | 20% | 75% | 5% |

Integrating the first four bands gives a ten-year cumulative ceiling of exactly
100e9, which is the origin of the commonly cited cap. Note that the schedule is
indexed on elapsed time alone: it advances whether or not the network is used.

### A.2 The calibration trap

Taking circulating supply at approximately 38e9, `P = 0.38` and
`P(1-P) = 0.2356`, which is 94% of that term's maximum. The network is
therefore near the peak of the supply-progress term already.

Solving `k` for continuity with the current 10e9/yr rate gives a value that
depends entirely on the commitment ratio at switchover:

| `S` at switchover | `U(S)` | required `k` | issuance if `S` reaches 0.5 |
|---|---|---|---|
| 0.01 | 0.0396 | 10.72 | 252.5e9/yr |
| 0.02 | 0.0784 | 5.41 | 127.6e9/yr |
| 0.05 | 0.1900 | 2.23 | 52.6e9/yr |
| 0.10 | 0.3600 | 1.18 | 27.8e9/yr |
| 0.25 | 0.7500 | 0.57 | 13.3e9/yr |
| 0.50 | 1.0000 | 0.42 | 10.0e9/yr |

Only CIP-0105 and CIP-0116 locks exist today, so `S` at switchover is on the
order of 0.02. Calibrating for continuity there fixes `k = 5.41`, and issuance
then rises by a factor of `U(0.5)/U(0.02) = 12.8` as commitment grows toward
the equilibrium the curve exists to encourage, reaching 127.6e9/yr, which
exceeds the entire remaining supply below the cap. **A curve calibrated for
continuity at a low commitment ratio is not merely mis-scaled; it is unsound.**

Calibrating instead at the terminal ratio `S = 0.5` gives `k = 0.4244` and
bounds issuance at 10e9/yr, but cuts day-one issuance to 7.8% of the current
rate (0.78e9/yr), which is a severe reduction for whatever the issuance is
funding.

### A.3 Proposed resolution: terminal calibration with a ratchet

Fit `k` at the terminal ratio, and cap issuance at the legacy schedule:

```
k         = 0.4244
issuance  = min( CAP x k x P(1-P) x U(S),  legacy_rate(t) )
```

| `S` | curve | legacy | issued | vs legacy |
|---|---|---|---|---|
| 0.02 | 0.78e9 | 10.0e9 | 0.78e9 | 8% |
| 0.10 | 3.60e9 | 10.0e9 | 3.60e9 | 36% |
| 0.25 | 7.50e9 | 10.0e9 | 7.50e9 | 75% |
| 0.40 | 9.60e9 | 10.0e9 | 9.60e9 | 96% |
| 0.50 | 10.00e9 | 10.0e9 | 10.00e9 | 100% |

Under this rule the curve can only ever reduce issuance relative to the
existing schedule and never raise it, which makes adoption strictly
non-inflationary against the status quo and removes the need to argue the
calibration is exactly right. The ratchet retires itself once the legacy
schedule steps below the curve.

The residual question is the day-one reduction. It is answered in appendix B,
and the answer is more favourable than the headline figure suggests: validators
receive only 18% of issuance under the present tranche split, so a smaller
total issuance directed principally at validators reaches parity at a
commitment ratio of roughly 4.5%.

### A.4 Reproduction

The figures above are produced by `calibrate.py`, accompanying this CIP, which
reads the schedule from the values in `Splice.Testing.Registries.AmuletRegistry.Parameters`.
Elapsed time since bootstrap is taken as 2.15 years; the current band spans
1.5–5 years, so the 10e9/yr figure is insensitive to that estimate.

## Copyright

This CIP is licensed under CC0-1.0:
[Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)

## Changelog

* 2026-08-27: Initial draft.
* 2026-08-27: Replaced the epoch lease market with TU/TC utility-capital
  separation. Provisioning control input changed from spot lease price to the
  TU forward curve.
* 2026-08-28: Added appendix B, reporting validator income across the
  transition from a comparative simulation of both models. Parity at a
  commitment ratio of ~4.5%. Corrected the reading of the day-one issuance
  reduction in A.3, which overstated the effect on validators.
* 2026-08-28: Added section 6.1, a model-implied term structure for the
  maturity ladder derived from the same `S(1-S)` primitive as issuance, with
  the control signal taken as deviation from it rather than level. Added
  appendix A calibrating `k` against the actual Splice issuance schedule, which
  found continuity calibration at the current commitment ratio to be unsound,
  and proposed terminal calibration with a ratchet.
* 2026-08-28: Added section 7, replacing the round-based minting schedule with
  a commitment-responsive issuance curve, and proposing issuance as the funding
  mechanism for validator operation in place of the traffic-attributed rewards
  of CIP-0120. Flagged `k` calibration at the current `P` as the principal risk.
* 2026-08-27: Entitlement changed from a share of capacity to absolute bytes
  per epoch fixed at issuance. Introduced auction issuance, the conservative
  floor and headroom parameter, and the committed/spot tiering with commitment
  seniority. Carry-forward set to none and maturity laddering retained.
  Withholding resolved as a market outcome with no mechanism, measured but not
  constrained.
