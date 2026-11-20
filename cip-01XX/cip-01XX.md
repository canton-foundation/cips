# CIP-01XX: Add Ankr as a Canton Super Validator (Weight 6)

```
CIP: 01XX
Layer: Governance
Title: Add Ankr as a Canton Super Validator (Weight 6)
Author: Ana Cruz <a.cruz@asphere.xyz>
 Reanna Garbutt <r.garbutt@ankrlabs.xyz>
Discussions-To: [cip-discuss thread URL, once posted]
Comments-Summary: No comments yet.
Status: Draft
Type: Governance
Created: 2026-09-22
Approved:
License: CC0-1.0
```

## Abstract

Ankr is a leading institutional digital asset infrastructure provider specializing in highly resilient, secure Node-as-a-Service (NaaS) and staking operations for enterprise finance. This CIP proposes granting Ankr participation as a Super Validator (SV) with a maximum Weight of 6.

This CIP establishes an umbrella, milestone-based program through which Ankr can receive SV Weight (up to 6) for initiatives that materially advance the Canton ecosystem, specifically, expanding multi-cloud consensus infrastructure, onboarding institutional clients and dApp activity onto Canton, and providing white-label RPC infrastructure support via Ankr's existing NaaS relationships.

Total Earnable Weight: 6 (max) Accrual Destination: Escrow, consistent with existing SV escrow mechanics. Confidentiality: All milestones and infrastructure details in this CIP reflect information Ankr has already made publicly available; no confidential terms are included.

## Motivation

Ankr operates globally distributed infrastructure, combining secure bare-metal and cloud deployments with advanced load balancing, continuous network monitoring, and automated failover mechanisms to ensure operational reliability, scalability, and performance. Its infrastructure is designed to meet the security and compliance requirements of institutional clients. SOC 2 audited annually.

Since 2017, Ankr has operated active validators across more than 15 major networks, including Ethereum, BNB Chain, Avalanche, Polygon, Sui, Gnosis, Fantom, Chiliz, EigenLayer, Flare, Celer, Skale, MAP, and Xpla, with publicly verifiable validator addresses on each network's explorer. Infrastructure scale includes:
- 50+ nodes distributed globally, backed by a load-balancing system to maximize performance and reliability.
- Enterprise-grade monitoring pipelines for continuous network health and compliance visibility.

Canton benefits from Ankr's participation as a Super Validator in two ways that go beyond a standard Validator relationship. First, Ankr's existing base of institutional and dApp clients across 63+ chains is a direct channel for bringing new activity and transaction volume onto Canton. Second, Ankr's commitment to maintaining our 99.9% infrastructure uptime SLA gives the network a demonstrably reliable operator at scale, reducing the operational risk that comes with expanding the Super Validator set.

## Specification

By running a dual Participant and Synchronizer Sequencer cluster, Ankr intends to provide high-throughput connectivity for institutional clients, expand Canton's multi-cloud consensus footprint, and commit significant operational volume to the network.

### Infrastructure Capabilities & Technical Architecture

#### Geographic Distribution & Multi-Cloud Resiliency
Ankr's infrastructure relies on dedicated bare-metal deployments for RPC and validator nodes, no public cloud sits in the serving path, though Ankr can adapt to a cloud requirement if mandated by the Canton team.
- **Primary Infrastructure Backbones:** Dedicated bare-metal infrastructure preferred for RPC and validators.
- **Active Availability Zones:** Distributed across US East, US West, and Europe, with additional regions deployable per Canton Foundation requirements subject to the Ankr team's evaluation.
- **Failover Mechanisms:** Node health polled every 3 seconds, with a 15-second freshness TTL on chain head (configurable for Canton). A failed request retries across up to 3 nodes, making a single node loss invisible to the caller. Cluster-level failover uses Route53 health checks with a 60-second TTL. Standard SLA is 99.9% infrastructure uptime; possible top-tier SLA is 99.99%.

#### Security Architecture & Key Management
- **Cryptographic Key Storage:** Enterprise secrets-management infrastructure with top industry-standard access controls, paired with 24/7 managed detection and response. Further detail on our key-management architecture is available to the Foundation under separate, private communication given its sensitivity.
- **Network Firewalls & Perimeter Defenses:** Industry-standard perimeter security, including DDoS mitigation and network segmentation. Further detail is available to the Foundation under separate, private communication.
- **Compliance Frameworks:** SOC 2 audited annually; FY2026 Type 2 fieldwork completed August 2026

### Deployment Plan

Upon passing the two-thirds supermajority governance vote:
- **Node Blueprint:** Immediate deployment of the Canton Synchronizer Sequencer container paired with existing high-capacity Participant Node.
- **Target Launch Windows:**
  - Canton TestNet Sync & Validation: within 5 business days post-approval.
  - Canton MainNet Production Deployment: within 10 business days post-successful TestNet stability window.

