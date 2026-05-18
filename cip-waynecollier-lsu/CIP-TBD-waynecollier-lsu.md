# CIP-TBD: Logical Synchronizers \- Wayne Collier, Moritz Kiefer, Rafael Guglielmetti

| Field | Value |
| :---- | :---- |
| **CIP** | CIP-TBD |
| **Title** | Logical Synchronizers |
| **Author** | Wayne Collier Moritz Kiefer Rafael Guglielmetti |
|  |  |
| **License** | CC-1.0 |
| **Status** | Draft |
| **Type** | Standards |
| **Created** | 2026-04-28 |

## Abstract

Logical Synchronizers provide an abstraction layer between physical synchronizer nodes and the Validators that rely on them. This abstraction allows the Validator node to connect to a single synchronization service, even as the underlying synchronizer nodes (the "physical" synchronizers) change their deployment and adopt new communication protocols. This CIP proposes that the Global Synchronizer adopt Logical Synchronizers, and use Logical Synchronizers for future protocol upgrades. This will allow Validator nodes to maintain a continuous synchronizer connection as the physical synchronizer nodes upgrade from one protocol version to another, and to retain all local history. The CIP also proposes scheduling  the first Logical Synchronizer Upgrade (LSU) of the Global Synchronizer, to move the network from Canton Protocol Version 34 to Canton Protocol Version 35\.

Logical Synchronizer-enabled upgrades (LSUs) will replace the "Synchronizer Upgrades with Downtime" procedure used in CIP-0062 and CIP-0089. A successor physical synchronizer spins up alongside the existing one. Validators switch over automatically, with seconds to minutes of noticeable downtime and no migration dump export/import. This eliminates the 90-minute to 3-hour coordinated network pause required by prior protocol upgrades, and allows Validators to retain historical data. Note however that topology changes (new parties, new nodes, and Daml model vetting) must pause for a longer period, up to a few hours, as the topology state propagates to the new physical synchronizer nodes. (Future protocol versions may reduce this topology management pause.)

## Specification

### How LSU Differs from Previous Upgrades

Previous upgrades (CIP-0062, CIP-0089) required a coordinated global halt. SVs paused the synchronizer, all nodes exported migration dumps, SVs deployed new Canton components, imported the dumps, and waited for a BFT majority to finish. Validators then deployed a new node that imported the migration dump. The whole process required from 90 minutes to 3 hours of downtime. It involved a live coordination call involving all Super Validator operators, and required explicit action by all Validator operators to spin up a new node from a migration-specific node backup.

LSU removes this halt-and-restore pattern:

- **Super Validators** deploy successor synchronizer nodes alongside existing ones before the freeze time. Automation built into Splice handles state transfer, successor initialization, health checks, and traffic migration.  
- **Validators** upgrade to a new binary at their own pace before the upgrade time. This new binary allows the Validator to use both the existing and new protocols (in this case, Canton Protocols 34 and 35). The Validator node switches from one protocol to the other upon receiving a specially formatted transaction from the logical synchronizer.  
- **Application Developers** don't need to do anything, as the logical synchronizer ID remains stable across the upgrade. Applications see a continuous transaction stream, with a pause of seconds to a few minutes when their Validator performs the switch.

### Upgrade Procedure

1. **Release availability.** Canton 3.5 (Protocol Version 35\) and Splice 0.6.1 become available. These releases support both the old and new protocol versions. Note that Splice 0.6.1 is available now on DevNet.  
     
2. **Asynchronous binary upgrade.** Validators and Super Validators upgrade to the new binaries independently, at their own pace, while continuing to run on the original physical synchronizer. This must be done before the scheduled upgrade time.  
     
