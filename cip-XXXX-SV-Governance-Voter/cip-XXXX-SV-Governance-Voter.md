<pre>
  CIP: ?
  Layer: Daml
  Title: SV Governance Voter Authority
  Author: Avro Digital (Eric Mann)
  Status: Draft
  Type: Standards Track
  Created: 2026-05-14
  License: CC0-1.0
</pre>

## Abstract

The current Splice SV governance flow uses the SV operator party as both the node-automation identity and the governance-voting identity. This CIP adds a first-class governance-voter authority path for a Phase 1 subset of non-operational votes.

The intended workflow has one active governance voter per SV, declared through an `SvGovernanceVoter` binding. That voter may open and cast or update the represented SV's vote on explicitly allowlisted non-operational requests. The single-active-binding shape is preserved by the consuming `RotateGovernanceVoter` lifecycle and the self-binding onboarding default; the template itself does not enforce that invariant at the contract level (see *Open Review Questions*). The operator path continues to handle operational requests and rejects governance-voter-eligible actions; the governance-voter path rejects everything else. The vote still counts as the SV's existing vote — it does not create a second voting unit.

The on-ledger surface is intentionally compatible with the external-party submission flow defined by [CIP-0103][cip-0103]: the governance-voter cast choice is controlled by the governance-voter party, takes plain contract IDs for the vote request and binding, and the binding is observable by the governance voter so it can be supplied as a disclosed contract. The dApp client, Scan-based discovery, and wallet/signing-provider choices live downstream of this CIP.

[cip-0103]: ../cip-0103/cip-0103.md

## Copyright

This CIP is licensed under CC0-1.0: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).

## Specification

This CIP covers the first contract slice needed for a separated SV governance-voter workflow: define the governance-voting authority model, classify Phase 1 vote actions, preserve one-vote-per-SV semantics, and submit a Daml reference implementation for maintainer review. The standalone dApp, Scan/read API packaging, wallet integration, deployment packaging, and UX hardening remain downstream work.

### Review Scope

The public review points for this CIP are:

- An SV-declared `SvGovernanceVoter` binding authorizes a governance voter to act only on governance-voter-eligible requests for the represented SV.
- `isGovernanceVoterAction` is a hardcoded Phase 1 allowlist; new action constructors remain operator-only until deliberately reviewed.
- The contract change is limited to the adjacent governance-voter module, `DsoRules` request/cast choices, vote attribution fields, and the vote map key.
- Both authority paths write the represented SV's single vote slot; attribution records who signed, not additional weight.
- The contract surface is compatible with explicit-disclosure submission by a governance voter and leaves production read/API packaging to downstream review.
- The reference implementation includes Daml tests for binding lifecycle, action taxonomy, strict role split, attribution, cooldown, deadlines, and one-slot tallying.

### Affected Contract Surface

