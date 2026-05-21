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

Each SV has one active governance voter declared through a DSO-signed `SvGovernanceVoter` binding. SV onboarding creates a self-binding by default, and later changes use the existing confirmation-quorum flow through a new `SRARC_RotateGovernanceVoter` action. The governance voter may open and cast or update the represented SV's vote on explicitly allowlisted non-operational requests. Operational requests remain on the operator path, and each request/cast choice rejects the wrong path. The vote still counts as the SV's existing vote — it does not create a second voting unit.

The on-ledger surface is intentionally compatible with the external-party submission flow defined by [CIP-0103][cip-0103]: the existing request and cast choices take optional binding arguments, the governance-voter path is controlled by the governance-voter party, and the binding can be sourced through Scan and supplied as a disclosed contract. The dApp client, Scan-based discovery, and wallet/signing-provider choices live downstream of this CIP.

[cip-0103]: ../cip-0103/cip-0103.md

## Copyright

This CIP is licensed under CC0-1.0: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).

## Specification

This CIP covers the first contract slice needed for a separated SV governance-voter workflow: define the governance-voting authority model, classify Phase 1 vote actions, preserve one-vote-per-SV semantics, and provide a Daml reference implementation. The standalone dApp, Scan/read API packaging, wallet integration, deployment packaging, and UX hardening remain downstream work.

### Scope

This CIP standardizes the following contract-level behavior:

- A DSO-signed `SvGovernanceVoter` binding authorizes a governance voter to act only on governance-voter-eligible requests for the represented SV.
- `isGovernanceVoterAction` is a hardcoded Phase 1 allowlist; new action constructors remain operator-only until explicitly classified.
- The contract change is limited to the adjacent governance-voter module, optional governance-voter arguments on existing `DsoRules` request/cast/close choices, vote attribution fields, and binding lifecycle choices.
- Both authority paths write the represented SV's single vote slot; attribution records who signed and which binding was used, not additional weight.
- The contract surface is compatible with explicit-disclosure submission by a governance voter; production read/API packaging is downstream implementation work.
- The reference implementation includes Daml tests for binding lifecycle, action taxonomy, strict role split, attribution, cooldown, deadlines, stale binding handling, binding garbage collection, and one-slot tallying.

### Affected Contract Surface