3. **Governance vote.** Using the SV governance UI, an SV proposes an on-chain vote to schedule the LSU through the `nextScheduledLogicalSynchronizerUpgrade` field in `DsoRulesConfig`. The schedule includes:  
     
   - **Topology freeze time**: after this point, no topology transactions (party additions, package vetting, etc.) can be sequenced until the upgrade completes.  
   - **Upgrade time**: the moment the switchover happens. Daml transactions on the original synchronizer time out; new transactions are processed on the successor.  
   - **New physical synchronizer serial**: the old serial incremented by 1\.  
   - **New protocol version**: the target protocol version (e.g., "35").

   
4. **Successor node deployment (SVs only).** SVs deploy successor sequencer, mediator, and ordering nodes alongside their existing nodes. The Validator *is not* redeployed, because it is tied to the logical synchronizer identity and persists across upgrades. SVs configure `synchronizers.successor` in their SV and scan Helm charts. This must be done before the topology freeze time. Announcement of the successor happens after the topology freeze time, once the topology state has been imported into the new node.  
     
5. **Topology freeze and state transfer.** At the freeze time, each SV's automation publishes an `LsuAnnouncement` topology transaction. This freezes non-upgrade topology changes and identifies the successor synchronizer. Each SV's automation then exports topology and identity state from the current nodes, initializes the successor nodes from that state, and publishes `LsuSequencerConnectionSuccessor` topology transactions containing the new sequencer endpoints. For the first LSU, in June 2026, **the topology freeze will begin 24 hours before the upgrade itself.** 
     
6. **Health verification.** Between the freeze time and upgrade time, SV automation sends periodic health check events on the successor synchronizer. SVs monitor the "LSU Sequencing Test" dashboard to confirm that every SV can sequence on the successor and that BFT peer connections are healthy.  
     
7. **Automatic switchover.** Before the upgrade time, Validator nodes detect the successor, performs a handshake, and initiates a local copy of the topology state. It then verifies internal consistency (a clean synchronizer index and an ACS commitment watermark), registers the successor connection, and switch over. SV automation transfers traffic control state to the successor sequencer.  
     
8. **Post-upgrade cleanup.** SVs update their Helm configuration: `synchronizers.successor` becomes `synchronizers.current`; the old current becomes `synchronizers.legacy`. After 30 days, legacy synchronizer nodes are decommissioned.

### On-Chain Actions by Super Validator Operators

Using the "Set DsoRules Configuration" vote proposal form, propose a vote that populates the nextScheduledLogicalSynchronizerUpgrade schedule:

**DevNet**

The Super Validators will perform a practice LSU on DevNet, followed by an official LSU.

Daml Model Votes

