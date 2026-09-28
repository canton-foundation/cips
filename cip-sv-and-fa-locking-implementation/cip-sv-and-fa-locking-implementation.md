<pre>
CIP: &lt;xxx&gt; CIP number to be assigned
     (TODO: add actual CIP number and search and replace through the doc)
Title: On-Chain Enforcement of FA and SV Locking (Implementation of CIP-0116 and CIP-0105)
Author: Jonathan D.K. Gibbons @ Obsidian Systems, Simon Meier @ Digital Asset
Status: Draft
Type: Governance
Created: Aug 10, 2026
License: CC0-1.0
</pre>

# Abstract

This CIP serves to align the stakeholders of [CIP-0105](../cip-0105/cip-0105.md) (SV Locking) and [CIP-0116](../cip-0116/cip-0116.md) (FA Locking) on the implementation of on-chain enforcement of SV and FA locking. It is motivated by the fact that the concrete mechanisms chosen to implement locking have a material impact on the operability of SVs, FAs, and staking apps.

The proposed implementation closely follows the high-level guidance laid out by these two CIPs except for the following three minor changes:

1. Add a grace period for underlocked FA rights during which they are only temporarily suspended. The grace period defaults to seven days and can be changed by SV voting. It serves to reduce the trust that FA operators need to have in their lock owners; and thus increases the expected total amount locked by FA locks.
2. Require locks to lock a minimum amount to avoid “dust” locks whose management overhead surpasses their value. The minimum lock amount defaults to 10k CC and can be changed by SV voting.
3. Support configurable controllers for unlocking, substitution and withdrawing vested funds to simplify building staking apps.

The CIP further clarifies the technical integration between wallets and locks; and it proposes incremental delivery and migration paths, thereby creating clarity for the work required from the stakeholders to land on-chain enforcement of SV and FA locks on MainNet.

# Specification

This specification explains the concrete mechanisms chosen to implement on-chain enforcement of [CIP-0105](../cip-0105/cip-0105.md) (SV Locking) and [CIP-0116](../cip-0116/cip-0116.md) (FA Locking). It is split into three sections: high-level specification, incremental delivery plan, and technical specification.