The affected upstream surface is `daml/splice-dso-governance/daml/Splice/` in the [Splice](https://github.com/canton-network/splice) repository:

- `Splice/DSO/GovernanceVoter.daml` (new module) — DSO-signed `SvGovernanceVoter` template and checked-fetch instances for DSO-owned and governance-voter-owned use.
- `Splice/DsoRules.daml` — extended `Vote` record (optional `castBy`, `castByRole`, and `bindingCid`), `VoteCastRole` enum, `isGovernanceVoterAction` classifier, `SRARC_RotateGovernanceVoter` and `DsoRules_RotateGovernanceVoter`, optional governance-voter arguments on `DsoRules_RequestVote` and `DsoRules_CastVote`, stale-binding filtering in `DsoRules_CloseVoteRequest`, and `DsoRules_GarbageCollectSvGovernanceVoters`.

The following existing surfaces remain operator-controlled or otherwise stable:

- `DsoRules_RequestVote` — keeps its existing operator shape when `bindingCid = None`; `bindingCid = Some _` selects the governance-voter path.
- `DsoRules_CastVote` — keeps its existing operator shape when `bindingCid = None` and `castBy = None`; `bindingCid = Some _` and `castBy = Some _` select the governance-voter path.
- `DsoRules_ConfirmAction`, `DsoRules_ExecuteConfirmedAction`, `Confirmation`, `VoteRequest.trackingCid` — unchanged.

`DsoRules_CloseVoteRequest` continues to count at most one vote per represented SV using its existing semantics; the role attribution on `Vote` changes accountability, not weight.

### Governance-Voter Binding

This CIP adds a separate DSO-owned authority contract instead of storing governance-voter state on `SvInfo`. `SvInfo` describes SV membership and operational identity. The governance voter is related to the SV but is not the operator identity.

```daml
template SvGovernanceVoter
  with
    dso : Party
    sv : Party
    governanceVoter : Party
  where
    signatory dso
    observer sv
```

Rules:

- `dso` is the sole signatory. The represented SV cannot bare-create, rotate, or archive its binding.
- `sv` is an observer so the represented SV can inspect its current binding.
- `governanceVoter` is intentionally not an observer. A governance-voter participant can discover the binding through Scan or receive it as a disclosed contract, without needing to vet the DSO governance DAR for this template.
- `governanceVoter == sv` is allowed and is the onboarding default. `DsoRules_AddSv` atomically creates this self-binding when an SV is onboarded.
- `governanceVoter == dso` is rejected on rotation; the DSO must never appear as an SV's governance voter.
- There is intentionally **no `Clear` choice**. "Returning control to the operator" is expressed as rotating back to the represented SV. Without a binding nobody would be authorized to cast on governance-voter actions for the represented SV.
- There is intentionally **no on-template `Rotate` choice**. Rotation is represented as the operational `SRARC_RotateGovernanceVoter` action and executed by `DsoRules_RotateGovernanceVoter`, which archives the current binding and creates the replacement binding after the standard confirmation-quorum flow.
- There is intentionally **no contract key**. The DSO-owned lifecycle preserves one active binding per represented SV through onboarding and rotation. Cleanup for duplicate or orphaned bindings left by older package versions, offboarding, or development-network re-onboarding is handled by `DsoRules_GarbageCollectSvGovernanceVoters` and SV automation.

### Vote Attribution

`Vote` is extended to carry signer and binding attribution alongside the existing fields. The new fields are optional and appended for Daml upgrade compatibility. Tallying continues to use `Vote.sv` (the represented SV).

```daml
data VoteCastRole
  = VCR_Operator
  | VCR_GovernanceVoter
  deriving (Eq, Show)

data Vote = Vote with
    sv         : Party                         -- represented SV whose vote slot is updated
    accept     : Bool
    reason     : Reason
    optCastAt  : Optional Time
    castBy     : Optional Party                -- party that signed the cast
    castByRole : Optional VoteCastRole         -- authority path that wrote the slot
    bindingCid : Optional (ContractId SvGovernanceVoter)
                                               -- binding used for governance-voter casts
  deriving (Eq, Show)
```

Operator votes use `castBy = Some sv`, `castByRole = Some VCR_Operator`, and `bindingCid = None`. Governance-voter votes use `castBy = Some governanceVoter`, `castByRole = Some VCR_GovernanceVoter`, and `bindingCid = Some bindingCid`. Legacy votes lifted from older packages may carry `None` in the appended attribution fields.

`VoteRequest.votes` remains keyed by SV display name `Text` for upgrade compatibility. The represented SV is still recorded in `Vote.sv`, and both cast paths write into the same represented-SV slot. `castByRole` and `bindingCid` change attribution and staleness handling, not voting weight.

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
        SRARC_AddSv _ -> False
        SRARC_ConfirmSvOnboarding _ -> False
        SRARC_CreateExternalPartyAmuletRules _ -> False
        SRARC_CreateTransferCommandCounter _ -> False
        SRARC_CreateBootstrapExternalPartyConfigStateInstruction _ -> False
        SRARC_RotateGovernanceVoter _ -> False
    ARC_AmuletRules amuletAction ->
      case amuletAction of
        CRARC_SetConfig _ -> True
        _ -> False
    _ -> False
```

Eligibility errors on the operator path use:

```text
"Action is governance-voter eligible; pass `bindingCid` to take the governance-voter path"
```

The symmetric errors on the governance-voter path use:

```text
"Action is not governance-voter eligible; omit `bindingCid` for the operator path"
```

These are distinct from binding, authority, and request-state errors surfaced elsewhere in the cast logic.

### Vote Request Creation

`DsoRules_RequestVote` remains the single request-creation choice. It gains an optional `bindingCid` argument appended at the end for upgrade compatibility:

```daml
nonconsuming choice DsoRules_RequestVote : DsoRules_RequestVoteResult
  with
    requester          : Party -- represented SV on operator path; governance voter on governance-voter path
    action             : ActionRequiringConfirmation
    reason             : Reason
    voteRequestTimeout : Optional RelTime
    targetEffectiveAt  : Optional Time
    bindingCid         : Optional (ContractId SvGovernanceVoter)
  controller requester
  do
    case bindingCid of
      None -> do
        require "Action is governance-voter eligible; pass `bindingCid` to take the governance-voter path"
                (not (isGovernanceVoterAction action))
        -- requester is the represented SV; initial vote is VCR_Operator.
      Some cid -> do
        require "Action is not governance-voter eligible; omit `bindingCid` for the operator path"
                (isGovernanceVoterAction action)
        svGovernanceVoter <- fetchChecked (ForOwner with dso; owner = requester) cid
        -- requester is the governance voter; represented SV is taken from the binding.
        -- initial vote is VCR_GovernanceVoter and records bindingCid = Some cid.
```

The governance voter is the creator of a non-operational vote request, consistent with the design intent that operational voting remains an operator concern and non-operational voting belongs to the governance voter (which may be the SV itself under the self-binding default).

On the governance-voter path, `DsoRules_RequestVote` records an auto-accept initial vote for the represented SV (`castBy = Some governanceVoter`, `castByRole = Some VCR_GovernanceVoter`, `bindingCid = Some cid`, `accept = True`, reason "I accept, as I requested the vote.") mirroring the operator path's convention. The initial vote occupies the represented SV's slot in `VoteRequest.votes` and may be updated through `DsoRules_CastVote` while the request is still open.

### Vote Cast Choice

`DsoRules_CastVote` remains the single cast/update choice. It gains optional `bindingCid` and `castBy` arguments appended at the end for upgrade compatibility. Both must be absent on the operator path and present on the governance-voter path:

```daml
nonconsuming choice DsoRules_CastVote : DsoRules_CastVoteResult
  with
    requestCid  : ContractId VoteRequest
    vote        : Vote
    bindingCid  : Optional (ContractId SvGovernanceVoter)
    castBy      : Optional Party
  controller fromOptional vote.sv castBy
  do
    requireWellformedVote config vote
    -- bindingCid and castBy are both None (operator) or both Some (governance voter).
    -- governance-voter path uses fetchChecked (ForOwner with dso; owner = castBy) bindingCid.
    request <- fetchChecked (ForDso with dso) requestCid
    -- action eligibility, deadline, cooldown, archive, and slot update are shared.
    now <- getTime
    let castDeadline = fromOptional request.voteBefore request.targetEffectiveAt
    require "Vote request has expired" (now < castDeadline)
    -- recordedVote canonicalizes sv, castBy, castByRole, bindingCid, and optCastAt.
```

The operator path records `Some VCR_Operator`; the governance-voter path records `Some VCR_GovernanceVoter` and the binding used for the cast. The choice canonicalizes attribution before writing, so caller-supplied attribution metadata is not trusted for authorization.

### Strict Role Split

Each action class is partitioned into exactly one cast path:

- `isGovernanceVoterAction request.action == True` → request and cast use `DsoRules_RequestVote` / `DsoRules_CastVote` with `bindingCid = Some _` (and `castBy = Some _` on cast). The operator path rejects.
- `isGovernanceVoterAction request.action == False` → request and cast use `DsoRules_RequestVote` / `DsoRules_CastVote` with `bindingCid = None` (and `castBy = None` on cast). The governance-voter path rejects.

There is no operator override of a governance-voter vote, and no governance-voter override of an operator vote. The represented SV's vote slot can only be written through the path that owns the request's action class. This is a deliberate change from earlier drafts that allowed operator override on the shared slot.

### Authority Rules

The SV/operator path remains responsible for operational and automation-oriented actions:

- creating vote requests for operational actions,
- casting/updating votes for operational actions,
- confirming actions and executing confirmed actions,
- onboarding or activating SV membership,
- rotating governance-voter bindings through `SRARC_RotateGovernanceVoter`,
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

Phase 1 onboarding initializes each SV with `governanceVoter == sv` (a self-binding). The SV's existing operator-led workflow keeps working without an explicit setup step; the long-term model with a distinct governance-voter party is reached via the operational `SRARC_RotateGovernanceVoter` action and `DsoRules_RotateGovernanceVoter` choice.

Rotation applies at cast time and close time. If the DSO rotates an SV from voter A to voter B while a request is open, voter B can update the represented SV's vote after the rotation; voter A cannot. A vote already cast by voter A records the binding it was cast under. When `DsoRules_CloseVoteRequest` is invoked with `currentBindings = Some [...]`, the close logic drops governance-voter-cast votes whose recorded binding is no longer the live binding for the represented SV and reports them in `staleBindingVoters`. `currentBindings = None` preserves pre-staleness behavior for callers that have not adopted the new argument.

Returning control to the operator is expressed by rotating back to the represented SV. There is no separate `Clear` operation.

Bindings for removed SVs, and duplicate bindings left by older package versions or development-network re-onboarding, are cleaned up by `DsoRules_GarbageCollectSvGovernanceVoters` and SV automation.

### One-Vote-Per-Node Semantics

This CIP does not change vote weight or tallying.

- `VoteRequest.votes` remains a per-represented-SV slot keyed by SV display-name `Text` for upgrade compatibility. The represented SV remains available as `Vote.sv`.
- Both the operator path and the governance-voter path write the represented SV's existing slot.
- Re-casting through either path updates the same slot under the existing request semantics, subject to the per-SV cooldown.
- `DsoRules_CloseVoteRequest` continues to count at most one vote per represented SV.
- When supplied with the live binding set, `DsoRules_CloseVoteRequest` drops governance-voter votes cast under stale bindings before tallying.
- There is no vote slot keyed by governance-voter party, wallet, user, or participant.

### Visibility And Read Assumptions

The write path is not enough. A governance voter must be able to inspect the proposal before signing and must have enough contract visibility on the submitting participant to exercise the ledger choice.

Phase 1 uses the following visibility position:

- `SvGovernanceVoter` is not visible to the governance voter by observer. The governance voter discovers the binding through Scan/read APIs or receives it as a disclosed contract.
- Proposal discovery and proposal-detail rendering are served through Scan or an SV-hosted read API rather than by making every proposal contract directly visible for browsing.
- The supported unaffiliated-voter submit path is explicit disclosure: the governance voter submits the target contract IDs together with the disclosed contracts needed to exercise `DsoRules_CastVote` on the governance-voter path.
- SV-hosted submission or relay remains a valid deployment option, but it is not required by the on-ledger design.
- Scan or an SV-hosted read API returns the proposal details, binding information, and disclosed-contract material needed for proposal inspection and submission, similar to the existing `AmuletRules` flow used by validators.

This CIP is compatible with external participant submission and leaves the exact read/disclosure API packaging to downstream implementation.

### Security Considerations

- The governance-voter path rejects unsupported action constructors by default.
- Governance voters cannot exercise `DsoRules_ConfirmAction`, `DsoRules_ExecuteConfirmedAction`, or any operator-only operational choice.
- Governance-voter binding rotation is operational: it uses `SRARC_RotateGovernanceVoter` and the standard confirmation-quorum flow, not unilateral SV action.
- Both cast paths reject votes after the request's deadline (`now < castDeadline`, where `castDeadline = fromOptional voteBefore targetEffectiveAt`), matching documented `DsoRules_CloseVoteRequest` semantics.
- Both cast paths enforce a per-represented-SV cooldown to rate-limit rapid re-casts.
- The cast choice canonicalizes `castBy`, `castByRole`, and `bindingCid` before recording.
- Binding rotation is checked at cast time and, when `currentBindings` is supplied, at close time.
- Audit records distinguish operator-cast and governance-voter-cast votes via `Vote.castBy` / `Vote.castByRole`.
- `SRARC_OffboardSv` is intentionally not special-cased when the represented SV is the offboarding target. The represented SV's vote remains its vote; changing target-party voting rights is a broader governance-process decision outside this authority-splitting CIP.

## Motivation

Governance voting and node operations are different responsibilities.

The operator party runs or controls the SV node, signs automation commands, and participates in workflows such as confirmation and execution. A governance voter expresses the SV organization's governance intent on non-operational proposals. Those roles may be held by the same party during bootstrap, but the contract model should not require them to remain the same forever.

Today an SV-funded organization that wants direct, auditable governance participation must hold node-operator credentials. The status quo also offers no way to distinguish, in a vote record, whether a vote was cast through an operator-automation path or by a human governance representative.

This CIP separates governance voting from node operation on the ledger without redesigning either. The governance voter is a signer for the represented SV's vote on an explicit allowlist of non-operational actions, not a new voting unit. The SV remains the unit of voting weight; the cast simply carries an accountability stamp identifying which party signed it through which authority path.

## Rationale

This CIP keeps the first standards-track change narrow. It separates the governance-voting identity from the operator identity without changing voting weight, confirmation, execution, round automation, or broader governance process.

This CIP does not standardize the standalone governance dApp, wallet/provider selection, deployment packaging, mobile or notification workflows, generalized identity, multiple voters per SV, broad rights-holder voting, or tokenomics. Those topics belong to later milestones or separate governance decisions.

A separate `SvGovernanceVoter` contract is preferred over adding voter fields to `SvInfo` because it keeps membership and operational identity distinct from voting authority. Making the DSO the signatory keeps binding lifecycle under `DsoRules`, where onboarding, confirmation-quorum rotation, stale-binding checks, and cleanup can be enforced consistently.

Optional governance-voter arguments on `DsoRules_RequestVote` and `DsoRules_CastVote` are preferred over separate governance-voter choices because they preserve upgrade compatibility for existing choice callers while still making the authority path explicit. The eligibility predicate partitions every `ActionRequiringConfirmation` into exactly one path. With strict role split, the represented SV's vote slot can only be written through the path that owns the request's action class, removing ambiguity about which authority just changed a vote.

The one-vote-per-node model is preserved by continuing to store the vote under the represented SV's existing `VoteRequest.votes` slot. The governance voter signs the SV's vote; it does not become a new voting unit. The map key remains `Text` for upgrade compatibility, while `Vote.sv` carries the represented SV party used for tallying and staleness checks.

`SRARC_OffboardSv` is intentionally included in the Phase 1 allowlist because offboarding is a governance-membership decision rather than a node-operation decision. The high-impact path is paired with clear UI warnings, reason quality expectations, and tests, but it does not move back to the operator-only bucket. This CIP also does not exclude the target SV from voting on its own offboarding; it preserves the current represented-SV voting semantics and treats any target-party voting restriction as a separate governance-process decision.

### CIP-0103 Compatibility

[CIP-0103][cip-0103] defines the dApp-to-Wallet API. It does not prescribe on-ledger contract patterns, but it does establish that external parties submit via `prepareExecute` with `disclosedContracts`. The contract surface in this CIP is intentionally compatible with that flow:

- `DsoRules_CastVote` is controlled by `fromOptional vote.sv castBy`; on the governance-voter path, `castBy = Some governanceVoter` and `bindingCid = Some binding`.
- The binding can be sourced through Scan and supplied as a disclosed contract by a CIP-0103-conforming Wallet.
- The cast does not require visibility on contracts unique to the SV node, so the governance voter can submit through a participant that is not the SV's participant once the read-side visibility model is settled.

`Requires: CIP-0103` is intentionally not asserted in the preamble: the on-ledger surface defined here is independently useful and does not depend on CIP-0103 being adopted. The relationship is one of compatibility, not dependence.

### Alternatives Considered

- **Store the governance voter on `SvInfo`.** Rejected because it couples governance voting to the operator/member record, broadens the disclosure surface of operator records, and complicates rotation.
- **Treat the governance voter as another SV/operator authority.** Rejected because it would blur voting and automation authority.
- **Encode multiple governance voters per SV at the ledger layer.** Rejected for Phase 1. Voting weight stays at the SV and multi-user organizations are expected to map several users onto the single governance-voter party at the dApp/UI layer rather than via multiple ledger bindings.
- **Use a contract key on `(dso, sv)` for the binding.** Earlier drafts proposed this. The reference implementation omits the key and instead keeps lifecycle control inside `DsoRules`, with onboarding/rotation preserving the intended invariant and garbage collection handling duplicates from older package versions or development-network re-onboarding.
- **Propose-Accept on the binding.** Adds ceremony with no Phase 1 benefit; can be layered on later as a CIP amendment without invalidating the unilateral-declaration semantics.
- **Operator override on non-operational votes.** Earlier drafts allowed this on the shared slot. Rejected on review: operational votes should be cast only by the operator, and non-operational votes should be cast only by governance parties. The strict role split makes the partition unambiguous.
- **Configurable action allowlist.** Rejected: it would let governance voters vote to expand their own authority. The classifier is hardcoded in Daml and can only be extended via a package upgrade.
- **Depend only on transaction history for attribution.** Rejected because the vote record itself should identify whether the operator or governance-voter path cast the current vote.
- **`ClearGovernanceVoter` choice on the binding.** Earlier drafts had it. Removed: leaving the represented SV without a binding has no useful semantics, and "return control to the operator" is expressed cleanly as rotating back to the represented SV.

## Backwards compatibility

Existing SVs continue to operate through the current operator path for operational actions. Existing confirmation, execution, close, and automation flows stay in place.

The implementation is structured to preserve Daml upgrade compatibility:

- **`Vote` attribution.** `Vote` gains optional trailing fields (`castBy`, `castByRole`, and `bindingCid`). Existing contracts lift with `None`; new votes are recorded with `Some` attribution.
- **`VoteRequest.votes` key.** The map remains `Map.Map Text Vote`, preserving existing active-contract shape. `Vote.sv` continues to identify the represented SV party.
- **Choice arguments.** `DsoRules_RequestVote`, `DsoRules_CastVote`, and `DsoRules_CloseVoteRequest` gain optional trailing arguments. Existing callers can continue to use the operator/back-compat path by passing `None`.
- **Close result.** `DsoRules_CloseVoteRequestResult` gains optional trailing `staleBindingVoters`. `None` means no staleness check ran; `Some []` means the check ran and dropped no voters.
- **Operator path eligibility rejection.** `DsoRules_RequestVote` and `DsoRules_CastVote` now reject `isGovernanceVoterAction` constructors when called with `bindingCid = None`. Any caller opening or casting on such actions must pass the governance-voter binding.

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
| Binding lifecycle (self → delegate → back to self), using confirmation-quorum rotation | `testSvGovernanceVoterBindingLifecycle` |
| Onboarding default self-binding | `testSvGovernanceVoterBindingLifecycle` |
| Represented SV cannot bare-create or duplicate its own binding | `testSvGovernanceVoterBindingLifecycle` |
| `governanceVoter == dso` rejected on rotate | `testSvGovernanceVoterBindingLifecycle` |
| Operator-only request only via operator path; governance-voter-only request only via governance-voter path | `testGovernanceVoterCastPath` |
| Operator-only cast only via operator path; governance-voter-only cast only via governance-voter path | `testGovernanceVoterCastPath` |
| Rotation invalidates previous governance voter | `testGovernanceVoterCastPath` |
| Action allowlist coverage across every supported/unsupported constructor | `testGovernanceVoterActionTaxonomy` |
| One vote per represented SV preserved across updates | `testVoteUpdateKeepsOneSlotPerSv` |
| Cast after `castDeadline` rejected on both paths | `testCastDeadlineExpiry` |
| Per-SV cooldown | `testVoteCastingCooldown` |
| Governance-voter vote cast under a rotated binding is dropped when close supplies live bindings | `testStaleBindingDropsVote` |
| Close-vote staleness check is opt-in for back-compat callers | `testStalenessCheckOptIn` |
| Duplicate and orphaned governance-voter bindings can be garbage-collected | `testGarbageCollectSvGovernanceVoters` |
| Offboarding the represented SV while a governance-voter request is open: subsequent governance-voter cast fails the "Voter is not an SV" check; the request expires naturally via `DsoRules_CloseVoteRequest`. | covered by combined membership/cast tests |

All tests in `splice-dso-governance-test-daml/damlTest` pass on the reference branch.

## Changelog

- **2026-05-21:** Reconciled draft with updated reference implementation.
- **2026-05-14:** Initial draft.