[Daml models from 0.6.2](https://docs.dev.sync.global/release_notes.html) become effective on **2026-05-19**

**Practice** Logical Synchronizer Upgrade Date: **2026-05-27**

Minimum Allowed Splice version: 0.6.4 

* Set topologyFreezeTime to 2026-05-26T13:00:00Z  
* Set upgradeTime to 2026-05-27T13:00:00Z  
* Set newPhysicalSynchronizerSerial to 2  
* Set newPhysicalSynchronizerProtocolVersion to "34"

Then, at the scheduled topology freeze time, the automated LSU procedure begins.

Logical Synchronizer Upgrade Date: **2026-06-03**

Minimum Allowed Splice version: 0.6.4 

* Set topologyFreezeTime to 2026-06-02T13:00:00Z  
* Set upgradeTime to 2026-06-03T13:00:00Z  
* Set newPhysicalSynchronizerSerial to 3  
* Set newPhysicalSynchronizerProtocolVersion to "35"

Then, at the scheduled topology freeze time, the automated LSU procedure begins.

**TestNet**

[Daml models from 0.6.2](https://docs.dev.sync.global/release_notes.html) become effective on **2026-05-26**

Logical Synchronizer Upgrade Date: **2026-06-10**

Minimum Allowed Splice version: 0.6.4 

* Set topologyFreezeTime to 2026-06-09T13:00:00Z  
* Set upgradeTime to 2026-06-10T13:00:00Z  
* Set newPhysicalSynchronizerSerial to 2  
* Set newPhysicalSynchronizerProtocolVersion to "35"

Then, at the scheduled topology freeze time, the automated LSU procedure begins.

**MainNet**

[Daml models from 0.6.2](https://docs.dev.sync.global/release_notes.html) become effective on **2026-06-02**

Logical Synchronizer Upgrade Date: **2026-06-20**

Minimum Allowed Splice version: 0.6.4

* Set topologyFreezeTime to 2026-06-19T13:00:00Z  
* Set upgradeTime to 2026-06-20T13:00:00Z  
* Set newPhysicalSynchronizerSerial to 5  
* Set newPhysicalSynchronizerProtocolVersion to "35"

Then, at the scheduled topology freeze time, the automated LSU procedure begins.

### Cancellation

Between the topology freeze time and the upgrade time, the upgrade can be cancelled if the successor synchronizer is unhealthy. A threshold of Super Validators sends a `POST` request to the `/v0/admin/synchronizer/lsu/cancel` endpoint on the SV API.

Cancellation removes the `LsuAnnouncement` topology transaction, which unfreezes the topology state and restores normal operations on the original physical synchronizer. No data is lost, and no further recovery steps are needed.

### Failure Recovery

If the upgrade proceeds past the upgrade time but the successor synchronizer then breaks, the Super Validators can implement a “roll forward” recovery mechanism by spinning up a third synchronizer and processing new transactions there. The details of roll forward recovery depend on whether any Daml transactions were sequenced on the (failed) successor:

- **No transactions sequenced on successor:** The broken successor is thrown out and replaced by a new one with an incremented serial (e.g., serial 2 more than the original). SVs deploy the replacement and re-run the LSU process.  
- **Some transactions sequenced on successor:** SVs keep both the original and broken successor running (so nodes can catch up) and spin up a third synchronizer as the new successor. ACS commitment mismatches may surface and are resolved using the standard resolution process. 

This "roll-forward" LSU also works as a general disaster recovery mechanism if the current physical synchronizer becomes permanently unavailable, independent of any planned upgrade. In that case, SVs coordinate through configuration rather than on-chain governance.

## Motivation

The Canton Network has completed 4 major upgrades with downtime: to Canton 3.1, 3.2 (pre-CIP), 3.3 (CIP-0062), and 3.4 (CIP-0089). Each one required a multi-hour coordinated halt, a live call among all SV operators, and manual deployment steps from every validator. As the network grows, this pattern breaks down.

**Prior “major upgrade” logic removes Validator history.** Major upgrades with downtime purge the history stored locally on Valdiator nodes, forcing operators to back up and access their historical data in separate offline stores.  

**Downtime is commercially unacceptable at scale.** The network now supports real financial activity. A 3-hour halt disrupts live applications and erodes confidence in the platform's availability guarantees.

**Operational burden is a barrier to growth.** Every validator operator needs substantial expertise to perform the migration sequence within a narrow window. That raises the bar for joining the network and increases the risk of errors that cascade.

**Coordination doesn't scale.** Coordination across Super Validator operators on a live call will become untenable as the number of Super Validators increases. LSUs will enable a larger Super Validator pool in the future.

**Risk compounds with scale.** The dump-and-restore procedure creates windows for data corruption or operator error. Each additional participant is another potential point of failure in the chain.

LSU moves coordination on-chain (through `LsuAnnouncement` and `LsuSequencerConnectionSuccessor` topology transactions), automates the validator-side upgrade, and cuts the downtime window from hours to seconds. Our goal is to make protocol upgrades a routine operation.

## Rationale

### Why LSU Is Possible Now

Canton 3.4 shipped LSU as a preview feature, for testing only. Canton 3.5 hardens it for production. Here's what makes it work:

**Logical vs. Physical Synchronizer Identity.** Canton 3.5 implements a composite `PhysicalSynchronizerId` that links a serial number and protocol version to the stable logical synchronizer ID. The logical identity (the one Validators, parties, and applications reference) does not change. History is preserved across upgrades under a single logical ID. Safety comes from strict time ordering and the successor mechanism.

**On-chain upgrade orchestration.** Two new topology transaction types, `LsuAnnouncement` and `LsuSequencerConnectionSuccessor`, let the protocol itself coordinate the migration. The announcement freezes topology state and signals the upcoming upgrade, while the connection successor mappings tell Validators where to find the new sequencers.

**Automated participant logic.** The Canton participant detects the LSU announcement, verifies readiness, registers the successor, and switches over. The Splice team has provided automation in Splice 0.6.1 to cover various edge cases, including automatic upgrade, crash recovery, late joining, and manual recovery for disaster scenarios.

**Sequencer time bounds.** The successor sequencer enforces strict time boundaries that ensure monotonic time progression across the upgrade boundary and block message replay between physical synchronizer instances.

**Deduplication across the physical synchronizer boundary.** From Protocol Version 35, the physical synchronizer ID (not the logical ID) is used in the hash computation for externally signed transactions. A transaction prepared for one physical synchronizer can't be replayed on its successor, so it must be prepared again.

### What This Means for the Network

**We aim to make protocol evolution a routine process.** The Canton Network can adopt improved protocol versions, bug fixes, and performance improvements without the "fear of upgrade" that bogs down many distributed ledger networks.

**The synchronizer becomes commodity infrastructure.** Upgrades and maintenance become straightforward, with minimal impact on application developers and end-users.

**Validator operations are significantly simpler.** Validators don't need to run complex migration steps. Provided they upgrade their binary on the regular weekly cadence, the rest of the process is automatic.

**Disaster recovery is automated and more scalable.** The roll-forward LSU mechanism provides an automated recovery path for synchronizer failures, in addition to the upgrade flow.

## Backwards Compatibility

Applications that use the Validator APIs and Scan APIs are not affected by this change. The logical synchronizer ID stays stable across the upgrade, and migration IDs will freeze at the latest value; applications see a continuous transaction stream under a single identity.

Applications that integrate directly with the Canton participant and its Ledger API should note:

- Starting with Protocol Version 35, the `synchronizer_id` field in externally signed prepared transaction metadata contains the physical synchronizer ID rather than the logical synchronizer ID. Applications ***should not rely*** on the format of this value.   
  - We anticipate that future protocol versions will add the logical synchronizer ID.   
- Integrators using external signing are encouraged to adopt `HASHING_SCHEME_VERSION_V3`, which includes TTL in the hash computation.


  
The Canton 3.5 release notes will cover the complete set of API changes, deprecations, and migration guidance beyond LSU's scope.

## Reference Implementation

Development of the code enabling Logical Synchronizers and LSUs was funded in part by the Canton Foundation Development Fund, via a grant for Logical Synchronizer Upgrades: [https://github.com/canton-foundation/canton-dev-fund/blob/main/proposals/2026-02-Development-Fund-Proposal-Logical-Synchronizer-Upgrades.md](https://github.com/canton-foundation/canton-dev-fund/blob/main/proposals/2026-02-Development-Fund-Proposal-Logical-Synchronizer-Upgrades.md)

The Splice 0.6.1 code can be found at https://github.com/hyperledger-labs/splice/tree/release-line-0.6.1

The OSS Canton 3.5 code can be found at https://github.com/DACH-NY/canton/tree/release-line-3.5

Splice 0.6.1 and Canton 3.5 (which introduces Canton Protocol 35\) have been integrated and are available on DevNet. The LSU procedure has been validated by the Splice team through integration tests covering the happy-path upgrade, offline validator recovery, LSU cancellation, roll-forward disaster recovery, consecutive LSUs, crash recovery, late validator onboarding, and sequencer health checks. Canton 3.5 Release Notes will be published once the release process is complete.

## Copyright

This CIP is licensed under [CC0-1.0: Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).

## Changelog

- 2026-04-28: Initial draft v1

