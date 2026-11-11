<pre>
  CIP: CIP-TBD
  Title: SV Governance dApp Support
  Author: Raymond Roestenburg <raymond.roestenburg@digitalasset.com>
  Discussions-To: [https://lists.sync.global/g/cip-discuss](https://lists.sync.global/g/cip-discuss)
  Comments-Summary: No comments yet.
  Comments-URI: [https://github.com/canton-foundation/cips/pulls](https://github.com/canton-foundation/cips/pulls)
  Status: Draft
  Type: Governance
  Created: 2026-11-11
  License: CC0-1.0
</pre>

## Abstract

Today, on-chain SV governance is tightly coupled with node operations. Every node has a single on-ledger vote, and
only the SV operator party can submit votes (and vote requests) on behalf of that node. This introduces operational
complexities for SV operators, who often need to seek vote approval from an individual representing an SV node owner,
as well as a security risk by reusing the same operator (internal) party for all votes.

This CIP introduces a mechanism through which (external) parties can be delegated by the node operator to vote on
behalf of the node, and a dApp UI through which they can perform votes. The delegate can choose to host their own dApp
UI, or use one hosted by the SV node for them. This technical improvement will also make it possible to more widely
decentralize Super Validator governance in a secure manner.

## Copyright

This CIP is licensed under CC0-1.0: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)

## Specification

### 1. Objective

Provide a mechanism for an SV node operator to delegate SV governance voting to a non-operator party, which may be an
external party hosted on a different validator node, and provide a dApp that the party can use to vote. While this is a
step toward separating governance from node operations, this CIP intentionally does not modify the voting rights, which
remain at one vote per Super Validator node. It only adds an additional party that is allowed to vote on behalf of the
node, plus the capability for that party to use any CIP-103 compliant wallet to do so through a governance dApp.

The CIP is compatible with any future expansion of direct voting by Super Validator rights owners, as proposed on
[cip-discuss](https://lists.sync.global/g/cip-discuss/topic/119218581?msg=828#msg828).

Out of scope: several voter parties per SV node, and delegating only a subset of actions; a future CIP may separate
operational from non-operational votes and delegate only the latter. This CIP is purely about delegating voting to an
external party, to support the dApp architecture.

### 2. Implementation Mechanics

#### Delegation

The SV operator delegates voting to a voter party with a `VoteDelegation` contract that the operator signs. Through it,
the voter party can request votes and cast votes on behalf of that SV, and nothing else. The voter party is a party of
its own, distinct from the operator party. The Daml code is in the reference implementation.

#### Changes to DsoRules

The vote and vote request choices of `DsoRules` accept the designated voter party as an additional controller, and
record it on executed votes and on vote requests. Every delegated vote is thus visible on-ledger, and in Scan's vote
views, as submitted through the delegation. A new `DsoRules_Fetch` choice lets the delegation read `DsoRules`, like
`AmuletRules_Fetch` does for `AmuletRules`.

The operator and the voter party of an SV node share the node's single vote: the latest vote counts, and the existing
cooldown period for changing a vote applies to both.

#### Delegation Lifecycle

The SV operator sets the voter party for its node, and can change or remove it at any time. A voter party can hold
delegations from several SV nodes, and may choose which SV it acts for. A delegation set up by an SV no longer works if
that SV has been offboarded, because `DsoRules` rejects those votes.

#### Governance dApp

The SV UI adds a dApp mode in addition to the current node operator mode, chosen at deployment time. Both modes present
user interfaces built on a single underlying app, so they stay in step.

In dApp mode, the SV UI:

- reads from Scan, so reads do not need to go through the SV app;
- submits through any CIP-103 compliant wallet to the participant hosting the voter party;
- shows the governance pages (vote requests, voting, requesting votes, results); pages and vote parameters that only
  concern node operations, such as Amulet price votes, are shown read-only, and validator onboarding secrets are not
  shown, as they are credentials held by the operator only;
- lets a voter party holding several delegations choose the SV for which it is currently acting.

The dApp can be hosted by the SV operator next to the operator UI, by the voter, or by a third party. A Helm chart and
documentation cover each case.

#### Scan

The voter party's participant does not hold `DsoRules` or the vote requests: both are DSO contracts that only the SVs
see. The dApp reads them from Scan, with the created-event blobs it needs to pass them as disclosed contracts, and reads
the vote results there too. `DsoRules` comes from the existing external `/v1/dso`. Vote requests and vote results get
new endpoints in the external Scan API, which promises backward compatibility, because the dApp can be hosted by anyone
and run against any SV's Scan. The internal vote endpoints stay as they are.

### 3. External Voter Parties

- The voter party holds the SV's full voting power and nothing else of the node. If its keys are lost or compromised,
  the operator removes the delegation to the voter party, and can vote for itself in the meantime.
- The voter party's validator pays the traffic for its submissions.
- An external party prepares and signs each submission, which takes longer than an internal submission. The dApp
  handles votes close to a request's deadline, and votes that another SV's vote overtakes before they are executed.
- Requesting votes has no rate limit today, and delegation adds a second party per SV that can request votes. The voter
  party pays the traffic for its requests, and the operator can remove it at any time.

### 4. What does not change

- One vote per SV node, and the 2/3 threshold for deciding a vote request.
- The operator's ability to request and cast votes, through the SV app and the operator mode of the SV UI.
- The set of actions that can be voted on, vote request timeouts and the vote cooldown.
- SV onboarding, offboarding and weights.

## Motivation

Tying governance to node operations has two costs. Operationally, every vote proposal and vote request goes through the
node operator, who relays decisions made elsewhere. For security, governance access means access to the party that runs
the node.

With a delegation, an SV hands governance voting to the people who make the decisions, on a party of their own, while
the node keeps its single vote without requiring the SV decision maker to act directly as the Node Operator Party.

## Rationale

Delegation adds a voter and leaves the operator's rights as they are, which keeps the change additive, low risk, and
compatible with any future move to direct voting by all SV rights owners.

The separation of roles is enforced in Daml: the delegation allows voting for a single SV node and nothing else, and the
voter party is distinct from the operator. What the delegation allows is decided by Daml alone; the dApp shows operator
pages read-only for usability, and any client can submit what the delegation permits.

The dApp is a mode of the SV UI, so the governance pages exist once. As a CIP-103 dApp it works with any compliant
wallet on any validator, the standard way for external parties to act on the Canton Network.

## Backwards compatibility

The change is a compatible upgrade of `splice-dso-governance`: the new choice arguments, and the voter party recorded on
votes and vote requests, are optional and appended, so existing callers and existing contracts keep working; the
delegation contract and `DsoRules_Fetch` are new. Delegated voting becomes available on a network once the SVs have
voted in the new package version, through the usual package configuration vote. A vote or vote request with the voter
party set can only be read with the new version, so delegations are used only once that vote is in effect on all SV
nodes. Each SV then decides whether to set a voter party. The operator mode of the SV UI is unchanged.

## Reference implementation

The Daml model for the delegation, the voter party on the vote choices and `DsoRules_Fetch` is in
[this commit](https://github.com/canton-network/splice-sv-voting-dapp/commit/00a2bad8825e62a48096d780421411df6ea92b20)
on the Splice feature fork. The check that the voter party differs from the operator, the voter party recorded on
votes and vote requests, the dApp mode and the Scan endpoints will follow, with Daml tests for delegated submissions,
operator and voter party voting on the same request, and offboarded SVs.

## Changelog

- 2026-11-04: Review feedback: operator pages and parameters read-only in the dApp, wording.
- 2026-11-03: Review feedback: wording aligned with the development fund proposal, implementation detail left to the
  reference implementation, scope limits stated.
- 2026-10-13: Initial draft.