## Deliverable & Milestones

1. **Node Sync & SLA Verification:** Ankr first runs Standard Nodes on Canton, then syncs both TestNet and MainNet nodes within 15 days of SV activation, then operates them for one month under Ankr's enterprise-grade SLA, reporting verifiable uptime metrics to the Foundation. — Timeframe: 1 month — Weight: 2
2. **Validator Operation & Throughput Contribution:** Ankr operates validators with verifiable SLA uptime metrics for 2 months, meeting a transaction throughput target agreed with the Canton team. — Timeframe: 2 months — Weight: 2
3. **Ankr Forge Ecosystem Campaign:** Ankr designs and launches an "Ankr Forge" campaign in partnership with the Canton team to drive on-chain activity through a rewards-distribution program. Campaign mechanics and point-earning criteria will be jointly defined by both teams to maximize on-chain volume. — Weight: 1
4. **White-Label RPC Infrastructure Support:** Ankr provides RPC node infrastructure to handle a portion of Canton network traffic, delivered as a white-label solution under terms jointly agreed with the Canton team. This milestone is contingent on scope and terms being finalized between both teams. — Weight: 1

*(Weight allocations sum to 6. Milestone 2's transaction throughput target and Milestone 4's traffic/scope terms are still placeholders — final figures should be agreed with the Canton team before submission.)*

Milestone Review Process: The Accountability Committee will confirm whether Ankr has successfully met each milestone. Reward Mechanism: Upon confirmation, rewards associated with milestones will be released from escrow.

## SV Reward Mechanics

- An `extraBeneficiary` PartyID associated with the 'escrowed' Super Validator will be set up by the Foundation, or another SV node operator approved to provide SV rewards escrow services, with an SV Weight at the maximum earnable weight (6).
  - Ankr is responsible for coordinating the process of setting up the escrowed weights with the Canton Foundation and the operator of the SV node.
  - Ankr is responsible for all costs associated with the operation of the escrow SV.
  - The escrow SV will NOT mint rewards on a block-by-block basis; all escrow SV rewards go to the Unclaimed Rewards pool.
- ⅔ of Super Validator Operators will update their configurations to allow the escrowing SV node to host the full weight to be earned by Ankr.
- Ankr is required to present proof of successfully completed milestones to the Tokenomics Working Group, including a calculation of Canton Coin earned for meeting each milestone.
- If the Tokenomics Working Group agrees the milestone has been met, an announcement is sent via the Tokenomics-Announce mailing list, the Foundation updates the `extraBeneficiary` to an active PartyID controlled by Ankr, and ⅔ of SV Operators assign the approved portion of Unclaimed Rewards to be minted by Ankr's Validator.
- If milestones are not achieved by deadline, Ankr is notified, the unmet weight is removed from the Canton Foundation node configuration, and the Tokenomics Working Group recommends disposition of the Unclaimed Rewards.
- Ankr is subject to **CIP-0045: SV Operating Requirements**. If at any time Ankr's rewarded SV Weight exceeds 2.5, Ankr must operate its own SV node within 6 months of crossing that threshold. This SV node joins the network at weight zero and adds weight as milestones in this CIP are completed.

## Rationale

Ankr's approach to earning weight through milestones reflects how the company operates: trust with partners is built by demonstrating delivery, not by requesting standing before it is earned. A milestone-based structure lets Canton grant weight in step with verified infrastructure uptime, transaction throughput, and ecosystem contribution, rather than committing governance weight up front against unproven commitments. This also gives the Foundation a clean mechanism to withhold or claw back unearned weight if a milestone is missed, consistent with the escrow model used elsewhere in this CIP.

Weight 6 reflects the scope of what Ankr is committing to deliver: production validator and RPC infrastructure across multiple regions, a defined SLA with verifiable uptime reporting, a joint activity-driving campaign (Ankr Forge) designed to grow on-chain volume for Canton, and white-label RPC infrastructure support handling a portion of network traffic. This is a mid-tier commitment appropriate for an infrastructure partner establishing a new relationship with the network, while leaving room to expand as Ankr's Canton-specific footprint grows. The final weight increment is deliberately contingent, it only accrues once the RPC white-label arrangement is scoped and agreed with the Canton team, keeping the heaviest infrastructure commitment tied to a concrete, mutually-defined deliverable rather than a speculative one.

Beyond infrastructure, Ankr intends to operate as a long-term ecosystem partner, contributing not only compute and reliability, but also go-to-market strategies, such as Ankr Forge, that add measurable value to the Canton ecosystem.

## Backwards Compatibility

This CIP does not introduce protocol-level changes and has no backwards-compatibility impact on existing Validators, Super Validators, or applications.

## Copyright

This CIP is licensed under CC0-1.0: Creative Commons CC0 1.0 Universal.

## Changelog

- **2026-09-22:** Initial draft of the proposal.
