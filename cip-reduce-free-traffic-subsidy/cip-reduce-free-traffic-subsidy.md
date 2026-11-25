<pre>
  CIP: ?
  Title: Reduce the Free Traffic Subsidy
  Author: Simon Meier
  Discussions-To: TODO
  Status: Draft
  Type: Tokenomics
  Created: 2026-11-10
  License: CC0-1.0
</pre>

# Reduce the Free Traffic Subsidy

## Abstract

At the time of writing, every validator receives free base-rate traffic:
a 200 KB burst that refills every 20 minutes.
At a traffic price of 60 $/MB, this is a subsidy of up to 14.4 MB, or $864, per day per validator;
i.e., up to $0.7M per day across a network of 800 active validators.
This subsidy is a problem because it represents lost burn for the network and
allows earning app rewards without incurring any traffic costs.

The original purposes of this subsidy were to provide traffic for validator onboarding and basic operations, and
to cover the cost of protocol-mandated traffic (ACS commitments, confirmation responses, and time proofs).
This CIP proposes to reduce the free traffic subsidy by a factor of about 2,500 to a free allowance of about $10 per month per validator,
and to serve these purposes through alternative mechanisms:

1. On MainNet, validator onboarding traffic can already be [purchased using token standard wallets](https://docs.canton.network/global-synchronizer/deployment/synchronizer-traffic#buying-traffic-with-a-token-standard-transfer).
2. Protocol-mandated traffic is made free, but rate-limited to prevent abuse.
3. The free allowance pays for a validator's [background traffic](#sizing-the-free-allowance), i.e., the traffic it needs to stay operational and to upgrade Splice.
4. On TestNet and DevNet, a traffic faucet run by the foundation provides free traffic for validator onboarding and basic operations.

## Motivation

Free traffic harms tokenomics in three ways:

- **Farming incentive.**
  Transactions on free traffic cost the submitter nothing, but can still earn app rewards.
  Any such transaction whose only purpose is to earn rewards converts the subsidy into minted CC.
  This dilutes the rewards of apps with real utility,
  contrary to the goal of app rewards: to incentivize useful activity.
  Reducing free traffic to what a validator's background traffic needs bounds this incentive to about $10 per month per validator,
  without having to tell farming apart from real usage.
- **Unpriced resource usage.**
  Free traffic consumes sequencer capacity but burns no CC:
  up to $0.7M per day at full usage at a price of 60 $/MB.
  This is far more than basic operations need:
  each validator's allowance of 14.4 MB per day is about 180 times the 80 KB per day that its hourly status reports consume
  (see [Traffic Costs of Validator Operations](#traffic-costs-of-validator-operations)).
- **Sybil incentive.**
  Every validator gets the same allowance,
  so running additional validators just to collect it pays off.

Meanwhile, its original purposes are better served by other mechanisms:
bootstrapping new validators is [already solved on MainNet](#bootstrapping-problem-solved-on-mainnet),
protocol-mandated traffic can be made [free and rate-limited](#canton-protocol-changes),
and background traffic can be paid for by a [much smaller free allowance](#free-allowance-for-background-traffic).

## Specification

### Canton Protocol Changes

Make all protocol-mandated traffic free, but rate-limited to prevent abuse.
Confirmation responses have already been made free and rate-limited
in [CIP-0104](../cip-0104/cip-0104.md#free-protocol-conformant-confirmation-responses).
We propose to use the same approach for ACS commitments and time proofs; i.e., make them free and rate-limited.

The SV operators set the rate limits via the synchronizer parameters.
They choose them such that validators do not hit them during normal operation;
only abusive validators do.

For example, the rate limit for ACS commitments can be set such that each validator can send one ACS commitment to every other validator per interval, which covers normal operation of even the most well-connected validators.
Likewise we expect the rate limit for time proofs to be calibrated to current network conditions so that normal operation is not hindered while preventing abuse.

### Free Allowance for Background Traffic

Reduce the free base-rate traffic from a 200 KB burst every 20 minutes to a 40 KB burst every 7 days
(see the [Rollout Plan](#rollout-plan) for the exact parameters).
This amounts to a free allowance of about 174 KB, or $10.40, per validator per month,
which is meant to pay for the validator's background traffic
(see [Sizing the Free Allowance](#sizing-the-free-allowance)).

### Traffic Faucets for Test Networks

TestNet and DevNet are intentionally designed such that TestNet and DevNet CC have no value.
To keep that property the existing free traffic subsidy on TestNet and DevNet is maintained,
but implemented differently: the foundation's SV app runs a traffic faucet that
monitors the traffic balance of all synchronizer members and purchases traffic on their behalf if their balance drops
below a configured threshold.

On DevNet, these purchases are funded via the DevNet CC faucet.
On TestNet, these purchases are funded via TestNet CC contributed by the foundation, typically from its own SV rewards,
complemented by SV rewards from other SVs or the foundation's existing holdings if required.
To limit spending, the faucet tops up each member at most once per `topupDelay`,
and spends at most `dailyLimit` CC per 24 hours across all members.

#### Technical Details

The traffic faucet is implemented as part of the SV app.
It is off by default.
It is configured via the `trafficFaucet` section in the SV app config.

The default configuration matches the current free traffic subsidy of 200 KB every 20 minutes,
with a daily limit of 90% of the foundation's TestNet SV rewards
(see [Financing the TestNet Faucet](#financing-the-testnet-faucet)):

```hocon
# default configuration for the traffic faucet
trafficFaucet {
  triggerBelow = 100 KB
  topupAmount = 200 KB  # equal to `minTopupAmount` in `AmuletConfig`
  topupDelay = 20 min
  dailyLimit = 358000 # in CC, about 90% of the foundation's TestNet SV rewards of about 398,500 CC per day
}
```

When enabled, the traffic faucet runs continuously as part of the SV app automation.
It tracks when the last purchase was made for each member to avoid purchasing traffic more often than once per `topupDelay`.
It also stops purchasing once it has spent `dailyLimit` CC within the last 24 hours.

The `helm` deployment for SV nodes is adjusted such that the traffic faucet can be enabled in the SV app.
The foundation uses that deployment to run the traffic faucet on its SV node.

### Daily Validator Status Reports

At the time of writing,
validator nodes send status reports on an hourly basis using the
`ValidatorLicense_ReportActive` choice on their validator license.
They serve to inform the network about the availability and the version of the validator nodes.

Each status report costs about 3.3 KB of traffic, or $0.20.
Sent hourly, they cost each validator about $4.80 per day, which is about 14 times the free allowance.

They only update the `lastActiveAt` field of the validator license, for which daily granularity is sufficient.
We therefore propose to change their frequency from hourly to daily.

### Rollout Plan

The Canton Protocol changes to make protocol-mandated traffic free are part of PV38.
We therefore wait for PV38 to be active before reducing the free traffic subsidy.

For all networks:
once the logical synchronizer upgrade (LSU) to PV38 has been completed,
use the "*Set Amulet Rules Configuration*" vote proposal form to set:

- `decentralizedSynchronizer.fees.baseRateTrafficLimits.burstAmount` from `200000` (200 KB) to `40000` (40 KB)
- `decentralizedSynchronizer.fees.baseRateTrafficLimits.burstWindow.microseconds` from `1200000000` (20 min) to `604800000000` (7 days)

with an effective date 7 days in the future.

For TestNet and DevNet: enable the traffic faucet on the foundation's
SV node before the effective date of the configuration change with
the default configuration [shown above](#technical-details).

## Rationale

### Traffic Costs of Validator Operations

The tables below list the traffic cost of the messages and transactions affected by this CIP.
Traffic costs are given in KB, where 1 KB = 1,000 bytes.
The $-costs are computed at the traffic price of 60 $/MB used throughout this CIP.

The costs were measured on a local Splice test network in the Splice integration tests,
using the same `readVsWriteScalingFactor` of 4 as the production networks.
The costs of Daml transactions were read from the traffic summaries reported by Scan;
the costs of Canton protocol messages and topology transactions were read from the participants' logs.
The actual costs vary with the size of the payload and the number of recipients,
so the numbers below should be read as indicative.

#### Protocol-Mandated Messages Made Free by This CIP

| Message | Traffic cost | $-cost | Frequency |
|---|---|---|---|
| ACS commitment | 0.42–0.47 KB per counter-participant | $0.03 | every 30 min per counter-participant, i.e., about $1.30 per day per counter-participant |
| Time proof | 0 KB (free in PV37 and lower) | $0.00 | on demand |

Confirmation responses are not listed, as they are already free since [CIP-0104](../cip-0104/cip-0104.md#free-protocol-conformant-confirmation-responses).

#### Background Daml Transactions Paid by Validators

The [free allowance](#free-allowance-for-background-traffic) is sized to pay for the status reports and metadata updates;
reward collection pays for itself.

| Transaction | Traffic cost | $-cost | Frequency |
|---|---|---|---|
| Status report (`ValidatorLicense_ReportActive`) | 3.3 KB | $0.20 | hourly at the time of writing ($4.80 per day), daily after this CIP ($0.20 per day) |
| Metadata update (`ValidatorLicense_UpdateMetadata`) | 3.4 KB | $0.20 | on version or contact point changes, at most hourly |
| Reward collection and amulet merging | 4.6–13.3 KB | $0.28–$0.80 | when rewards are available; cost grows with the number of collected coupons |

#### Operator-Initiated Daml Transactions Paid by Validators

| Transaction | Traffic cost | $-cost |
|---|---|---|
| Traffic purchase (`AmuletRules_BuyMemberTraffic`) via the wallet or the top-up automation | 7.2 KB | $0.43 |
| Token standard transfer to the traffic purchase party | 4.6–5.2 KB | $0.28–$0.31 |
| Onboard a wallet user (party allocation, `WalletAppInstall`, and `ValidatorRight`) | 0.47 + 3.2 + 3.1 KB | $0.40 |
| Create a transfer preapproval (`AmuletRules_CreateTransferPreapproval`) | 6.7 KB | $0.40 |
| Set up an external party with a transfer preapproval (proposal and acceptance) | 7.2 + 4.1 KB | $0.68 |
| Renew a transfer preapproval (`TransferPreapproval_Renew`) | 8.0 KB | $0.48 |

#### Topology Transactions Paid by Validators

| Transaction | Traffic cost | $-cost |
|---|---|---|
| Party allocation (`PartyToParticipant`) | 0.45–0.47 KB | $0.03 |
| External party key registration (`PartyToKeyMapping`) | 0.42–0.44 KB | $0.03 |
| Namespace delegation (`NamespaceDelegation`) | 0.40 KB | $0.02 |
| Package vetting (`VettedPackages`) | 2.4–7.3 KB, depending on the number of vetted packages | $0.14–$0.44 |

#### Typical User Transactions for Reference

| Transaction | Traffic cost | $-cost |
|---|---|---|
| Preapproved CC transfer | 5.2 KB | $0.31 |
| Two-step CC transfer: create offer | 4.6–5.2 KB | $0.28–$0.31 |
| Two-step CC transfer: accept, reject, or withdraw offer | 7.9–9.5 KB | $0.47–$0.57 |
| DvP trade: create trade | 3.2 KB | $0.19 |
| DvP trade: allocate assets (per party) | 14.8–17.3 KB | $0.89–$1.04 |
| DvP trade: settle | 22.5 KB | $1.35 |

### Bootstrapping Problem Solved on MainNet

Free traffic was introduced to solve a bootstrapping problem:
buying traffic requires CC, and using CC requires traffic.
This problem is now solved on MainNet.

Validator operators can bootstrap the traffic balance of a validator in two ways:

1. By buying traffic from another validator that they operate.
2. By using a token standard wallet to make a [token standard transfer to the traffic purchase party](https://docs.canton.network/global-synchronizer/deployment/synchronizer-traffic#buying-traffic-with-a-token-standard-transfer).

Token standard wallets are widely available,
so every operator can bootstrap their first validator this way.
The transfer costs the sending wallet's validator about 5 KB of traffic, or $0.31.
This matches the DoS protection proposed in [CIP-0128](https://github.com/canton-foundation/cips/pull/274),
which requires new validators to have sufficient traffic to connect to the network.

### Faucets for Test Networks

Test networks should be configured as close to MainNet as possible to reduce testing gaps.
We therefore set the base-rate traffic limits on test networks to the same values as on MainNet.

Validators on TestNet and DevNet likely rely on free traffic to bootstrap and maintain basic operations.
To avoid operational disruption, traffic faucets continue to provide this free traffic on test networks.

#### Financing the TestNet Faucet

At the time of writing, SVs receive 20% of the TestNet issuance of 10B CC per year,
and the foundation keeps 7.3% of that after paying its extra beneficiaries
(see the TestNet [reward weights](https://github.com/canton-foundation/configs/blob/4b85d80/configs/TestNet/approved-sv-id-values.yaml)).
The foundation thus earns about 398,500 TestNet CC, or about $29,600 at 0.074276 $/CC, per day in SV rewards.
At 60 $/MB, this pays for the following traffic:

| Traffic used per validator | Cost per day | Validators financed |
|---|---|---|
| Full allowance (14.4 MB per day) | $864 | 34 |
| One 200 KB top-up per day | $12 | about 2,500 |
| Daily status reports (3.3 KB per day) | $0.20 | about 149,000 |

The faucet only pays for the traffic that validators actually use.
Most TestNet validators use little beyond their daily status reports and occasional tests,
which the foundation's SV rewards cover with a large margin.
To guard against heavy usage, the faucet's daily limit caps its spending at 90% of the foundation's SV rewards.
If more funding is required, other SVs can transfer some of their SV rewards to the foundation,
and the foundation can also draw on its existing holdings.
The daily limit is reviewed whenever the available funding changes.

#### Financing the DevNet Faucet

DevNet CC can be tapped freely, so financing the DevNet faucet is simple:
the foundation taps enough DevNet CC to run the faucet at its daily limit for a year,
i.e., about 131M DevNet CC, and needs no further funding for that year.

### Free ACS Commitments

Validators send ACS commitments every 30 minutes without user action,
one to each counter-participant.
At about 0.45 KB each, this is 0.45 KB × 48 = 21.6 KB,
or about $1.30, per day per counter-participant.
A validator with 100 counter-participants would thus pay about $130 per day,
which is about 650 times the cost of its daily status report.

Because the protocol requires them and their cost grows with the number of counter-participants,
paying for them would penalize well-connected validators.
We therefore treat them like confirmation responses: free and rate-limited.

### Rate-Limited Time Proofs

In PV37 and lower, time proofs are free, but not rate-limited, which makes them a vector for abusing sequencer capacity.
Rate-limiting them closes this gap, while keeping them free,
as validators need them as part of the protocol.
Time proofs are expected to be replaced by sequencer-issued heartbeats in the future.

### Sizing the Free Allowance

The free allowance is sized to pay for a validator's background traffic,
i.e., the traffic it needs to stay operational and to upgrade Splice:

| Item | Cost per month |
|---|---|
| Daily status reports | $6.00 |
| Monthly Splice Daml package upgrade (1–4 package vetting changes and a metadata update) | $0.34–$1.96 |
| **Total** | **$6.34–$7.96** |

This is within the free allowance of about $10.40 per month.
The remaining about 20% of the allowance is headroom for future changes to the background traffic of validators.
Protocol-mandated messages such as ACS commitments are free.

### No Free Traffic for Other Transactions

Reward collection pays for itself, as it mints the collected rewards.
A collection costs $0.28–$0.80, so validators should only collect rewards that are worth more than that.

Other topology transactions, e.g., for party allocation or vetting application packages, are initiated by the validator node operator.
Their cost is small: about $0.03 per party allocation and $0.14–$0.44 per package vetting change.
It is part of the operational cost of running a validator node.

### No Free Traffic for Transfer Preapprovals

[CIP-0119](../cip-0119/cip-0119.md) allows creating and renewing preapprovals
using only traffic, including free traffic.
After this CIP, this requires purchased traffic:
about $0.40 to create a preapproval and $0.48 to renew it.
This is intended:
validator operators are best placed to decide which preapprovals are worth paying for, and for how long.

Furthermore, validator operators can create preapprovals with extended expiry periods
at a rate of $1 per year for each preapproval.
Users whose validator operators do not create extended preapprovals can create their own at the same rate.

### Alternatives Considered

- **Reduce free traffic immediately.**
  Rejected, as it gives the ecosystem no time to adjust.
- **Have validators pay for ACS commitments.**
  Rejected, as their cost grows with network size,
  making well-connected validators expensive to run for protocol-required traffic.
- **Remove free traffic entirely.**
  Rejected, as every validator would have to buy traffic just to stay operational and to upgrade Splice,
  while the farming potential of the proposed allowance is small.

## Backwards Compatibility

### Recommendations for Validator Operators

The free allowance only pays for a validator's background traffic.
We recommend that validator operators:

1. Enable the validator app's [top-up automation](https://docs.canton.network/global-synchronizer/deployment/synchronizer-traffic#buying-traffic-with-the-validator-app’s-top-up-automation)
   and keep enough CC on the validator to buy traffic.
   It is disabled by default (`targetThroughput = 0`).
2. Keep CC for recovery in a wallet on a different validator,
   to buy traffic when their own validator has none left.

On DevNet and TestNet, the [traffic faucets](#traffic-faucets-for-test-networks)
let validator operators onboard a validator without access to a wallet.

## Reference Implementation

The reduction of free traffic is enacted via SV votes on `AmuletConfig`.
The SV app's synchronizer parameter reconciliation already propagates `burstAmount` and `burstWindow`
to Canton's `maxBaseTrafficAmount` and `maxBaseTrafficAccumulationDuration`, so no code change is needed for it.

Free rate-limited ACS commitments and rate-limited time proofs are implemented in Canton and roll out with PV38.

Splice is changed as follows:

- The SV app sets the ACS commitment and time proof rate limits chosen by the SV operators in the synchronizer parameters.
- The validator app sends status reports on its `ValidatorLicense` daily instead of hourly.
- The SV app implements the [traffic faucet](#traffic-faucets-for-test-networks) for test networks.


## Copyright

This CIP is licensed under CC0-1.0: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)

## Changelog

- 2026-11-25: revised draft. Main changes:
  - rollout in a single step with PV38
  - add traffic faucet for test networks
  - add measured traffic costs of validator operations and use them to justify daily status reports
  - explain the financing of the traffic faucets for test networks
  - add the expected monthly background traffic cost of a validator, including Splice upgrades
  - replace the removal of free traffic by a free allowance of about $10 per month that pays for the background traffic of a validator
  - rename the CIP to "Reduce the Free Traffic Subsidy"
