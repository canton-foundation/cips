## CIP - TBD Manage Super Validator Weights on Ledger

<pre>
  CIP: TBD
  Layer: Splice
  Title: Manage Super Validator Weights on Ledger
  Author:
    Arkadiusz Konior
    Daniel Oliveira
    Przemysław Pawelec
    Jose Velasco
  Status: Draft
  Type: Standards Track
  Created: 2026-09-30
  License: CC0-1.0

</pre>

## Abstract

Multiple Super Validator Right Owners currently may host their weights on a single Super Validator Node.
The weights of these SV Right Owners are combined and represented on-ledger under the name of the SV Node Operator.

The management of SV Right Owners, along with their weights and beneficiaries, happens off-ledger
via a configuration file managed by the Super Validator node operators in a public GitHub repository.
Not only does this not take advantage of the transparency and trust provided by the ledger, but the process of
applying changes is slow, cumbersome, and must happen serially.

This proposal moves management of SV Right Owners, their weights and beneficiaries onto the ledger.

## Copyright

This CIP is licensed under CC0-1.0: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)

## Specification

### 1. Objective
This CIP will align the Daml ledger model with current practices when it comes to the management of SV Right Owners and their beneficiaries.

Super Validator weights are currently managed as follows:

- SV Nodes are represented on the ledger with a weight assigned to them.
- Each SV Node keeps an off-ledger configuration of its SV Right Owners and their beneficiaries (including the weights).
- For coupon creation, each SV Node uses the beneficiaries mechanism present in the Daml model to create coupons
  for their SV Right Owners and their beneficiaries, with weights derived from the off-ledger configuration.
- Adding or removing an SV Right Owner involves the SV Node requesting a vote to change its own reward weight,
  followed by the SV Node Operator updating the node's off-ledger beneficiary configuration.
- All other SVs need to configure the node's total weight off-ledger, so that the off-ledger configuration can be used for re-onboarding,
  in a case when offboarding is required for any reason.

Crucially, SV Right Owners and beneficiaries are not represented on the ledger.

This CIP introduces the following changes:

- A Daml ledger data model including `SvRightOwner` and `SvRightOwnerInfo`, which store `rewardWeight`.
- Elimination of the off-ledger weight configuration.
- SV Right Owner onboarding, offboarding, and weight updates via on-ledger governance votes.
- The weights of any SV Right Owners can be updated independently and in parallel.
- As is the case today, in this proposal an SV Right Owner’s reward coupons for a round can be issued only by its configured SV Node Operator.
- The SV Node Operator now will issue coupons to all recipients according to the on-ledger beneficiary configuration.
- SV Right Owners will be able to manage their own beneficiaries without requiring approvals, actions by SV node operators, or votes from other SVs.
- Migration from the existing to the new model will invalidate the legacy SV coupon creation flow.
- Migration does not duplicate rewards. SV Node Operators that continue under the same name keep their rewards. Other SV Right Owners, including those added later, start receiving rewards from the next round.

### 2. Implementation Mechanics
#### Introduction
With this CIP, an SV Right Owner is represented on the ledger along with its reward weight and beneficiaries.
In addition, we store the proportion of rewards each beneficiary should receive.
To change the reward weight of an SV Right Owner, an SV vote is required.
SV Right Owners can change their beneficiary configuration at will.

This completely replaces the `extraBeneficiaries` off-ledger configuration.

If a node operator is itself an SV Right Owner, it will also be represented as an SV Right Owner on its own node,
with its weight managed in the exact same way as all other SV Right Owners.

After the migration to the new model, SV Nodes no longer have any weight associated with them directly.
The `SvInfo.svRewardWeight` field is deprecated. See the Backwards Compatibility section for more information.

#### SV Right Owner Management
A UI will be built and provided as part of implementing this CIP, as a separate tab in the SV governance dApp, so that an SV Right Owner administrator can:

- View information about its SV Right Owner status
- Manage its beneficiaries

This is tied to choices in the Daml model.

Both the SV UI and Scan UI include information about SV Right Owners,
supported by an endpoint in the Scan API.

A few actions that require a vote are added to the Daml model and the SV UI to manage SV Right Owners in the following ways:

- Add (onboard) an SV Right Owner
  - `DsoRules_AddSvRightOwner`
- Update an SV Right Owner's reward weight or SV Node
  - `DsoRules_UpdateSvRightOwnerInfo`
- Remove (offboard) an SV Right Owner
  - `DsoRules_RemoveSvRightOwner`
- Migrate the network to on-ledger SV Right Owners (once)
  - `DsoRules_MigrateToOnLedgerSvRightOwners`

#### Coupon Creation
SV Reward Coupons continue to be created by each SV Node on behalf of SV Right Owners hosted on that node for reward minting.
One `SvRewardCoupon` per round will be created for each beneficiary of each SV Right Owner (plus one for the SV Right Owner itself if there is leftover weight).