The [high-level specification](#high-level-specification) is aimed at business stakeholders that want to understand the mechanisms chosen to implement locking; e.g., because they want to figure out the business workflows for a staking app. It also serves as the functional specification for the implementation.

The [incremental delivery plan](#incremental-delivery-plan) specifies how the full specification is broken down into milestones that can be delivered incrementally, enabling the early delivery of key features. It furthermore explains the expected migration paths to on-chain enforcement for both FA and SV locking.

The [technical specification](#technical-specification) builds on the high-level specification. It clarifies technical aspects where required to clarify the interaction between different systems or applications.

## High-Level Specification

### Terminology

Apps:

* **App provider:** the organization operating an application
* **App provider party**: the party representing an application on-ledger
* **Featured app (FA)**: an application whose app provider party was granted featured application status

SVs:

* **SV rights owner**: an entity with the right to earn SV rewards
* **SV rewards beneficiary**: the party that is allowed to mint the SV rewards for (part of) the SV weight of an SV rights owner

Governance locks:

* **(Governance) lock**: a CC holding locked for the purpose of fulfilling the locking requirements mandated by the governance rules specified for SVs in [CIP-0105](../cip-0105/cip-0105.md) and for FAs in [CIP-0116](../cip-0116/cip-0116.md).
  * **SV lock**: a governance lock created to satisfy SV locking requirements
  * **FA lock**: a governance lock created to satisfy FA locking requirements
  * **Provisional FA lock:** a governance lock created to apply for an FA right
* **lock owner**: the party that owns the funds locked in a governance lock
* **lock subject**: the name of the SV rights owner or FA party whose locking requirements the governance lock contributes to.
* **vesting lock**: a representation of a CC holding whose amount was locked as a governance lock, but is now unlocking in a vested fashion and no longer counts toward the fulfilment of locking requirements.

### Wallet Integration

Two wallet integration options are supported:

1. **Full feature integration:** the full feature set of governance locks can be used with any wallet supporting the [CIP-112](../cip-0112/cip-0112.md) Token Standard V2 (TSv2) APIs with custom [extended metadata](#support-for-extended-metadata).
2. **Compatibility mode:** a compatibility mode with a reduced feature set allows using any wallet that supports [CIP-56](../cip-0056/cip-0056.md) Token Standard V1 (TSv1) two-step transfers to create locks, unlock them, and withdraw vested funds in daily tranches.

The full feature integration requires TSv2 support, as the TSv1 APIs are not expressive enough to represent governance locks and all actions on them. The compatibility mode serves to enable the initial deployment of SV and FA locks without depending on wallet providers to immediately complete TSv2 support.

We expect the wallet ecosystem to migrate over time to full feature integrations based on the TSv2 APIs. Some might even go further and build dedicated UIs for interacting with governance locks. We further expect the TSv2 APIs to be used by all apps (e.g., staking apps) that want to interact with governance locks. See [Wallet Integration Details](#wallet-integration-concerns) for details on the wallet integration.

#### Extra Parameters

Extra parameters and data are communicated over the TSv2 APIs via metadata keys prefixed by `cip-<xxx>/` where `<xxx>` represents the CIP number that will be assigned to this implementation CIP. Communicating this data via metadata keys allows reading and setting them via the generic metadata support of wallets. See the section on [Support for Extended Metadata](#support-for-extended-metadata) for details on how wallets are expected to provide this support.

### Lock Lifecycle

The following sections describe the lock lifecycle based on the TSv2 APIs. See the final section, titled [Compatibility Mode Lifecycle](#compatibility-mode-lifecycle), for details on how the lock lifecycle works when using the compatibility mode based on TSv1 two-step transfers.

#### Creation

All locks are created by the lock owner creating a TSv2 allocation with special metadata that identifies it as a governance lock. The metadata specifies the lock type (FA or SV), the lock subject, and the custom controllers for the unlock, withdraw and substitution actions explained below.

##### Controllers on Lock Actions

The controllers on lock actions are specified as a set of sets of parties. If all parties in any one of these sets authorize the action, then it happens. All controllers are made observers of the lock contract, so they can monitor its state.

The controllers can provide their authorization for an action individually one after the other in their own Daml transaction; or jointly in a single transaction. The former is useful when the controllers are each using their own wallet to authorize an action. They do so by executing the action they want to confirm, which only happens once a sufficient set of controllers have authorized it. Joint authorization in a single transaction is useful when their authorization is managed via a third-party app.

##### Example: Creating an FA Lock

The following FA lock is an example of a lock that a staking app `S` might create:

* FA lock with
  * lock owner: `A`
  * lock subject: `X`
  * amount: 5M CC
  * substitution controllers: `{S, X} | {S, A} | {A, X}`
  * unlock controllers: `{S, X} | {S, A} | {A, X}`
  * vesting controllers: `{S} | {A}`

The lock owner `A` is the party that owns the 5M CC that are locked for the featured app party `X`.

The substitution controllers and the unlock controllers are the same. They are chosen such that any two out of the three parties `{A, X, S}` can take the action on their own. This reflects that the staking app acts as a trusted third-party between `X` and `A`, but `A` and `X` also reserve the right to act independently of `S`.

The vesting controllers control the disbursal of vesting funds, which can happen via withdrawals or substitutions. In this example, they are chosen such that `S` can automate the withdrawal or substitution of vested funds on behalf of `A` without an extra delegation contract, but `A` can also drive substitutions and withdrawals themselves.

#### Unlocking

The parties specified as unlock controllers on a governance lock can request unlocking of (part of) a lock. They do so using their TSv2 wallet to request withdrawing the allocation representing the lock. Once enough unlock controllers have requested the unlocking, the lock is converted into a vesting lock with the vesting schedule parameters taken from the SV and FA lock vesting parameters managed via SV governance.

By default the whole locked amount is unlocked at once. A specific amount can be unlocked by passing the amount as metadata.

##### Provisional FA Locks

CIP-0116 requires featured app providers to prove that they have sufficient funds before applying for a featured app right. They can do so by creating a provisional FA lock that works like a normal FA lock except that on unlocking no vesting applies and the funds are immediately returned to the owner.

##### Withdrawing Vested Funds

The vesting controllers of a vesting lock can request to withdraw the vested amount from a vesting lock and return it to the lock owner as liquid CC. They do so using their TSv2 wallet to request withdrawing the allocation representing the vesting lock.

The release of vested amounts works in a pull-based fashion: the vesting controllers specify the time up to which vested funds should be computed and released. Provided this time is (a) in the past, (b) later than the creation of the vesting lock, and (c) later than the last time of withdrawal, the funds are released to the lock owner. If no locked funds remain, then the lock is archived.

##### Automated Return of Vested Funds

By default lock owners are expected to manage the withdrawal of vested funds on their own, potentially with the help of the vesting controllers.

Independently of the owners and vesting controllers, all SVs may run automation to clean up any fully vested vesting lock and return the vested funds as liquid CC to their owner. The SVs may use this for example to reduce the storage consumption of the SV nodes.

##### Example: Unlocking Part of an FA Lock

Let us continue the prior example of the following FA lock:

* FA lock with
  * lock owner: `A`
  * lock subject: `X`
  * amount: 5M CC
  * substitution controllers: `{S, X} | {S, A} | {A, X}`
  * unlock controllers: `{S, X} | {S, A} | {A, X}`
  * vesting controllers: `{S} | {A}`

Assume that `A` requests the unlocking of 1M CC from this lock via the staking app `S`. We would expect that the staking app checks whether that unlock is compliant with the staking deal. Assume it is and `S` makes the following unlock request at time `t0`:

* Request unlock:
  * actors: `{S, A}`
  * target lock: `cid1`
  * amount: 1M CC

The result of this request is:

* FA lock with
  * lock owner: `A`
  * lock subject: `X`
  * amount: 4M CC
  * substitution controllers: `{S, X} | {S, A} | {A, X}`
  * unlock controllers: `{S, X} | {S, A} | {A, X}`
  * vesting controllers: `{S} | {A}`
* Vesting lock with
  * lock owner: `A`
  * amount vesting: 1M CC
  * vesting start: `t0`
  * vesting end: `t0 + 60 days`
  * vesting controllers: `{S} | {A}`

##### Example: Withdrawing Vested Funds

Continuing the above example, assume that `S` automates the withdrawal of vested funds in quarter-period increments, i.e., every 15 days. Thus after 15 days, `S` instructs the withdrawal of vested funds which results in:

* payout of 1'000'000 / (60 / 15) = 250'000 CC
* updated Vesting Lock with
  * lock owner: `A`
  * amount vesting: 750'000 CC
  * vesting start: `t0 + 15 days`
  * vesting end: `t0 + 60 days`
  * vesting controllers: `{S} | {A}`

Note that the amount vesting and the vesting start are changed to represent the remaining vesting amount and its remaining vesting period. This representation works well with substitution, as can be seen in [this example](#example-substitution-of-a-vesting-lock).

#### Substitution

Funds owners can create a proposal to use their funds to substitute some (or all) of the locked amount of an existing lock. Substitution works for all types of locks independently of whether they are vesting or not. Substitutions of vesting locks are approved by the vesting controllers, while substitutions of non-vesting locks are approved by the substitution controllers. The new lock to be created is specified as part of the substitution. While it must have the same type as the existing lock, it can have different controllers and [metadata](#metadata-usage).

A substitution generally results in two locks of the same type with the same lock subject whose total amount is equal to the amount of the existing lock. The substituted funds in the existing lock are released as liquid CC to the lock owner of the existing lock. Locks whose locked amount would be zero are not created.

In the spirit of maximizing operational flexibility, a special provision is made for substitutions proposed by the owner of the targeted existing lock. Such a proposal does not lock any funds. Instead the funding of the resulting new locks is provided by splitting the funds of the existing lock. This allows lock owners to update the lock controllers and metadata without requiring any extra liquidity. As for normal substitutions, the substitution controllers on the existing lock must approve the substitution for it to succeed. Note that adding extra funds to an existing lock is not possible using substitutions. For that [topups](#topups-merges-and-minting-locked-sv-rewards) should be used.

Minimum lock amounts are enforced on all locks resulting from substitutions. Lock owners are encouraged to lock amounts that are multiples of the minimum lock amount to avoid failed substitutions.

##### Substitution Target Resolution

Substitution proposals specify the target lock by value. Concretely they specify type, owner, subject, controllers, vesting state, and metadata of their target lock. The amount is intentionally not included to avoid substitutions that cannot be accepted because the amount changed due to concurrent partial unlocks, partial substitutions, topups, or merges.

The implementation may resolve this target to any lock that matches its specification. No check on the amount is done as part of substitution target resolution, which may lead to failed substitutions if there are substitutions that match the specification but have an amount that is lower than the substitution amount. In these cases we recommend that the lock owners first [merge the locks](#topups-merges-and-minting-locked-sv-rewards) matching the same specification and only then apply the substitution.

##### Example: Substitution of Locked Funds

Assume given:

* App provider parties: `X`, `Y`
* Funds owner parties: `A`, `B`
* Staking app party: `S`
* FA lock with
  * lock owner: `A`
  * lock subject: `X`
  * amount: 5M CC
  * substitution controllers: `{S, X}`

Assume that `B` creates the following substitution proposal:

* Substitution proposal with
  * target
    * FA lock with
      * lock owner: `A`
      * lock subject: `X`
      * amount: 5M CC
      * substitution controllers: `{S, X}`
  * new lock
    * lock owner: `B`
    * lock subject: `X`
    * amount: 1M CC
    * substitution controllers: `{S, B} | {S, X}`
  * reserved holdings: 1M CC

Note that the creation requires `B` to provide 1M of CC holdings to back the proposal.

Assume both `S` and `X` approve the substitution proposal, which results in:

* archival of the substitution proposal
* payout of 1M CC to `A`
* updated existing FA lock with
  * lock owner: `A`
  * lock subject: `X`
  * amount: 4M CC
  * substitution controllers: `{S, X}`
* new FA lock with
  * lock owner: `B`
  * lock subject: `X`
  * amount: 1M CC
  * substitution controllers: `{S, B} | {S, X}`

Note that the substitution proposal does not specify the type of the new lock. That is copied from the target lock. Thus the new lock is of the same type by construction.

The substitution proposal does however specify the substitution controllers for the new lock, which are different between the locks in this example. On the existing lock, there is no option for the lock owner `A`  to approve a substitution. However on the new lock, the lock owner `B` can approve a substitution provided the staking app `S` agrees. This is important as the different owners do not necessarily have the same requirements with respect to who controls their lock substitutions.

##### Example: Changing the lock controllers using a substitution

Assume that the staking app `S` authorizes substitutions on their own using just `{S}` as the substitution controllers, and there exists the following lock:

* FA lock with
  * lock owner: `A`
  * lock subject: `X`
  * amount: 1M CC
  * substitution controllers: `{S}`

The app now adds a feature to hand back control over a lock to the lock owner. The app can execute this change of control by getting `A` to propose this substitution:

* Substitution proposal with
  * substitution target:
    * FA lock with
      * lock owner: `A`
      * lock subject: `X`
      * substitution controllers: `{S}`
  * new lock
    * lock owner: `A`
    * lock subject: `X`
    * amount: 1M CC
    * substitution controllers: `{A}`
  * reserved holdings: 0M CC

Note that no holdings are reserved, as the lock owner does not change. Once `S` accepts the substitution, the result is:

* updated FA lock with
  * lock owner: `A`
  * lock subject: `X`
  * amount: 1M CC
  * substitution controllers: `{A}`

##### Example: Substitution of a Vesting Lock

The earlier [example of withdrawing from a vesting lock](#example-withdrawing-vested-funds) resulted in the following vesting lock:

* Vesting Lock with
  * lock owner: `A`
  * amount vesting: 750'000 CC
  * vesting start: `t0 + 15 days`
  * vesting end: `t0 + 60 days`
  * vesting controllers: `{S} | {A}`

Assume `B` agreed to replace 250k CC of these vesting funds. They would do so by creating the following proposal:

* Substitution proposal with
  * target
    * Vesting Lock with
      * lock owner: `A`
      * vesting start: `t0 + 15 days`
      * vesting end: `t0 + 60 days`
      * vesting controllers: `{S} | {A}`
  * new lock
    * lock owner: `B`
    * amount: 250k CC
    * vesting controllers: `{S, B}`
  * reserved holdings: 250k CC

Note that specifying the vesting parameters of the target matters, as they determine the vesting parameters of the substituted funds.

Assume further that `S` and `A` jointly accept the proposal, which results in:

* payout of 250k CC to `A`
* archival of the proposal
* Vesting Lock with
  * lock owner: `A`
  * amount vesting: 500'000 CC
  * vesting start: `t0 + 15 days`
  * vesting end: `t0 + 60 days`
  * vesting controllers: `{S} | {A}`
* Vesting Lock with
  * lock owner: `B`
  * amount vesting: 250'000 CC
  * vesting start: `t0 + 15 days`
  * vesting end: `t0 + 60 days`
  * vesting controllers: `{S, B}`

Note that not only the amount changed, but also the vesting controllers as specified in the substitution proposal.

#### Topups, Merges, and Minting Locked SV Rewards

A topup allows a lock owner to deposit additional funds in an existing lock. They can do so without any extra authorization. They can fund topups using three funding sources: liquid CC, unminted SV rewards, or existing locks with the same attributes as the topup target.

Using unminted SV rewards allows these to be minted directly as locked funds, which is useful in tax regimes that treat unvested and vested rewards differently. When doing so, the lock owner can specify the percentage of rewards that should be added to the locked funds, making it easy for SVs to mint and lock the percentage of their rewards matching their desired tier.

Using existing locks as a funding source enables merging locks with the same attributes, which reduces the overhead of managing these locks.

##### Example: Increase FA lock

Assume that `A` locks 10k CC for `X` using staking app `S`, which is represented by:

* FA Lock with:
  * contract-id: `cid1`
  * lock owner: `A`
  * lock subject: `X`
  * amount: 10k CC
  * substitution controllers: `{S}`

Assume that `A` would like to stake an additional 5k CC. They cannot do so by creating a new lock, as that would violate the minimum lock amount. However, they can request the following topup:

* Topup with
  * topup target: `cid1`
  * topup amount: 5k

This topup request will immediately succeed and result in:

* FA Lock with:
  * contract-id: `cid1`
  * lock owner: `A`
  * lock subject: `X`
  * amount: 15k CC
  * substitution controllers: `{S}`

##### Example: Merge FA Locks

Assume that `A` agreed to substitute five existing FA locks over 1M CC each for lock subject `X` using staking app `S`. They thus have five FA locks of the form:

* FA Lock with:
  * contract-id: `cid_i` for 1 <= `i` <= 5
  * lock owner: `A`
  * lock subject: `X`
  * amount: 1M CC
  * substitution controllers: `{S}`

They can merge all of them into a single lock by requesting:

* Topup with
  * topup target: `cid1`
  * lock merge inputs: `[cid2, cid3, cid4, cid5]`

The result is:

* FA Lock with:
  * contract-id: `cid1`
  * lock owner: `A`
  * lock subject: `X`
  * amount: 5M CC
  * substitution controllers: `{S}`

This can for example be useful to prepare for an upcoming substitution of 2.5M CC, which otherwise would have to be executed as three individual substitutions against three 1M CC locks.

##### Example: Mint Locked SV Rewards

Assume that an SV `ExampleSV` uses party `A` to lock the required funds for their SV right, and they target to earn 100% of their SV rights. At the start of the weight enforcement period this requires them to lock 70% of their SV rewards. They set up their SV right such that their SV reward coupons all specify party `A` as the beneficiary.

Thus every round they have:

* SV Lock with:
  * contract-id: `cid1`
  * lock owner: `A`
  * lock subject: `ExampleSV`
  * amount: `<current-amount>` CC
* SV reward coupon with:
  * contract-id: `cid2`
  * round: `<r>`
  * beneficiary: `A`
  * weight: `<example-weight>`

The minting automation for party `A` can issue the following topup request to mint the SV reward coupon and lock 70% of the minted CC:

* Topup with
  * topup target: `cid1`
  * SV reward coupons: `[cid2]`
  * reward locking percentage: `70%`

The request will immediately succeed and result in:

* SV Lock with:
  * contract-id: `cid1`
  * lock owner: `A`
  * lock subject: `ExampleSV`
  * amount: `<current-amount> + <round r issuance per SV weight> * <example-weight> * 0.7` CC
* payout of liquid CC of `<round r issuance per SV weight> * <example-weight> * 0.3`

#### Minimum Lock Amount

Similar to lot sizes in TradFi, FA and SV locks must lock a minimum amount configured by SV voting (default 10k CC). This minimum amount serves to avoid users creating “dust locks” whose management overhead exceeds their value.

The minimum amount restriction is enforced on all actions that create additional locks; e.g., when doing a partial unlock or a partial substitution both of the resulting locks must be larger than the minimum amount. Actions that archive at least one existing lock and result in a single new lock are allowed to produce locks with an amount below the minimum. For example, it is always possible to substitute or unlock the whole lock amount or to merge existing locks, even if the SVs voted to increase the minimum lock amount after the locks were created.

Note that new SVs will need to lock the minimum lock amount once they are onboarded to avoid [losing their SV weight as shown in this example](#example-temporary-loss-of-reward-weight).

#### Compatibility Mode Lifecycle

Funds owners whose wallets do not support the TSv2 allocation APIs can use TSv1 two-step transfers to create a lock whose unlocking, substitution, and withdrawal is controlled by the funds owner itself.

They do so by initiating a TSv1 transfer to a special party with a memo tag that names the lock subject. Concretely, the parameters for the different types of locks are:

* SV lock:
  * receiver: `cip-<xxx>_sv-lock::1220000000000000000000000000000000000000000000000000000000000000abcd`
  * memo tag: `lock-subject=<SV rights owner name>`
* FA lock:
  * receiver: `cip-<xxx>_fa-lock::1220000000000000000000000000000000000000000000000000000000000000abcd`
  * memo tag: `lock-subject=<fa-party-id>`
* Provisional FA lock:
  * receiver: `cip-<xxx>_provisional-fa-lock::1220000000000000000000000000000000000000000000000000000000000000abcd`
  * memo tag: `lock-subject=<fa-party-id>`

The SV rights owner names correspond to the names that are currently specified in [`approved-sv-id-values.yaml`](https://github.com/canton-foundation/configs/blob/main/configs/MainNet/approved-sv-id-values.yaml). Only minimal fat-finger error protection is provided: they only check that (a) the memo tag field starts with `lock-subject=`, (b) the parsed SV rights owner names consist of alphanumeric characters and hyphens (`-`), and (c) the FA parties are registered parties on the global synchronizer. It is the responsibility of the funds owner to specify the right values.

The funds owner can always request unlocking the funds by withdrawing the transfer offer. It immediately starts vesting. The transfer offer itself continues to be shown in the wallet, but with a changed state that reports that the funds are vesting.

The funds owner can withdraw the vested funds by calling withdraw on the transfer offer again. If all funds have vested, the transfer offer is archived. Otherwise it remains in the wallet, but with a transfer offer amount reduced by the amount of funds that have vested and were paid out.

The status of a lock is reported as a prefix in the memo tag of the transfer offer.
The prefix is `lock-status=<status>&` where `<status>` can be one of the following:

* `locked`: the funds are currently locked and are counted towards the lock threshold
* `vesting-until-<end-time>`: the funds are vesting until the specified end time

For example, the memo tag `lock-status=locked&lock-subject=ExampleSV` indicates that the funds are
currently locked for `ExampleSV` and count towards their lock threshold.


##### Limitations

The limitations of the compatibility mode are the following:

1. no support for custom unlock, substitution, and vesting controllers
2. no support for substitution
3. no support for topups, merges, and locked SV reward minting
4. the locks show as long-lived transfer offers in the wallet UI
5. extra metadata must be provided to guarantee a 24h prepare-submission delay
  (see [Compatibility Mode Details](#compatibility-mode-details))

### Automatic Enforcement of FA Underlocking

We propose to implement automatic enforcement of FA underlocking using the following three mechanisms, which we explain below:

1. Configuring the minimum lock threshold for an FA right
2. Enforcing underlocks on-chain
3. Detecting underlocks and triggering on-chain enforcement using SV automation

We propose to configure minimum lock thresholds using a combination of a network-wide threshold and an FA specific override. Both are set using SV voting. To minimize the number of votes required to set the right thresholds, we propose to default the network-wide threshold to 5M CC and use votes to override the thresholds of featured asset issuers to the required 25M CC.

To increase operational flexibility, we propose to enforce underlocks with a 7 day grace period
(configurable using SV voting) that works as follows:

1. **Immediate suspension:** while an FA is underlocked, it is suspended, which means that it no longer creates featured app markers nor does it participate in traffic-based app rewards for rounds opened while it is suspended.
2. **Permanent loss:** if the underlock remains active for more than the 7 day grace period, then the FA status is permanently lost.

Underlocks are detected by SV automation that regularly computes the totals of all non-provisional FA locks, and compares them against the required thresholds. If an underlock is detected, then the automation triggers the on-chain action that implements the enforcement described above.

#### Example: Suspension and Recovery

Assume asset provider `X` has the following FA right and FA lock:

* FA Right:
  * provider: `X`
  * minimum lock amount override: 25M CC
* FA Lock:
  * lock owner: `X`
  * lock subject: `X`
  * amount: 25M CC
  * unlock controllers: `{X}`

For some reason `A` decides to unlock 5M CC at `t0`, which results in:

* Vesting lock:
  * lock owner: `X`
  * amount: 5M CC
  * vesting start: `t0`
  * vesting end: `t0 + 60 days`
* FA Lock:
  * lock owner: `X`
  * lock subject: `X`
  * amount: 20M CC
  * unlock controllers: `{X}`

A few seconds later at `t1 > t0`, the SV node automation detects the underlock and triggers the on-chain enforcement, which results in:

* updated FA Right:
  * provider: `X`
  * minimum lock amount override: 25M CC
  * underlocked: `True`
  * underlock becomes permanent at: `t1 + 7 days`

The effect of this change is that transactions that attempt to use this FA right to create featured app markers succeed, but do not create any app markers; and the computations recording traffic-based app activity records no longer consider `X` a featured app for rounds that open after `t1`.

A day later, app provider `X` asks funds owner `A` to lock 5M CC in exchange for some interest, which results in the following additional lock:

* FA Lock:
  * lock owner: `A`
  * lock subject: `X`
  * amount: 5M CC
  * unlock controllers: `{A}`

A few seconds later, the SV node automation detects the underlock recovery and reports this on-chain, which results in:

* updated FA Right:
  * provider: `X`
  * underlocked: `False`
  * minimum lock amount override: 25M CC

Thus the FA right again creates featured app markers and is respected in the computations for traffic-based app activity records for rounds that open after this time.

#### Example: Permanent Loss

Assume that in the above example `X` does not manage to get somebody to lock the 5M CC before `t1 + 7 days`. In that case, SV automation will trigger the archival of the FA right, and its loss becomes permanent.

No automatic unlocking of funds happens. However `X` can unlock their remaining 20M CC, which will then result in a 60 day Vesting Lock.

### Automated SV Reward Locking

We propose to extend the reward minting automation of validator nodes to mint a percentage of SV rewards directly in locked form by [topping up an existing lock](#topups-merges-and-minting-locked-sv-rewards). Concretely, we expect validator nodes to accept a configuration as shown in the following example:

```textproto
canton.validator-apps.validator_backend {
  reward-minting-config-by-party = {
    "alice::1220abc...def" = {
      sv-reward-minting-config-by-sv-name = {
        "ExampleSV1" = {
          # Mint 70% of SV rewards for "ExampleSV" in a lock for them
          mint-locked-percentage = 0.7
        }
        "ExampleSV2" = {
          # Do not mint coupons for "ExampleSV2", as their minting is
          # handled by automation outside the validator node.
          skip-minting = true
        }
      }
  }
}
```

The second config option shown for `ExampleSV2` serves to handle cases where an SV uses a third-party automation to mint their coupons. It avoids having validator node automation compete with that third-party automation.

For the minting automation to work for `ExampleSV1`, it must hold that:

1. `ExampleSV1` configures `alice::1220abc...def` as an SV reward beneficiary on the SV node that hosts `ExampleSV1`.
2. There exists an SV lock with lock owner `alice::1220abc...def` and lock subject `ExampleSV1`.
3. The `alice::1220abc...def` party is hosted in at least observer mode on the validator node running the automation.
4. In case `alice::1220abc...def` is an external party, their owner has set up a minting delegation with a party hosted on the validator node running the automation.

If all of these conditions are met, then every minting round 70% of the SV rewards received by `alice::1220abc...def` will be added to the existing lock, and the remaining 30% will be minted as liquid CC owned by `alice::1220abc...def`.

#### Example: Single Beneficiary Configuration

We expect SVs with a single beneficiary party to run this minting automation with the target percentage set to the tier they are aiming for; and adjust that percentage once a year when the tier locking requirement is reduced.

#### Example: Multi-Beneficiary Configurations

SVs with multiple beneficiaries have two kinds of options for how to automate the locking of newly minted SV rewards. They can either configure their beneficiaries such that there's a single beneficiary that locks all their required SV rewards, or they can ask each beneficiary to lock the required percentage.

### Termination of the SV Lock-Up Requirement

[CIP-0105](../cip-0105/cip-0105.md#5-sv-locking-and-sv-weight-schedule) requires that “The Lock-up requirement will automatically terminate 30 days after the date of next step down in rewards/halving currently forecast to occur late summer 2029.” We propose to implement that as follows:

1. Add a new configuration parameter `svLockingDeactivatesAfter : RelTime` configurable by SV voting. This time is measured relative to the opening of the very first round of the network. Its default value is 5 years and 30 days, as the next halving happens 5 years after network start (see the [Minting Curve in the Canton Coin whitepaper](https://www.canton.network/hubfs/Canton%20Network%20Files/Documents%20\(whitepapers%2C%20etc...\)/Canton%20Coin_%20A%20Canton-Network-native%20payment%20application.pdf)).
2. Change the unlock and withdrawal operations for SV locks such that they unlock the full amount of funds after that timepoint.

### Automatic Enforcement of SV Underlocking

We propose to add SV node automation that automatically enforces the temporary and permanent loss of SV weight per the rules defined in [CIP-0105](../cip-0105/cip-0105.md#6-under-locked-sv-weight-enforcement). The implementation requires building on the proposal from IntellectEU to move [SV weight management fully on-ledger](https://docs.google.com/document/d/1L1cM3m8_8R7x7Vr6vTolwDgS9x2pyFQsaG1gGci3lLE/edit?tab=t.0#heading=h.j1o9vy5fqmrz). The implementation further requires:

1. **adding new configuration parameters:** for the weight schedule, the activation time of on-chain enforcement of SV locking, and the grace periods for temporary and permanent loss of SV weight. They can all be changed by SV voting.
2. **tracking of newly minted SV rewards on-chain:** once the activation time of on-chain SV locking enforcement is past, minting SV rewards creates SV-mint-receipt contracts that are used by the SV node automation to track changes to an SV's lifetime rewards. They are created both for normal SV rewards and milestone rewards. These contracts are automatically merged by SV automation to keep their number constant.
3. **storing historic SV reward totals on-chain:** for every SV rights owner the total lifetime rewards earned prior to activating on-chain SV locking enforcement are stored on-chain. These values are set using SV voting.
4. **on-chain enforcement of underlocks:** extend per-SV state to track underlock events and their grace periods, so that both temporary and permanent weight losses are respected when creating SV reward coupons. As shown in [Example 3 of CIP-0105](../cip-0105/cip-0105.md#6-under-locked-sv-weight-enforcement), recovery from underlocks is immediate as soon as an SV qualifies for a higher tier.
5. **off-chain automation to detect and enforce underlocks:** extend the SV node automation to reconcile at least once per round each SV’s on-chain weight adjustment against the weight adjustment warranted based on the weight schedule, the total locked amounts, and their lifetime rewards.

The bulk of this implementation consists of complex, but purely technical changes to SV node automation, the Daml code for DSO governance, and the Daml code for SV reward coupon creation and minting. From a business-level perspective, the key aspect is how the grace periods work, which we illustrate in the examples below.

#### SV Right Owner to SV Node Operator Relationship

Automated enforcement relies on the [change to move SV weight management on-chain](https://docs.google.com/document/d/1L1cM3m8_8R7x7Vr6vTolwDgS9x2pyFQsaG1gGci3lLE/edit?tab=t.0#heading=h.j1o9vy5fqmrz). That change introduces an on-chain representation of all SV rights, which records both the SV weight for a given SV right, and the SV node operator hosting the right and driving SV reward coupon creation for it.

Note that there’s the following [special stipulation in CIP-0105](../cip-0105/cip-0105.md#4-sv-locking-requirement):

> For any organization that has or does operate more than one Super Validator, the lock up calculation is based on the aggregate lifetime earnings of any/all operating SVs. Any reduction in weighting will apply to total SV Weight for that organization. For the avoidance of doubt this provision applies to SVs identified as Digital-Asset-1, Digital-Asset-2 Cumberland-1 and Cumberland-2.

To handle that stipulation, we propose to add the notion of an optional ultimate SV rights owner to on-ledger SV right representation. If not set, then the SV rights owner is considered the ultimate SV rights owner. All computations that determine underlocks always aggregate locks, lifetime rewards, and weights for the ultimate SV rights owner.

##### Example: Digital Asset SV Right Configuration

One configuration option for the nodes operated by Digital Asset is as follows: split the total weight across the two SV rights “Digital-Asset-1” and “Digital-Asset-2”. Each of them is assigned to its own node, which is responsible for the coupon creation of its weight. Name “Digital-Asset” as the ultimate SV right owner on both of these SV rights, and create the SV locks with the lock subject “Digital-Asset”.

In case of an underlock, the enforcement will happen on-chain by modifying both SV rights.

#### Example: Temporary Loss of Reward Weight

Assume there’s an SV right owner named `ExampleSV` onboarded with weight 10. Assume further that they use party `A` to receive rewards, and that they were onboarded after on-chain SV locking enforcement was activated. Their reward state is:

* SV Reward State:
  * SV name: `ExampleSV`
  * SV beneficiaries: `100%` for `A`
  * weight: 10
  * lifetime rewards before on-chain enforcement: 0 CC

Assume that the next open round is `r` and the SV node hosting `ExampleSV` triggers reward coupon creation, which results in:

* SV Reward State:
  * SV name: `ExampleSV`
  * SV beneficiaries: `100%` for `A`
  * weight: 10
  * lifetime rewards before on-chain enforcement: 0 CC
  * last round collected: `r`
* SV Reward Coupon:
  * round: `r`
  * weight: `10`
  * SV name: `ExampleSV`
  * beneficiary: A

Once `A` mints this coupon, the results are:

* payout of `10 * (issuancePerSvWeight for round r)` CC to `A`
* SV Reward Mint Receipt
  * amount: `10 * (issuancePerSvWeight for round r)`
  * SV name: `ExampleSV`

The SV node automations include the mint receipt in their computation of lifetime rewards. They thus detect that `ExampleSV` is underlocked at `t1` and update the on-chain reward state to:

* SV Reward State:
  * SV name: `ExampleSV`
  * SV beneficiaries: `100%` for `A`
  * weight: 10
  * lifetime rewards before on-chain enforcement: 0 CC
  * last round collected: `r`
  * temporary adjustment schedule: `0%` after `t1 + 7 days`
  * permanent adjustment schedule: `0%` after `t1 + 30 days`

The adjustment schedules store the deadlines after which the reward weight used for coupon creation is adjusted to X% of the full weight. Coupon creation always uses the smallest temporary or permanent adjustment that is in effect.

Seven days later, the temporary 0% adjustment comes into effect and the SV reward coupons stop being created for `ExampleSV`. The owners of `ExampleSV` realize they need to lock funds to continue earning rewards. They organize funding and lock the minimum lock amount of 10k CC for their SV, which results in:

* SV Lock:
  * lock owner: `A`
  * lock subject: `ExampleSV`
  * amount: 10k CC

The SV node automations detect that `ExampleSV` qualifies for Tier 1, and update the rewards state to:

* SV Reward State:
  * SV name: `ExampleSV`
  * SV beneficiaries: `100%` for `A`
  * weight: 10
  * lifetime rewards before on-chain enforcement: 0 CC
  * last round collected: `r + 7 * 24 * 6`
  * temporary adjustment schedule: none
  * permanent adjustment schedule: none

Thus the reward adjustment schedules are cleared and `ExampleSV` starts earning full rewards again.

#### Example: Permanent Loss of Reward Weight

Assume that in the prior example, the `ExampleSV` already had lifetime earnings of 1M CC and their initial rewards state is:

* SV Reward State:
  * SV name: `ExampleSV`
  * SV beneficiaries: `100%` for `A`
  * weight: 10
  * lifetime rewards before on-chain enforcement: 1M CC

After the underlock is enforced by SV automation at `t1`, their reward state is:

* SV Reward State:
  * SV name: `ExampleSV`
  * SV beneficiaries: `100%` for `A`
  * weight: 10
  * lifetime rewards before on-chain enforcement: 1M CC
  * temporary adjustment schedule: `0%` after `t1 + 7 days`
  * permanent adjustment schedule: `0%` after `t1 + 30 days`

Assume that at `t1 + 10 days`, they lock 450k CC, i.e., they qualify for Tier 2 that earns 60% of the weight. After the SV automation runs, the new on-chain state is:

* SV Lock:
  * lock owner: `A`
  * lock subject: `ExampleSV`
  * amount: 450k CC
* SV Reward State:
  * SV name: `ExampleSV`
  * SV beneficiaries: `100%` for `A`
  * weight: 10
  * lifetime rewards before on-chain enforcement: 1M CC
  * temporary adjustment schedule: `60%` after `t1 + 7 days`
  * permanent adjustment schedule: `60%` after `t1 + 30 days`

Note that neither of the two deadlines are fully reset, as `ExampleSV` was underlocked at Tier 2 already since `t1`. Thus the temporary 60% adjustment to their rewards applies and they only earn 60% of their weight. Note that both 0% underlock deadlines were removed, which reflects that recovery is immediate upon locking funds that qualify an SV for a higher tier.

Assume that at `t1 + 20 days`, they unlock 100k CC, which implies that a lock of 350k CC remains. They thus only qualify for Tier 3 that earns 40% of their weight. The resulting reward state is:

* SV Reward State:
  * SV name: `ExampleSV`
  * SV beneficiaries: `100%` for `A`
  * weight: 10
  * lifetime rewards before on-chain enforcement: 1M CC
  * temporary adjustment schedule:
    * `60%` after `t1 + 7 days`
    * `40%` after `t1 + 20 + 7 days`
  * permanent adjustment schedule:
    * `60%` after `t1 + 30 days`
    * `40%` after `t1 + 20 + 30 days`

Note that the 40% underlock deadlines start at `t1 + 20` days, which is 20 days later than the 60% underlock deadlines. This reflects that the locking at 60% recovered the 0% underlock, even though it happened less than 30 days ago.

After `t1 + 30 days`, the 60% weight reduction becomes permanent. We can see this by looking at the example where `ExampleSV` increases their locks to 700k CC and would thus in principle qualify to earn 100% of their rewards. Their new reward state becomes:

* SV Reward State:
  * SV name: `ExampleSV`
  * beneficiaries: `100%` for `A`
  * weight: 10
  * lifetime rewards before on-chain enforcement: 1M CC
  * temporary adjustment schedule: none
  * permanent adjustment schedule:
    * `60%` after `t1 + 30 days`

Note that both the temporary adjustment deadlines and the permanent deadline that is still in the future are removed. However the permanent deadline that is already in the past remains effective, and the `ExampleSV` thus permanently only earns 60% of their SV weight.

## Incremental Delivery Plan

We propose an incremental delivery that focuses first on on-chain enforcement of locks and then on improving the UX for maintaining these locks. Concretely, we propose the following increments of the features specified in the [High-Level Specification](#high-level-specification):

1. **Compatibility mode for SV locks:** implement the compatibility mode based on the TSv1 APIs for creating SV locks. Locks must always lock an SV determined minimal amount of CC.
2. **Compatibility mode for FA locks:** implement the compatibility mode based on the TSv1 APIs for creating (provisional) FA locks; and add SV automation to convert provisional into full FA locks once the corresponding featured app right is created.
3. **Basic SV and FA locks and non-default controllers:** add support to use the TSv2 APIs to interact with SV and (provisional) FA locks and to create SV and (provisional) FA locks with custom controllers for unlocking, substitution and withdrawal.
4. **Substitution for SV and FA locks:** add support to use the TSv2 APIs to propose substitutions of (vesting) SV and FA locks as described in the section on [Substitution](#substitution).
5. **Topups and Merges for SV and FA locks:** add support to use the TSv2 APIs to execute topups and merges including the ability to mint SV rewards directly in locked form into an existing SV lock.
6. **Automatic enforcement of FA underlocking:** FA underlocks are tracked and automatically enforced after a seven day grace period.
7. **SV lock top-up automation:** extend the minting automation of validator nodes to mint a target percentage of SV rewards in locked form.
8. **Termination of SV lock-up requirements:** allow SVs to vote on terminating the SV lock-up requirement upon which all funds can be fully withdrawn without any vesting from both SV locks and vesting SV locks.
9. **Automatic enforcement of SV underlocking:** SV lifetime rewards are tracked on chain and used to detect SV underlocks. SV nodes run automation that enforces both temporary and permanent weight changes on-chain.

### Migration to On-Chain Enforcement of SV Locks

Analogous to the incremental delivery, we propose to incrementally move the enforcement of SV locks on-chain:

1. **Require on-chain SV locks:** once the compatibility mode for SV locks is live on MainNet, the dashboards used by the foundation to determine total SV lock amounts are adjusted to distinguish on-chain locked CC and custodially locked CC. Once that is in place, the SVs are given 30 days to transition their SV locks to consist solely of on-chain locked CC. They use their TSv1 wallets to do so.
2. **Relieve SVs of manual top-ups and improve tax efficiency:** once “SV lock top-up automation” is delivered, SVs can adjust their configuration of beneficiaries and SV reward minting to automatically mint the required amount of SV rewards in locked form.
3. **Relieve foundation of SV lock weight enforcement:** once “Automatic enforcement of SV underlocking” is delivered to MainNet, the foundation enables this in three steps:
   1. They create an SV vote to activate the on-chain enforcement of SV underlocking.
   2. Once that is activated at time `t`, they use their dashboards to determine the lifetime SV rewards up to time `t` and reflect that on-chain by creating corresponding SV votes.
   3. Once all lifetime rewards have been reflected on-ledger, the foundation can stop monitoring and enforcing SV underlocks via manual SV votes.

Note that in Step 1, the SVs can create and manage their locks using any TSv1 wallet with support for two-step transfers. They will be able to use substitutions, as soon as the “Substitution for SV and FA locks” feature lands on MainNet and their wallets support substitution either directly or via TSv2 support with generic extended metadata.

### Migration to On-Chain Enforcement of FA Locks

Analogous to the incremental delivery, we propose to incrementally move the enforcement of FA locks on-chain:

1. **Require on-chain FA locks:** the foundation switches their dashboards to also incorporate on-chain FA locks in the total locked amounts. Once the feature set of FA locks on MainNet is sufficient for staking apps to transition their funds, the FA operators and staking apps are given 30 days to transition their FA locks to on-chain locks.
2. **Relieve foundation of FA lock enforcement:** once “Automatic enforcement of FA underlocking” goes live on MainNet the foundation can stop monitoring and enforcing FA underlocks via manual SV votes.

We propose that the feature set considered for Increment 1 consists of the FA lock compatibility mode, basic FA locks with custom controllers, and substitutions. We propose that topups and merges of FA locks are not a strict requirement, but should be delivered soon thereafter.

## Technical Specification

The subsections within this technical specification provide additional details on implementation aspects relevant to the integration of governance locks with wallets or apps. They rely on the full high-level specification as context, and where possible they refer to code of the [Reference Implementation](#reference-implementation) to avoid duplicating technical details.

### Metadata Usage

In the context of this CIP, metadata is used in three distinct ways:

1. **Passing extra choice parameters:** actions on locks like unlocking a partial amount require passing in the amount to the `V2.Allocation_Withdraw` choice ([code](https://github.com/canton-network/splice/blob/ce85b796223b92267877a79a76ab6bb3b5a9949a/token-standard/splice-api-token-allocation-v2/daml/Splice/Api/Token/AllocationV2.daml#L304-L330)). This is done by encoding the amount under the `cip-<xxx>/unlock-amount` key in the `extraArgs.meta` field of the choice.
2. **Communicating lock-specific data:** wallets retrieve locks using the `V2.AllocationView`. Lock-specific data like the lock subject are encoded in their `meta` fields under keys prefixed with `cip-<xxx>/`, so that wallets can parse and show it to their users.
3. **Storing app-specific data on locks:** apps may need to store additional data (e.g., an app internal identifier) on a lock in a way that persists across changes to the lock. They can do so by storing that data in the `.meta` field of the `V2.AllocationSpecification` ([code](https://github.com/canton-network/splice/blob/ce85b796223b92267877a79a76ab6bb3b5a9949a/token-standard/splice-api-token-allocation-v2/daml/Splice/Api/Token/AllocationV2.daml#L98-L139)) that they pass when creating a lock. The implementation guarantees to carry along this metadata on governance locks unchanged.

All metadata keys used in this CIP are prefixed with `cip-<xxx>/`. We refrain from listing the keys for all lock data and actions in the CIP text itself. We instead refer to the reference implementation here.

This CIP also depends on the following support for encoding contract-ids as extended metadata.

#### Support for Extended Metadata

Normal Token Standard metadata ([code](https://github.com/canton-network/splice/blob/ce85b796223b92267877a79a76ab6bb3b5a9949a/token-standard/splice-api-token-metadata-v1/daml/Splice/Api/Token/MetadataV1.daml#L53-L66)) does not support storing (lists of) contract-ids, as Daml does not support conversions between `Text` and `ContractId` values for technical reasons. Substitutions and top-ups require passing in such values. We propose to do so using the following generic approach that builds on the `ChoiceContext` and `AnyValue` types from the `splice-api-token-metadata-v1` package ([code](https://github.com/canton-network/splice/blob/99e962c4f4162e783d50ca4b9cf4202ddd4befb7/token-standard/splice-api-token-metadata-v1/daml/Splice/Api/Token/MetadataV1.daml#L10-L47)).

Contract-id metadata is passed in via the `context : ChoiceContext` field in the `ExtraArgs` of the token standard choices. They are stored under the key `cip-<xxx>/cid-meta` as an `AV_Map` value containing mappings from metadata keys to `AV_ContractId` or `AV_List` values.

Whether these values are parsed depends on whether a choice implementation path that requires them is selected by the caller via normal metadata. Callers that do so MUST always overwrite the `cip-<xxx>/cid-meta` key in the choice context returned from the off-ledger API of the token standard registries to avoid that a dishonest off-ledger API overwrites their preferred value.

### Controller Consensus on Withdrawal and Unlock Times

Withdrawing vested funds requires passing in the timepoint up to which the vested funds are computed, which must be in the past. When authorization from multiple vesting controllers is gathered in multiple steps, each step may come with its own timepoint. These timepoints are accumulated in a way that maximizes the benefit of the funds owner: for withdrawal, the timepoints are combined into the time of withdrawal by taking the latest timepoint.

The same concern applies to unlocking, which requires passing in the timepoint as of which vesting starts. This timepoint must be in the future. For unlocking, the timepoints from separate authorizations are combined into the actual vesting start point by:

1. Taking the earliest timepoint that is still in the future when the last required controller approves the unlock.
2. Restricting that timepoint to be no more than 24h in the future.

The second constraint is required to avoid a corner case where the last controller passes in a timepoint that is very far in the future.

### Compatibility Mode Details

#### Determining Time Parameters

As explained in the [prior section](https://lists.sync.global/g/cip-discuss/message/743), unlocking and withdrawal require extra time parameters. In compatibility mode, these timepoints may not be provided via extra metadata and the implementation must determine them on its own.

For transaction submission workflows that require human interaction (e.g., due to a four-eye principle), the Daml workflows should generally aim to support a 24h prepare-submission delay. We propose to use the following approach to get close to supporting that delay for unlocking and withdrawing locks in compatibility mode:

1. **Allow setting these timepoints via metadata:** users with wallets that support generic metadata can thereby set these timepoints appropriately for their expected prepare-submission delay.
2. **Heuristically determine these timepoints using a 24h quantization:** if no metadata is set, then use the `Transfer.requestedAt` field ([code](https://github.com/canton-network/splice/blob/ce85b796223b92267877a79a76ab6bb3b5a9949a/token-standard/splice-api-token-transfer-instruction-v1/daml/Splice/Api/Token/TransferInstructionV1.daml#L22)) as the basis to scan forward in time in 24h increments to find the latest timepoint in the past and the first timepoint in the future.

The heuristic makes use of `isLedgerTimeGE : Time -> Update Bool` ([docs](https://docs.canton.network/appdev/modules/m3-working-with-time#how-to-implement-time-constraints)). The effect is that the first multiple of 24h after `Transfer.requestedAt` becomes the upper bound for the submission time of the prepared transaction. Thus in unlucky cases such a transaction may expire quickly, but an immediate retry of its preparation will result in a transaction that is valid for close to 24h.

### Wallet Integration Concerns

#### Holding Display and Selection

Locked holdings with expired locks ([code](https://github.com/canton-network/splice/blob/3418ac7be124d75d58f79801fefbd1e7480ccb99/token-standard/splice-api-token-holding-v1/daml/Splice/Api/Token/HoldingV1.daml#L28-L35)) must be treated as unlocked holdings, i.e., they should be included in the available total supply and they should be used to fund transfers and other actions that require input holdings. Doing so ensures that fully vested holdings can always be used as funding as soon as they vest.

This concern is not specific to this CIP. It already applies to working with the locked holdings backing an expired token standard allocation or two-step transfer. We call it out here to ensure that wallet providers are aware of it.

#### Dual Interface Implementations

Governance locks created implement both the `V1.TransferInstruction` interface and the `V2.Allocation` interface. This implies that a TSv2 wallet might show them both in the list of pending transfer instructions and the list of allocations. We recommend that TSv2 wallets hide transfer instructions that are addressed to one of the three special parties used in the compatibility mode to reduce user confusion.

#### Integration Options

Wallets have two options for building full support for governance locks:

1. Support TSv2 allocations with generic extended metadata
2. Build governance lock specific UIs on top of the TSv2 allocation APIs

We describe both options in the sections below. It is up to wallet providers to choose the appropriate option based on their user-base, implementation synergies and priorities. The options are not conflicting, and some wallet providers may even end up implementing both.

##### Option 1: TSv2 Allocations with Generic Extended Metadata

Building support for TSv2 allocations means building the UIs to support the allocation workflows described in [CIP-112](https://lists.sync.global/g/cip-discuss/message/743). This work has independent value, as it enables wallet users to use applications that rely on their [more powerful functionality](https://lists.sync.global/g/cip-discuss/message/743).

For wallet users to use these UIs to interact with governance locks, the UIs must also support displaying and setting metadata on allocation specifications and views, and passing in generic extended metadata on allocation choices. This work also has independent value, as it enables wallet users to make use of this extension point for both governance locks as well as future extensions.

##### Option 2: Build Governance Lock Specific UIs

The drawback of Option 1 is that users must set the right metadata parameters on their own with minimal support from the wallet UI. Wallet providers may decide to improve on this by building custom forms for setting the right metadata parameters. They may also present the known metadata parameters for governance locks with better labels and rendering.

Building such custom UIs for governance locks improves the UX of their users that manage the locks themselves. It is less relevant for users that use a third-party staking app to lock their funds.

### New Network Configuration Parameters

This CIP introduces multiple new network configuration parameters that govern the behavior of governance locks and can be changed using SV voting. All of them are called out explicitly in the high-level specification section which they affect. A full listing of them together with their concrete names can also be found in the reference implementation here (TODO: link to the new config record(s), which include comments).

# Motivation

This CIP serves to align the stakeholders of [CIP-0105](../cip-0105/cip-0105.md) (SV Locking) and [CIP-0116](../cip-0116/cip-0116.md) (FA Locking) on the implementation of on-chain enforcement of SV and FA locking. It is motivated by the fact that the concrete mechanisms chosen to implement locking as well as their delivery timelines have a material impact on the network ecosystem in general and the operability of SVs, FAs, and staking apps in particular.

# Rationale

The business rationale for SV and FA locking and their vesting and underlock enforcement was already given as part of [CIP-0105](../cip-0105/cip-0105.md) and [CIP-0116](../cip-0116/cip-0116.md). Where we had to make design choices for this CIP, we optimized for the following priorities:

1. Transition to on-chain SV and FA locks as quickly as possible.
2. Maximize the total value locked on-chain.
3. Enable credit markets for SV and FA locks (e.g., staking apps) to be built.
4. Minimize the confusion of users using wallets to interact with locks.
5. Minimize the delivery cost of the implementation.

Note that Priority 3 is implied by Priority 2, as a well-functioning credit market makes it easier for FAs and SVs to fund their locking requirements. We call it out separately as it was a key priority in the design.

### Alternatives Considered

The above priorities also reflect in the following alternatives that we considered and rejected for particular implementation choices.

* **Use TSv2 exclusively:** building only one interface between wallets and governance locks would lower the implementation cost, but it would also delay the transition to on-chain SV locks until all of their custodians have implemented support for TSv2. Adding the compatibility mode accelerates the transition at low cost.
* **Allow substitutions to change the lock subject:** technically the substitution operation could also allow changing the lock subject, which would provide interesting flexibility to funds providers. However it likely would reduce the total value locked on-chain. For example, FA providers would have way less “skin in the game”, as they could just walk away from their current FA right, and transition their locked funds to a new FA party with a new right.
* **No grace period for permanent removal of underlocked FA rights:** CIP-0116 stipulates that “If locking falls below required thresholds, Featured App status is immediately removed.” Enforcing this strictly would imply that a single operational mistake on a single FA lock would make an FA provider lose their FA status and force them to go through the manual process of reapplying for it. We consider this unnecessary operational overhead, which is why this CIP proposes to immediately suspend the FA status on underlocking, but only permanently revoke it after a grace period.
* **Make topups a special case of substitutions:** from a technical perspective this would be well possible, as the arguments align well. We rejected this as these two operations are quite different in their intent, and combining them risks confusing users.
* **Switch SV reward minting flows to TBAR:** there were initial considerations of switching SV rewards minting to use the same off-ledger computations as the ones used for traffic-based app rewards. This would allow for slightly less delayed underlock enforcement, as it could be computed exactly as of round start instead of being delayed by about 30s. However the implementation effort for doing this switch is significantly higher than the one for adapting the existing SV reward minting flow.
* **No minimum lock amount:** the minimum lock amount requirement does complicate the operations of staking apps and it would be great to not have it. However without a minimum lock amount there’s a risk that staking apps do produce lots of small locks. A situation that’s similar to how some wallets used to produce lots of “dust” CC holdings, e.g., as part of marketing campaigns. Every lock does consume resources on SV nodes. A minimum lock amount avoids having to spend delivery resources on scalability problems resulting from “dust locks”.
* **Define a governance-lock specific Daml interface:** the metadata-based interface for interacting with governance locks requires staking apps to build extra decoding and encoding logic. Defining a governance-lock specific Daml interface would obviate the need for this logic. We do not do so, as we believe sharing the interface definitions with wallets and making use of the extension points in the token standard has lower overall delivery cost.

# Reference Implementation

The reference implementation for the Daml code is currently (Aug 28, 2026) being built as a stack of PRs on this Splice feature fork: [https://github.com/canton-network/splice-sv-fa-locking/pulls](https://github.com/canton-network/splice-sv-fa-locking/pulls)

The work is progressing along the Incremental Delivery Plan. See the list below for the links to the PRs and their status:

1. Creation, unlocking, and vesting for locks w/o custom controllers: [https://github.com/canton-network/splice-sv-fa-locking/pull/1](https://github.com/canton-network/splice-sv-fa-locking/pull/1)
2. Topups:
   1. funded with liquid CC [https://github.com/canton-network/splice-sv-fa-locking/pull/9](https://github.com/canton-network/splice-sv-fa-locking/pull/9)
   2. funded with SV rewards
   3. funded with existing locks for the same subject
3. TODO: add the other PRs

# Copyright

This CIP is licensed under CC0-1.0: Creative Commons CC0 1.0 Universal.

# Changelog

* Aug 28, 2026: Initial draft created.

* Sep 3, 2026: Incorporated review feedback:

  * automate termination of SV lock-up period
  * aggregate SV weight across multiple nodes operated by the same SV
  * change "withdrawal controllers" to vesting controllers
  * switch to specifying substitution targets by key instead of by contract-id.
