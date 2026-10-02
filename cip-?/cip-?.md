## Supervalidator Weights on Ledger

<pre>
  CIP: ?
  Layer: Splice
  Title: Supervalidator Weights on Ledger
  Author:
    Arkadiusz Konior
    Daniel Oliveira
    Przemysław Pawelec
    Jose Velasco
  Status: Draft
  Type: Standard Track
  Created: 2026-09-dd
  License: CC0-1.0

</pre>

## Abstract

Multiple Super Validator Right Owners can host their weights on a single Super Validator Node.
The weights of these SV Right Owners are combined and represented on-ledger under the name of the SV Node Operator.

The management of SV Right Owners, along with their weights and beneficiaries happens entirely off-ledger.
Not only does this not take advantage of the transparency and trust provided by the ledger but the process of
applying changes is slow, cumbersome and must happen serially.

This proposal moves management of SV Right Owners, their weights and beneficiaries onto the ledger.

## Copyright

This CIP is licensed under CC0-1.0: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)

## Specification

### 1. Objective
Align the Daml ledger model with current practices when it comes to the management of SV Right Owners and their beneficiaries.

Before introduction of this CIP things worked as follows:

- SV Nodes are represented on ledger with a weight assigned to them.
- Each SV Node keeps a configuration (off-ledger) of their SV Right Owners and their beneficiaries (including the weights)
- For coupon creation, each SV Node uses the beneficiaries mechanism present in the Daml model to create coupons.
  for their SV Right Owners and their beneficiaries with weights derived from their off-ledger configuration.
- Adding or removing a new SV Right Owner involves the SV Node requesting a vote on changing its own reward weight,
  and then the node operator updating the off-ledger configuration of beneficiaries of the node.
- All other SVs need to configure their off-ledger configuration of the total weight of the node, which
  is used for re-onboarding in case offboarding is required for any reason.

Crucially, SV Right Owners and beneficiaries are not represented on ledger.

This CIP introduces:

- Daml ledger data model including `SvRightOwner` and `SvRightOwnerInfo` that stores `rewardWeight` .
- Elimination of the off-ledger weight configuration.
- SV Right Owner onboarding, offboarding and weight update requires an on-ledger governance vote.
- The weights of any SV Right Owners can be updated independently and in parallel.
- An SV Right Owner’s reward coupons for a round can be issued only by its configured SV Node Operator.
- The SV Node Operator must issue coupons to all recipients according to the on-ledger beneficiary configuration.
- SV Right Owners is able to manage their own beneficiaries without requiring approval or voting of other SVs.
- Migration from the legacy to the new model invalidates the legacy SV coupon creation flow.
- Migration does not result in any loss or duplication of rewards.

### 2. Implementation Mechanics
#### Introduction
With this CIP, SV Right Owner is represented on the ledger along with its reward weight and beneficiaries.
In addition, we store the proportion of rewards each beneficiary should receive.
To change the reward weight of an SV Right Owner, an SV vote is required.
SV Right Owners can change their beneficiary configuration at will.

This completely replaces the `extraBeneficiaries` off-ledger configuration.

If a node operator is an SV Right Owner itself, it will also be represented as an SV Right Owner on its own node,
with its weight managed in the exact same way as all other SV Right Owners.

After the migration to the new model, SV Nodes no longer have any weight associated to them directly.
The `SvInfo.svRewardWeight` is deprecated. See backwards compatibility section for more information.

#### SV Right Owner Management
A UI is provided such that an SV Right Owner admin user is able to:

- View information about its SV Right Owner status
- Manage its beneficiaries

This is tied to choices in the Daml model.

Both the SV UI and Scan UI include information about SV Right Owners,
supported by an endpoint (TBD) in the Scan API.

A few voted actions are added to the Daml model and the SV UI to allow managing SV Right Owners in the following ways:

- Onboard a new SV Right Owner
  - `DsoRules_AddSvRightOwner`
- Update SV Right Owner reward weight
  - `DsoRules_UpdateSvRightOwnerInfo`
- Offboard an SV Right Owner
  - `DsoRules_RemoveSvRightOwner`
- Migrate an SV Right Owner to a different SV Node
  - `DsoRules_UpdateSvRightOwnerInfo`

#### Coupon Creation
SV Reward Coupons continue to be created by each SV Node on behalf of SV right owners hosted on that node for reward minting.
One `SVRewardCoupon` per round will be created for each beneficiary of each SV Right Owner (plus one for the SV Right Owner itself if there is leftover weight).