`DsoRules` is extended with a choice, `DsoRules_ReceiveSvRewardCouponV2`, to create these coupons.
`SvRewardState` tracks the reward collection state for the SV Right Owners to ensure
no double-dipping happens.

Within an SV Right Owner, the Daml model guarantees that each beneficiary gets at most one `SvRewardCoupon` per round, with the correct weight.
Making sure that each such coupon actually gets created will _not_ be enforced by the Daml model.
In the case of an SV Node outage (or a malicious SV Node), no coupons are created for any of the SV Right Owners hosted on that SV or their beneficiaries.

No UI changes are expected regarding coupon creation.

#### Migration
A new choice, `DsoRules.DsoRules_MigrateToOnLedgerSvRightOwners`, is provided to allow migration from the old model to the new.
The migration does not require any action by existing beneficiaries. Their reward-minting flow is unchanged.

This migration action will require a vote from SVs and will be made available in the voting UI.

#### Changes to SV Node Onboarding Flow
As SV Nodes no longer have any weight associated with them, the SV Node onboarding flow will be changed to reflect this.
In the typical case of a new SV Node with some associated reward weight, the onboarding will be done in two steps:

1. The SV Node is onboarded (with no weight attached to it).
2. The SV Node Operator is also voted in as an SV Right Owner.

The same two steps are required for complete offboarding.

#### Changes to Escrowed Rewards

The current escrowed rewards system, which uses a ghost-party setup configured off-ledger, can be directly translated to an on-ledger configuration using `SvRightOwner`.
The operational logic remains the same.
After migration, a ghost party can be voted in as an SV Right Owner (`DsoRules_AddSvRightOwner`).
The reward weight calculation and minting process remain unchanged.

## Motivation

Keeping SV Right Owner weights completely off-ledger has several problems:

- Onboarding, offboarding, or changing the weight of an SV Right Owner is a laborious process. It requires a vote to change the SV Node's weight, followed by an off-ledger configuration change on that SV Node.
- Onboarding, offboarding, or changing the weight of an SV Right Owner can only happen sequentially for each SV Node.
  We have to wait for a vote to conclude before requesting another SV Node weight change.
- Full trust in SV Nodes is required to manage their SV Right Owners. Each SV Node can arbitrarily change the distribution of its reward allocation every round.
- SV Right Owners have to depend on their SV Node to change its off-ledger configuration when managing beneficiaries.
- Further developments that rely on SV Right Owner weight are currently hard to implement (e.g., weighted voting or automatic weight updates).
- SV Right Owners and their weights are not visible publicly in block explorers and in Scan APIs.

This proposal solves all of these issues and provides a strong base for further developments involving SV weight and rewards.

## Rationale

This approach is broadly in line with existing conventions, reuses what exists as much as possible, and is almost fully backward compatible with an easy migration path.

The possibility of storing SV Right Owner information in DsoRules itself, rather than having separate contracts, was considered.
This has the disadvantage of increasing contention for DsoRules, which might become significant if,
for example, further developments around automated weight updates become a reality.

Having a bulk choice/vote to add/remove/update was also considered but decided against because
it makes votes harder to reason about and is less aligned with the existing conventions in Splice.

## Backwards compatibility

All provided software and operations will be fully backwards compatible before and after migration.
Third-party ledger observability tools might require an update to reflect changes in the underlying Daml code.

The implementation affects the existing system only after a migration is voted on and executed.

### Data model
The `SvInfo.svRewardWeight` field is deprecated. It will be required to be 0 after migration.
It is being replaced with `SvRightOwnerInfo.rewardWeight`.

This CIP obsoletes a Daml contract choice related to `svRewardWeight`:
`DsoRules_UpdateSvRewardWeight` is replaced by the vote `DsoRules_UpdateSvRightOwnerInfo`.

After the migration, the old choice is refused. In addition, the `svRewardWeight` parameter is deprecated in the following choices:
- `DsoRules_AddSv`
- `DsoRules_ConfirmSvOnboarding`

As a consequence, references in CIP-0111 to `Update Sv Reward Weight` should be understood as updates to `SvRightOwnerInfo` after the migration defined in this proposal is complete.

Moreover, the existing SV onboarding flow will be affected by migration. Any onboarding with a nonzero `SvInfo.svRewardWeight` will be rejected.

### Rewards
The introduction of `SvRightOwner` preserves the existing reward system. However, the Daml reward-creation choice is changing:
`DsoRules_ReceiveSvRewardCoupon` is replaced by `DsoRules_ReceiveSvRewardCouponV2`.

Up-to-date software will be required for collecting rewards after migration.

## Reference implementation

The implementation can be tracked in the Splice feature fork: https://github.com/canton-network/splice-on-ledger-sv-weights

## Changelog

* 2026-09-30: Initial draft.
* 2026-10-02: Clarified SV Node operator's role in the minting process.
* 2026-10-05: Editorial changes. Added Changes to Escrowed Rewards section.
* 2026-10-06: Wording corrections and clarifications.
* 2026-10-19: Additional editorial changes.
