<pre>
  CIP: CIP-TBD
  Layer: Applications
  Title: Dedicated Synchronizer Paymaster Model
  Author: Moritz Kiefer <moritz.kiefer@digitalasset.com>
  Discussions-To: [https://lists.sync.global/g/cip-discuss](https://lists.sync.global/g/cip-discuss)
  Comments-Summary: No comments yet.
  Comments-URI: [https://github.com/canton-foundation/cips/pulls](https://github.com/canton-foundation/cips/pulls)
  Status: Draft
  Type: Tokenomics
  Created: 2026-11-09
  License: CC0-1.0
  Requires: CIP-0104, CIP-0129
  Post-History: [https://github.com/canton-network/splice-multi-sync/issues/87](https://github.com/canton-network/splice-multi-sync/issues/87)
</pre>

## Abstract

[CIP-0129 (Universal Burn and Synchronizer Pricing)](https://github.com/canton-foundation/cips/blob/main/cip-0129/cip-0129.md) introduced universal burn for all synchronizers on the Canton Network, bringing dedicated synchronizers into the Canton Coin (CC) burn-mint economy. This CIP provides the technical specification for Phase 1 of Universal Burn: the Dedicated Synchronizer (dSync) Paymaster Model. Under this model, a trusted dedicated synchronizer operator can operate a dedicated synchronizer, get a traffic report for activity on that synchronizer, and their designated paymaster periodically pays for consumed traffic post-hoc by burning CC on the Global Synchronizer. Each burn records activity via CIP-0104’s activity recording hook, enabling the Paymaster to earn app rewards and validator rewards for activity on the dedicated synchronizer. This Phase 1 is an interim step towards later delivery of fully trustless and self-serve dedicated synchronizers.

## Specification

### High-Level Flow

The Paymaster model operates through three core steps:

1. **DSync Traffic Reporting**: The dedicated synchronizer tracks all traffic consumed on the dedicated synchronizer and exposes an API on the dSync Operator App that reports traffic consumed within a time interval, split into 10-minute intervals. In this Phase 1 approach there is no traffic enforcement on the dedicated synchronizer, so in particular, messages never get rejected because a node runs out of traffic.
2. **Paymaster CC Burn:** The link between the traffic report and the paymaster burning CC is off-ledger, and during this phase the dSync operator and paymaster are trusted to burn the right amount of CC. This is an interim phase optimized for early delivery of universal burn; later phases will make the trust model and enforcement stricter. Discounts are handled by an off-ledger agreement between the Super Validators and the dSync operator. For example, for a 50% discount, the paymaster would burn CC for 50MB of traffic when the traffic report shows 100MB consumed. It is up to the paymaster to build any automation that consumes traffic reports and automatically does the burn based on that. Similarly to traffic burns for the gSync, this produces validator rewards. Discount agreements can also be across multiple synchronizers for the same paymaster, e.g. a volume-based discount across multiple synchronizers with the same paymaster.
Such a deal may also agree to let specific dSyncs/paymasters to smooth burn over extended periods by burning post-hoc with a delay. This allows paymasters to apply smoothing in different ways:
Stepwise smoothing: If a paymaster was allowed to burn with a delay of up to 14 days, they could measure aggregate required burn and rewards attribution once a week, and then burn at constant rate every round for the following week. 
Continuous Smoothing: If a paymaster was allowed to burn with a delay of 7 days, they could each round measure the average burn and rewards attribution over the preceding 7-day rolling window and burn and attribute rewards at that rate for the current round.
3. **App Reward Integration**: As part of the traffic purchase performed by the paymaster, the Daml code exercises the [App Activity Recording Extension Hook](https://github.com/canton-foundation/cips/blob/92df641487c5e465dad5ea8d03245d3b9b328523/cip-0104/cip-0104.md#app-activity-recording-extension-hook) to create app and asset activity records for the paymaster party, which allows the paymaster to receive featured app rewards if they have a featured app right. The value of the app and asset activity records depends on the traffic purchased, and also the SV-configured per-synchronizer app activity weight and asset activity weight factors. The weights allow determining the split between asset and non-asset activity on a given synchronizer.
**Example Walkthrough:**

- **Configuration:** A `RegisteredSynchronizer` is set up with `maxAppActivityWeight = 1.0` and `maxAssetActivityWeight = 0.1` (reflecting an app moving a single featured asset).
- **Traffic Report:** The dSync Operator App reports 100 MB of total consumed traffic for the period.
- **Burn Calculation:** The paymaster applies whatever discounting, minimum usage rates, or other modifiers that apply to the dSync as applicable under current tokenomics guidance to calculate the amount of burn required. For example, if a simple 50% discount is applicable, the paymaster calculates that they need to burn 50MB * $60/MB / CC price.
- **Burn:** The paymaster burns the corresponding amount of CC through dedicated smart contract functions. They can spread that burn out evenly over the next 7 days.
- **Created Records & Rewards:**
  - **Validator Rewards:** A Validator Reward Coupon is generated corresponding to the 50 MB worth of CC burned.
  - **Activity Records:** The hook creates an App Activity Record for 50 MB (50 MB × 1.0) and an Asset Activity Record for 5 MB (50 MB × 0.1).
- **Minting Steps:** Validator rewards and app/asset featured rewards are subsequently minted in separate issuance transactions based on these created coupons and activity records.

### Technical Details

#### On-Ledger Registration & Governance

A dedicated synchronizer must be registered on-ledger via SV governance vote. The vote will create a `RegisteredSynchronizer` contract specifying:

- the `synchronizerId` of the dedicated synchronizer
- the `paymaster` party that is allowed to burn CC for this dSync. Given that dSync operators and paymasters are assumed to be trusted in this phase, we don’t currently allow an arbitrary party to burn CC for a dSync.
- `maxAppActivityWeight` and `maxAssetActivityWeight` as the factors multiplied with the bytes purchased to determine the created activity records.

Two additional types of SV votes allow updating all the parameters for a given `RegisteredSynchronizer` and archiving a `RegisteredSynchronizer`.

#### Traffic Purchase API

The traffic purchase choices `AmuletRules_BuyMemberTraffic` as well as the [token standard based traffic purchase](https://docs.canton.network/global-synchronizer/deployment/synchronizer-traffic#buying-traffic-with-a-token-standard-transfer) are extended to support purchasing traffic for a `RegisteredSynchronizer`. In addition to specifying the synchronizer, this also allows two optional `appActivityWeight` and `assetActivityWeight` parameters. If set, these must not exceed the SV configured `maxAppActivityWeight` and `maxAssetActivityWeight`. This override is intended to allow for more flexible policies where the weights vary between purchases. How these weights are used is left up to separate policies. The resulting weights are then used to exercise the [app activity recording extension hook](../cip-0104/cip-0104.md) `ActivityRecorder_DsoRecordActivity` to produce activity records for the paymaster feature and therefore allow minting app rewards provided the paymaster party has a featured app right.

#### Traffic Reporting

The dSync operator app exposes an API taking start and end record time, returning traffic consumed on the whole synchronizer in bytes per 10-minute interval (`XX:00`, `XX:10`, ...) within the sequencer pruning window in a JSON format. The timepoints are measured against the sequencer clock, i.e., the same clock used to measure a transaction’s [record time](https://docs.canton.network/overview/reference/ledger-causality#record-time).

#### GSync Dependency

Since the dSync only does traffic reporting but no traffic enforcement and the link to the paymaster is done off-ledger, there is no direct dependency on availability of the gSync for functioning of the dSync. In particular, a gSync outage has no effect on the dSync and participants can connect only to the dSync with no requirement to also connect to the GSync.

#### Trust Model

The dSync operator and paymaster are trusted to correctly report the traffic used on their dSync and burn CC based on that and the agreed discount for this dSync with the SVs. A malicious dSync operator and paymaster could under- or over-report usage, but on-chain enforcement ensures that any rewards received are commensurate with their burn. This trust model is specific to this first phase and later phases are expected to reduce the trust in the DSync operator and paymaster.

## Motivation

Historically, dedicated synchronizers on Canton Mainnet sat outside Canton Coin tokenomics under enterprise license fees. As license fees are phased out, Universal Burn ensures all synchronizers contribute economically to the Canton network.
The paymaster model provides a straightforward first step toward the universal burn model while providing app reward integration from the start and providing strong technical guarantees that gSync outages never affect the availability of a dSync.

## Rationale

- **Trust Model**: Relying on trust in the dSync operator and the paymaster allows removing any direct dependency on the gSync and allows for fully isolated dSyncs to ease the transition from existing dedicated synchronizers that are currently not part of universal burn to start burning CC for their traffic.
- **App Reward Alignment**: Integrating app rewards from the start means that moving traffic from the gSync to dSyncs does not negatively impact the rewards generated.
- **Rewards for Paymaster** Letting the paymaster mint all validator and app rewards for the dsyncs matches the fact that they are the only ones burning CC for the traffic on the dsync and is expected to work for the deployment models of the initial dsyncs. We expect more granular reward attribution to come in later states.

## Copyright

This CIP is licensed under CC0-1.0: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