`DsoRules` is extended with a choice `DsoRules_ReceiveSvRewardCouponV2` to do this.
`SvRewardState` tracks the reward collection state for the SV Right Owners to ensure
no double-dipping happens.

Within an SV Right Owner, it is guaranteed by the Daml model that each beneficiary gets at most one `SVRewardCoupon` per round and with the correct weight.
Making sure that each such coupon actually gets created will _not_ be enforced by the Daml model (it is possible for a malicious SV Node or in the case of an SV outage that no coupons are created).

No UI changes are expected regarding coupon creation.

#### Migration
New choice `DsoRules.DsoRules_MigrateToOnLedgerSvRightOwners` is provided to allow migration from the old model to the new.
The migration does not require any action on the side of existing beneficiaries. The reward minting flow on their side is unchanged.

This migration voted action will be made available in the voting UI.

#### Changes to SV Node Onboarding Flow
As SV Nodes no longer have any weight associated with them, onboarding flow changed to reflect this.
In the typical case of a new SV Node with some associated reward weight, the onboarding will be done in two steps:

1. The SV Node is onboarded (with no weight attached to them).
2. We onboard them as an SV Right Owner.

The same two steps are required for offboarding.

## Motivation

SV Right Owner weight being completely off-ledger has at least a few problems:

- Onboarding, offboarding or changing weight for SV Right Owners is a laborious process. It requires voting to change the SV Node's weight and then an off-ledger configuration change on that SV Node.
- Onboarding, offboarding or changing weight for SV Right Owners can only happen sequentially for each SV Node.
  We have to wait for the voting to be complete before requesting another SV Node weight change.
- Full trust of SV Nodes is required when it comes to managing their SV Right Owners. Each SV Node can arbitrarily change their reward allocation every round.
- SV Right Owners have to bother their SV Node to have them change their off-ledger configuration when managing their beneficiaries.
- Further developments that rely on SV Right Owner weight are currently hard to implement (e.g. weighed voting or automatic weight updates).
- SV Right Owners and their weights are not visible publicly in block explorers and in Scan APIs.

This proposal solves all of these issues and provides a strong base for further developments involving SV weight and rewards.

## Rationale

This approach is broadly in line with existing conventions, reuses what exists as much as possible and is almost fully backward compatible with an easy migration path.

The possibility of storing the SV Right Owner info in DsoRules itself rather than having separate contracts was considered.
This has the disadvantage of increasing contention for DsoRules, which might become significant if,
for example, further developments around automated weight updates become a reality.

Having a bulk choice/vote to add/remove/update was also considered but decided against because
it makes votes harder to reason about and is less aligned with the existing conventions in splice.

## Backwards compatibility

All provided software and operations will be fully backwards compatible before and after migration.
Third party ledger observability tools might require an update to reflect changes in the underlying daml code.

The implementation affects exising system only after a migration is voted on and executed.

### Data model
The `SvInfo.svRewardWeight` field is deprecated. It will be required to be 0 after migration.
It is being replaced with `SvRightOwnerInfo.rewardWeight`.

This CIP obsoletes a daml contract choice related to `svRewardWeight`:
`DsoRules_UpdateSvRewardWeight` is replaced by `DsoRules_ExecuteUpdateSvRightOwnerInfoInstruction`

Old contract can be called, but will return an error. In addition, the `svRewardWeight` parameter is deprecated in the following choices
- `DsoRules_AddSv`
- `DsoRules_ConfirmSvOnboarding`
- `DsoRules_AddConfirmedSv`

As a consequence, CIP-0111 mentions of `Update Sv Reward Weight` should be understood in terms of updates of `RightOwnerInfo` after a migration defined in this proposal is complete.

Moreover, existing SV onboarding flow will be impacted by migration. Any onboarding with nonzero `SvInfo.svRewardWeight` will be rejected.

### Rewards
Introduction of SvRightOwner preserves the existing reward system. However, the daml rewards creation choice is changing:
`DsoRules_ReceiveSvRewardCoupon` is replaced by `DsoRules_ReceiveSvRewardCouponV2`.

Up-to-date software will be required for collecting rewards after migration.

## Reference implementation

Implementation can be tracked in Splice feature fork: https://github.com/canton-network/splice-on-ledger-sv-weights

## Changelog

* 2026-09-30: Initial draft.
* 2026-10-02: Clarified SV Node operator's role in the minting process.