The affected upstream surface is `daml/splice-dso-governance/daml/Splice/` in the [Splice](https://github.com/canton-network/splice) repository:

- `Splice/DSO/GovernanceVoter.daml` (new module) — `SvGovernanceVoter` template and `RotateGovernanceVoter` choice.
- `Splice/DsoRules.daml` — extended `Vote` record (with `castBy`, `castByRole`), `VoteCastRole` enum, `isGovernanceVoterAction` classifier, new `DsoRules_RequestGovernanceVote` and `DsoRules_CastGovernanceVote` choices, and the eligibility/deadline/attribution guards added to `DsoRules_RequestVote` and `DsoRules_CastVote`.

The following existing surfaces remain operator-controlled or otherwise stable:

- `DsoRules_RequestVote` — still operator-controlled; now rejects governance-voter-eligible actions and directs callers to `DsoRules_RequestGovernanceVote`.
- `DsoRules_CastVote` — still operator-controlled; now rejects governance-voter-eligible actions, requires the caller-supplied `Vote` to carry consistent operator attribution, and enforces an explicit request-deadline check.
- `DsoRules_ConfirmAction`, `DsoRules_ExecuteConfirmedAction`, `Confirmation`, `DsoRules_CloseVoteRequest`, `VoteRequest.trackingCid` — unchanged.

`DsoRules_CloseVoteRequest` continues to count at most one vote per represented SV using its existing semantics; the role attribution on `Vote` changes accountability, not weight.

### Governance-Voter Binding

The proposal adds a separate authority contract instead of storing governance-voter state on `SvInfo`. `SvInfo` describes SV membership and operational identity. The governance voter is related to the SV but is not the operator identity.

```daml
template SvGovernanceVoter
  with
    dso : Party
    sv : Party
    governanceVoter : Party
  where
    signatory sv
    observer  dso, governanceVoter

    ensure
         sv               /= dso
      && governanceVoter  /= dso

    choice RotateGovernanceVoter : RotateGovernanceVoterResult
      with
        newGovernanceVoter : Party
      controller sv
      do
        require "New governance voter must differ" (newGovernanceVoter /= governanceVoter)
        require "Governance voter must not be dso" (newGovernanceVoter /= dso)
        bindingCid <- create this with governanceVoter = newGovernanceVoter
        pure RotateGovernanceVoterResult with ..
```

Rules:

- `sv` is the sole signatory because the SV declares who may cast its non-operational vote. The relationship between the SV and the chosen governance voter is treated as offchain trust; Phase 1 does not require on-ledger acceptance by the prospective voter.
- `governanceVoter` is an observer so wallets and external participants can inspect the binding before signing, and so the binding can be supplied as a disclosed contract on a CIP-0103-conforming submission.
- `dso` is an observer so DSO-side workflows and read APIs can discover active bindings without elevating the DSO to a signatory.
- `governanceVoter == sv` is allowed and is the onboarding default. Every SV starts with a self-binding so the represented SV is always covered.
- `governanceVoter == dso` is rejected on both create and rotate; the DSO must never appear as an SV's governance voter.
- There is intentionally **no `Clear` choice**. "Returning control to the operator" is expressed as `RotateGovernanceVoter` back to the represented SV. Without a binding nobody would be authorized to cast on governance-voter actions for the represented SV, which has no useful semantics.
- `RotateGovernanceVoter` is a consuming choice. It does not call `archive self`; Daml archives the consumed binding when the new one is created. The reference implementation also rejects no-op rotations (`newGovernanceVoter /= governanceVoter`).
- There is intentionally **no contract key**. The intended workflow keeps one active binding per `(dso, sv)`, shaped by the consuming rotation lifecycle and the self-binding onboarding default. The template does not prevent the represented SV from bare-creating additional bindings for itself; the cast guard still records one vote per represented SV under last-writer-wins, so the residual risk is observability (cast log ambiguity) rather than tally integrity. Whether the workflow shape should be promoted to a contract-level invariant — via a contract key, a DSO-owned registry, or an explicit duplicate-create guard — is left as an open question for maintainer review (see *Open Review Questions*).
- Because `sv` is the sole signatory, the implicit per-signatory `Archive` choice lets the SV unilaterally archive any of its bindings. That is self-harm only — the SV temporarily loses the ability to cast on governance-voter actions and recovers by creating a new self-binding — and is left for the SV workflow to police rather than enforced at the contract level.

### Vote Attribution

`Vote` is extended to carry signer attribution alongside the existing fields. Tallying continues to use `Vote.sv` (the represented SV).

```daml
data VoteCastRole
  = VCR_Operator
  | VCR_GovernanceVoter
  deriving (Eq, Show)

data Vote = Vote with
    sv         : Party        -- represented SV whose vote slot is updated
    castBy     : Party        -- party that signed the cast
    castByRole : VoteCastRole -- authority path that wrote the slot
    accept     : Bool
    reason     : Reason
    optCastAt  : Optional Time
  deriving (Eq, Show)
```

Operator votes use `castBy = sv` and `castByRole = VCR_Operator`. Governance-voter votes use `castBy = governanceVoter` and `castByRole = VCR_GovernanceVoter`.

`VoteRequest.votes` is keyed by represented SV `Party` (the reference implementation changes the map from `Map.Map Text Vote` to `Map.Map Party Vote`). Both cast paths write into the same represented-SV slot using `Map.insert binding.sv recordedVote request.votes` (operator path uses `vote.sv`). `castByRole` changes attribution, not voting weight.

### Governance-Voter Action Classifier

The classifier is allowlist-based. New `ActionRequiringConfirmation` constructors do not become governance-voter-eligible by default; the classifier must be extended deliberately.

```daml
isGovernanceVoterAction : ActionRequiringConfirmation -> Bool
isGovernanceVoterAction action =
  case action of
    ARC_DsoRules dsoAction ->
      case dsoAction of
        SRARC_GrantFeaturedAppRight _ -> True
        SRARC_RevokeFeaturedAppRight _ -> True
        SRARC_SetConfig _ -> True
        SRARC_UpdateSvRewardWeight _ -> True
        SRARC_CreateUnallocatedUnclaimedActivityRecord _ -> True
        SRARC_OffboardSv _ -> True
        _ -> False
    ARC_AmuletRules amuletAction ->
      case amuletAction of
        CRARC_SetConfig _ -> True
        _ -> False
    _ -> False
```

Eligibility errors on the operator path use:

```text
"Action is governance-voter eligible; use DsoRules_RequestGovernanceVote"
"Action is governance-voter eligible; use DsoRules_CastGovernanceVote"
```

The symmetric errors on the governance-voter path use:

```text
"Action must be governance-voter eligible"                       -- on request
"Action is not governance-voter eligible; use DsoRules_CastVote" -- on cast
```

These are distinct from binding, authority, and request-state errors surfaced elsewhere in the cast logic.

### Vote Request Creation

The operator-path `DsoRules_RequestVote` choice gains an eligibility rejection so it cannot be used to open requests for governance-voter-eligible actions:

```daml
nonconsuming choice DsoRules_RequestVote : DsoRules_RequestVoteResult
  with
    requester          : Party
    action             : ActionRequiringConfirmation
    reason             : Reason
    voteRequestTimeout : Optional RelTime
    targetEffectiveAt  : Optional Time
  controller requester
  do
    require "Action is governance-voter eligible; use DsoRules_RequestGovernanceVote"
            (not (isGovernanceVoterAction action))
    -- ... existing operator-path behavior ...
```

A new symmetric choice handles governance-voter-eligible request creation:

```daml
nonconsuming choice DsoRules_RequestGovernanceVote : DsoRules_RequestGovernanceVoteResult
  with
    governanceVoter    : Party
    bindingCid         : ContractId SvGovernanceVoter
    action             : ActionRequiringConfirmation
    reason             : Reason
    voteRequestTimeout : Optional RelTime
    targetEffectiveAt  : Optional Time
  controller governanceVoter
  do
    require "Action must be governance-voter eligible" (isGovernanceVoterAction action)
    binding <- fetch bindingCid
    require "Binding dso must match rules dso" (binding.dso == dso)
    require "Caller must match binding governance voter"
            (governanceVoter == binding.governanceVoter)
    requesterName <- case binding.sv `Map.lookup` svs of
      None -> fail "Represented SV is not an SV"
      Some info -> pure info.name
    -- represented SV is taken from binding.sv;
    -- requester remains the represented SV display name for existing outputs;
    -- initial vote is recorded against binding.sv with VCR_GovernanceVoter.
```

The governance voter is the sole creator of a non-operational vote request, consistent with the design intent that operational voting remains an operator concern and non-operational voting belongs to the governance voter (which may be the SV itself under the self-binding default).

`DsoRules_RequestGovernanceVote` records an auto-accept initial vote for the represented SV (`castBy = binding.governanceVoter`, `castByRole = VCR_GovernanceVoter`, `accept = True`, reason "I accept, as I requested the vote.") mirroring the operator path's convention on `DsoRules_RequestVote`. The initial vote occupies the represented SV's slot in `VoteRequest.votes` and may be updated through `DsoRules_CastGovernanceVote` while the request is still open.

### Governance-Voter Cast Choice

The cast choice mirrors the request choice. It takes the same `Vote` record as the operator path so wallets and frontends can share serialization, and the choice itself canonicalizes `sv`, `castBy`, `castByRole`, and `optCastAt` before writing the slot:

```daml
nonconsuming choice DsoRules_CastGovernanceVote : DsoRules_CastGovernanceVoteResult
  with
    requestCid : ContractId VoteRequest
    bindingCid : ContractId SvGovernanceVoter
    vote       : Vote
  controller vote.castBy
  do
    requireWellformedVote config vote
    binding <- fetch bindingCid
    require "Binding dso must match rules dso"               (binding.dso == dso)
    require "Vote SV must match binding SV"                  (vote.sv == binding.sv)
    require "Vote signer must match binding governance voter"
            (vote.castBy == binding.governanceVoter)
    require "Vote signer role must be governance voter"
            (vote.castByRole == VCR_GovernanceVoter)
    -- represented SV must be active
    case Map.lookup binding.sv svs of
      None -> fail "Voter is not an SV"
      Some _ -> pure ()
    request <- fetchChecked (ForDso with dso) requestCid
    require "Action is not governance-voter eligible; use DsoRules_CastVote"
            (isGovernanceVoterAction request.action)
    now <- getTime
    let castDeadline = fromOptional request.voteBefore request.targetEffectiveAt
    require "Vote request has expired" (now < castDeadline)
    archive requestCid
    -- per-represented-SV cooldown using the slot's last cast time
    enforceCooldown ...
    let recordedVote = vote with
          sv         = binding.sv
          castBy     = binding.governanceVoter
          castByRole = VCR_GovernanceVoter
          optCastAt  = Some now
    create request with
      votes       = Map.insert binding.sv recordedVote request.votes
      trackingCid = Some (fromOptional requestCid request.trackingCid)
```

The governance-voter path is an explicit choice rather than an overload of the operator choice. Operator and governance-voter responsibilities are partitioned by the eligibility predicate (see *Operator Vote Path* below and *Strict Role Split*).

### Operator Vote Path

`DsoRules_CastVote` continues to work for operational actions. It gains attribution pre-validation, a request-deadline check, and the eligibility rejection that completes the strict role split:

```daml
nonconsuming choice DsoRules_CastVote : DsoRules_CastVoteResult
  with
    requestCid : ContractId VoteRequest
    vote       : Vote
  controller vote.sv
  do
    requireWellformedVote config vote
    require "Vote castBy must match SV on operator path"
            (vote.castBy == vote.sv)
    require "Vote castByRole must be VCR_Operator on operator path"
            (vote.castByRole == VCR_Operator)
    -- ... SV membership check ...
    request <- fetchAndArchive (ForDso with dso) requestCid
    require "Action is governance-voter eligible; use DsoRules_CastGovernanceVote"
            (not (isGovernanceVoterAction request.action))
    now <- getTime
    let castDeadline = fromOptional request.voteBefore request.targetEffectiveAt
    require "Vote request has expired" (now < castDeadline)
    -- ... per-SV cooldown + slot write ...
```

Operator-side callers that already construct votes correctly are unaffected. Callers that supplied wrong attribution values were relying on the previous silent server-side overwrite and now see an explicit failure rather than a misattributed vote.

### Strict Role Split

Each action class is partitioned into exactly one cast path:

- `isGovernanceVoterAction request.action == True` → the request is opened by `DsoRules_RequestGovernanceVote` and cast via `DsoRules_CastGovernanceVote`. The operator path rejects.
- `isGovernanceVoterAction request.action == False` → the request is opened by `DsoRules_RequestVote` and cast via `DsoRules_CastVote`. The governance-voter path rejects.

There is no operator override of a governance-voter vote, and no governance-voter override of an operator vote. The represented SV's vote slot can only be written through the path that owns the request's action class. This is a deliberate change from earlier drafts that allowed operator override on the shared slot.

### Authority Rules

The SV/operator path remains responsible for operational and automation-oriented actions:

- creating vote requests for operational actions,
- casting/updating votes for operational actions,
- confirming actions and executing confirmed actions,
- onboarding or activating SV membership,
- bootstrapping external-party or transfer infrastructure,
- running round lifecycle automation,
- ANS payment workflow actions,
- any action not listed by `isGovernanceVoterAction`.

The governance voter may open a request and cast or update the represented SV's vote only when all of these are true:

1. The represented SV has an active `SvGovernanceVoter` binding (onboarding establishes one by default).
2. The submitting party is the bound `governanceVoter`.
3. The vote request belongs to the same `dso`.
4. The represented SV is active in `DsoRules.svs`.
5. The action is allowed by `isGovernanceVoterAction`.
6. The request is still open (`now < castDeadline`).

The governance voter does not receive general SV authority. It receives only the authority to open and cast the SV's vote on the listed non-operational governance requests.

### Bootstrap And Lifecycle

Phase 1 onboarding initializes each SV with `governanceVoter == sv` (a self-binding). The SV's existing operator-led workflow keeps working without an explicit setup step; the long-term model with a distinct governance-voter party is reached via `RotateGovernanceVoter`.

Rotation applies at cast time. If the SV rotates from voter A to voter B while a request is open, voter B can update the represented SV's vote after the rotation; voter A cannot. A vote already cast by voter A remains valid as the represented SV's vote unless voter B updates it through the still-open request.

Returning control to the operator is expressed by rotating back to the represented SV. There is no separate `Clear` operation.

### One-Vote-Per-Node Semantics

This proposal does not change vote weight or tallying.

- `VoteRequest.votes` remains a per-represented-SV slot. The key changes from `Text` (SV display name) to `Party` (the represented SV), removing the dependence on display-name lookup during cast.
- Both the operator path and the governance-voter path write the represented SV's existing slot.
- Re-casting through either path updates the same slot under the existing request semantics, subject to the per-SV cooldown.
- `DsoRules_CloseVoteRequest` continues to count at most one vote per represented SV.
- There is no vote slot keyed by governance-voter party, wallet, user, or participant.

### Visibility And Read Assumptions

The write path is not enough. A governance voter must be able to inspect the proposal before signing and must have enough contract visibility on the submitting participant to exercise the ledger choice.

Phase 1 proposes the following visibility position:

- `SvGovernanceVoter` is visible to the governance voter by observer, so a CIP-0103-conforming Wallet can supply the binding as a disclosed contract.
- Proposal discovery and proposal-detail rendering are served through Scan or an SV-hosted read API rather than by making every proposal contract directly visible for browsing.
- The supported unaffiliated-voter submit path is explicit disclosure: the governance voter submits the target contract IDs together with the disclosed contracts needed to exercise `DsoRules_CastGovernanceVote`.
- SV-hosted submission or relay remains a valid deployment option, but it is not required by the on-ledger design.
- The remaining production decision is how Scan or an SV-hosted read API packages the proposal details and disclosed-contract material needed for review and submission, similar to the existing `AmuletRules` flow used by validators.

The exact `VoteRequest` read/disclosure packaging is the main remaining boundary case. This CIP claims compatibility with external participant submission and lists the production decision as a maintainer-owned open question rather than a hidden TODO.

### Security Considerations

- The governance-voter path rejects unsupported action constructors by default.
- Governance voters cannot exercise `DsoRules_ConfirmAction`, `DsoRules_ExecuteConfirmedAction`, or any operator-only operational choice.
- Both cast paths reject votes after the request's deadline (`now < castDeadline`, where `castDeadline = fromOptional voteBefore targetEffectiveAt`), matching documented `DsoRules_CloseVoteRequest` semantics.
- Both cast paths enforce a per-represented-SV cooldown to rate-limit rapid re-casts.
- The operator path pre-validates `vote.castBy` and `vote.castByRole` before recording, so caller-side attribution bugs surface immediately.
- Binding rotation is checked at cast time, not only at request creation.
- Audit records distinguish operator-cast and governance-voter-cast votes via `Vote.castBy` / `Vote.castByRole`.

## Motivation

Governance voting and node operations are different responsibilities.

The operator party runs or controls the SV node, signs automation commands, and participates in workflows such as confirmation and execution. A governance voter expresses the SV organization's governance intent on non-operational proposals. Those roles may be held by the same party during bootstrap, but the contract model should not require them to remain the same forever.

Today an SV-funded organization that wants direct, auditable governance participation must hold node-operator credentials. The status quo also offers no way to distinguish, in a vote record, whether a vote was cast through an operator-automation path or by a human governance representative.

This CIP separates governance voting from node operation on the ledger without redesigning either. The governance voter is a signer for the represented SV's vote on an explicit allowlist of non-operational actions, not a new voting unit. The SV remains the unit of voting weight; the cast simply carries an accountability stamp identifying which party signed it through which authority path.

## Rationale

The proposal keeps the first standards-track change narrow. It separates the governance-voting identity from the operator identity without changing voting weight, confirmation, execution, round automation, or broader governance process.

This CIP does not standardize the standalone governance dApp, wallet/provider selection, deployment packaging, mobile or notification workflows, generalized identity, multiple voters per SV, broad rights-holder voting, or tokenomics. Those topics belong to later milestones or separate governance decisions.

A separate `SvGovernanceVoter` contract is preferred over adding voter fields to `SvInfo` because it keeps membership and operational identity distinct from voting authority. It also gives Phase 1 a focused lifecycle for bootstrap and rotation.

Explicit `DsoRules_RequestGovernanceVote` and `DsoRules_CastGovernanceVote` choices are preferred over overloading the operator choices because the eligibility predicate partitions every `ActionRequiringConfirmation` into exactly one path. With strict role split, the represented SV's vote slot can only be written through the path that owns the request's action class, removing ambiguity about which authority just changed a vote.

The one-vote-per-node model is preserved by continuing to store the vote under the represented SV in `VoteRequest.votes`. The governance voter signs the SV's vote; it does not become a new voting unit. Changing the map key from `Text` to `Party` removes the indirection through `SvInfo.name` at cast time and makes the per-represented-SV slot identity unambiguous.

`SRARC_OffboardSv` is intentionally included in the Phase 1 allowlist because offboarding is a governance-membership decision rather than a node-operation decision. Review should focus on whether the high-impact path needs extra UI warnings, reason requirements, or tests, not on silently moving it back to the operator-only bucket.

### CIP-0103 Compatibility

[CIP-0103][cip-0103] defines the dApp-to-Wallet API. It does not prescribe on-ledger contract patterns, but it does establish that external parties submit via `prepareExecute` with `disclosedContracts`. The contract surface in this CIP is intentionally compatible with that flow:

- `DsoRules_CastGovernanceVote` is controlled by `vote.castBy` (the governance-voter party) and takes plain contract IDs (`requestCid`, `bindingCid`).
- The binding is observable by the governance voter, so it can be supplied as a disclosed contract by a CIP-0103-conforming Wallet.
- The cast does not require visibility on contracts unique to the SV node, so the governance voter can submit through a participant that is not the SV's participant once the read-side visibility model is settled.

`Requires: CIP-0103` is intentionally not asserted in the preamble: the on-ledger surface defined here is independently useful and does not depend on CIP-0103 being adopted. The relationship is one of compatibility, not dependence.

### Alternatives Considered

- **Store the governance voter on `SvInfo`.** Rejected because it couples governance voting to the operator/member record, broadens the disclosure surface of operator records, and complicates rotation.
- **Treat the governance voter as another SV/operator authority.** Rejected because it would blur voting and automation authority.
- **Encode multiple governance voters per SV at the ledger layer.** Rejected for Phase 1. Voting weight stays at the SV and multi-user organizations are expected to map several users onto the single governance-voter party at the dApp/UI layer rather than via multiple ledger bindings.
- **Use a contract key on `(dso, sv)` for the binding.** Earlier drafts proposed this. Splice maintainers prefer to avoid keys where possible, and the consuming rotation lifecycle already preserves the intended invariant under the recommended workflow. The reference implementation omits the key; whether the invariant should be promoted is left as an open question.
- **Propose-Accept on the binding.** Adds ceremony with no Phase 1 benefit; can be layered on later as a CIP amendment without invalidating the unilateral-declaration semantics.
- **Operator override on non-operational votes.** Earlier drafts allowed this on the shared slot. Rejected on review: operational votes should be cast only by the operator, and non-operational votes should be cast only by governance parties. The strict role split makes the partition unambiguous.
- **Configurable action allowlist.** Rejected: it would let governance voters vote to expand their own authority. The classifier is hardcoded in Daml and can only be extended via a package upgrade.
- **Depend only on transaction history for attribution.** Rejected because the vote record itself should identify whether the operator or governance-voter path cast the current vote.
- **`ClearGovernanceVoter` choice on the binding.** Earlier drafts had it. Removed: leaving the represented SV without a binding has no useful semantics, and "return control to the operator" is expressed cleanly as rotating back to the represented SV.

## Backwards compatibility

Existing SVs continue to operate through the current operator path for operational actions. Existing confirmation, execution, close, and automation flows stay in place.

Two `VoteRequest`/`Vote` shape changes and one choice-eligibility change deserve explicit treatment:

- **Active-contract shape changes.** `Vote` gains two non-optional fields (`castBy`, `castByRole`), and `VoteRequest.votes` changes key from `Map.Map Text Vote` to `Map.Map Party Vote`. Both are breaking shape changes that Splice package upgrades cannot rewrite in place. The recommended migration path is for the upgrading DSO to drain in-flight `VoteRequest` contracts (close or let expire) before activating the new package, after which every freshly created `VoteRequest` and `Vote` is written under the new shape directly. Where draining is not feasible, the `Vote` attribution fields may be introduced as `Optional` (`optCastBy`, `optCastByRole`) over a migration window with non-optional fields as the steady-state target; the `votes` map key change is harder to phase in and a brief governance-vote freeze is the simpler alternative. The reference implementation uses the post-migration shapes directly because it assumes the drain-and-upgrade path.
- **Operator path eligibility rejection.** `DsoRules_RequestVote` and `DsoRules_CastVote` now reject `isGovernanceVoterAction` constructors. Any caller that was opening or casting on such actions via the operator choices must migrate to `DsoRules_RequestGovernanceVote` / `DsoRules_CastGovernanceVote`. The migration is mechanical, and the onboarding default of self-binding means every existing SV has an available binding without explicit setup.
- **`VoteRequest.votes` read-side traversal.** With the key type now `Party`, frontends or read-side code that walked the map by SV display name must look up by the SV `Party` instead. `Vote.sv` remains the represented SV `Party`; tallying logic does not change.

The one-vote-per-SV tally is preserved exactly. `DsoRules_CloseVoteRequest` continues to count at most one vote per represented SV regardless of which path wrote it.

No tokenomics, fees, rewards, or amulet semantics are affected.

## Reference implementation

The Daml reference implementation lives in [canton-network/splice#5533](https://github.com/canton-network/splice/pull/5533). Relevant artifacts on the reference branch:

- `daml/splice-dso-governance/daml/Splice/DSO/GovernanceVoter.daml`
- `daml/splice-dso-governance/daml/Splice/DsoRules.daml`
- `daml/splice-dso-governance-test/daml/Splice/Scripts/TestGovernance.daml`
- `docs/src/sv_operator/sv_governance_voter.rst`

### Test matrix

| Concern | Test |
| --- | --- |
| Binding lifecycle (self → delegate → back to self), with single-binding-per-SV asserted at each step | `testSvGovernanceVoterBindingLifecycle` |
| Onboarding default self-binding | `testSvGovernanceVoterBindingLifecycle` |
| `governanceVoter == dso` rejected on create and rotate | `testSvGovernanceVoterBindingLifecycle` |
| Operator-only request only via operator path; governance-voter-only request only via governance-voter path | `testGovernanceVoterCastPath` |
| Operator-only cast only via operator path; governance-voter-only cast only via governance-voter path | `testGovernanceVoterCastPath` |
| Rotation invalidates previous governance voter | `testGovernanceVoterCastPath` |
| Action allowlist coverage across every supported/unsupported constructor | `testGovernanceVoterActionTaxonomy` |
| One vote per represented SV preserved across updates | `testVoteUpdateKeepsOneSlotPerSv` |
| Cast after `castDeadline` rejected on both paths | `testCastDeadlineExpiry` |
| Operator-path attribution pre-validation | `testOperatorCastAttributionGuards` |
| Per-SV cooldown | `testVoteCastingCooldown` |
| Offboarding the represented SV while a governance-voter request is open: subsequent `DsoRules_CastGovernanceVote` fails the "Voter is not an SV" check; the request expires naturally via `DsoRules_CloseVoteRequest`. | covered by combined membership/cast tests |

All tests in `splice-dso-governance-test-daml/damlTest` pass on the reference branch.

## Open Review Questions

- **Single-binding invariant enforcement.** The intended workflow preserves "one active binding per `(dso, sv)`" through the consuming rotation lifecycle and SV onboarding default, but the template permits the represented SV to bare-create additional bindings. Should the invariant be promoted to a contract key, a DSO-owned registry contract, or an explicit duplicate-create guard inside `DsoRules`? Splice maintainers should decide based on local conventions. `testGovernanceVoterDuplicateBindingsAmbiguity` in the reference implementation pins the current last-writer-wins behavior so any future tightening has a concrete baseline.
- **`SvGovernanceVoter` creation guard.** `sv` is the sole signatory, so an arbitrary party cannot create a binding naming someone else's SV party as `sv`. The narrower issue is that any party — including parties that are not in `DsoRules.svs` — can create a binding with itself as `sv`, producing DSO-visible spam contracts. Vote-cast integrity is preserved by the `Map.lookup binding.sv svs` check inside `DsoRules_CastGovernanceVote`, so such bindings cannot influence tallies; the residual risk is purely on the DSO's observed ACS. Should the creation path be moved behind a dedicated `DsoRules_RegisterGovernanceVoter` choice that gates on DSO roster membership, or is the cast-time guard sufficient given that the DSO party already filters its observed ACS on the read side? This is independent of the single-binding question above.
- **`VoteRequest` read/disclosure packaging for non-SV participants.** Should governance voters receive direct observer visibility on open `VoteRequest` contracts, or should Scan/read-API discovery return the proposal details and disclosed-contract material needed for explicit-disclosure submission? External signing on a non-SV participant is not complete until this is settled.
- **`Vote` migration shape.** Reference implementation uses non-optional `castBy`/`castByRole` and assumes the drain-and-upgrade path described in *Backwards compatibility*. If upstream prefers an optional-fields migration step, the steady-state shape should still be non-optional.
- **`SRARC_OffboardSv` inclusion.** Included in the Phase 1 allowlist because offboarding is a governance-membership decision. Review should focus on extra warnings, reason requirements, and tests for the high-impact path rather than silently moving it back to the operator-only bucket.
- **Self-offboarding lockout.** A compromised or unresponsive governance voter for an SV could vote to block an `SRARC_OffboardSv` action that names that SV as its target. Phase 1 deliberately lets each represented SV's slot record a vote of either sign on every governance-voter eligible action, so the contract does not partition self-offboarding any differently from other actions. Should the cast path exclude an SV's binding from voting on an offboarding action that targets that SV? Possible answers: exclude at the cast guard, require an additional operator-side acknowledgment in the close path, or leave it to social/governance process. The reference implementation does none of these.

## Changelog

- **2026-05-14:** Initial draft.
