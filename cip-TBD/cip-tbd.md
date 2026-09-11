<pre>
CIP: TBD
Layer: Governance
Title: London Stock Exchange Group (LSEG) Super Validator Participation
Author: Bud Novin 
Type: Governance
Status: Proposed
Created: 2026-09-02
Approved: TBD
License: CC0-1.0
</pre>

## 1. Summary
This CIP proposes granting London Stock Exchange Group (LSEG) participation as a Super Validator (SV) with a maximum Weight of 10. Given LSEG's strategic importance to the Canton ecosystem, its inclusion will bring significant financial market infrastructure expertise, alignment with global payments and post-trade markets, and meaningful contributions to network governance and institutional adoption.

Unlike other CIPs, this program contains confidential commitments to the ecosystem. Those commitments and milestones have been agreed with the Tokenomics and SVAC and will be made available to the public when appropriate and as needed.

 - **Total Earnable Weight:** 10 (max)

- **Accrual Destination:** Escrow, consistent with existing SV escrow mechanics.

- **Confidentiality:** The Super Validator Accountability Committee (SVAC) will review the milestones and inform SVs if they have been met.

## 2. Motivation
London Stock Exchange Group (LSEG) is a leading global financial markets infrastructure provider with significant reach across capital markets, post-trade, and payments.

LSEG’s participation as a Super Validator would strengthen Canton’ as infrastructure for capital markets and cross-jurisdictional settlement.

## 3. Deliverables & Milestones
The specific deliverables and milestones for LSEG have been agreed upon privately with the Canton Foundation’s Tokenomics and SVAC Committees.

- **Milestone Review Process:** The SVAC will confirm whether LSEG has successfully met each milestone.

- **Reward Mechanism:** Upon confirmation, rewards associated with milestones will be released from escrow.

- **Confidentiality:** LSEG's specific commitments, timelines, and commercial details will remain confidential until the Foundation and LSEG determine it is appropriate to disclose them.

## 4. SV Mechanics
- An extraBeneficiary PartyID associated with the ‘escrowed’ Super Validator will be setup by the Foundation, or another SV node operator approved to provide SV rewards escrow services, with an SV Weight at the maximum earnable weight.

  - The Applicant is responsible for coordinating the process of setting up the escrowed weights with the GSF and the operator of the SV node.

  - The Applicant is responsible for all costs associated with the operation of the representative SV

  - The representative SV will NOT mint rewards on a block by block basis

  - All representative SV rewards will go to the Unclaimed Rewards pool

- Applicant is required to present proof of successful completed milestones to the Tokenomics Working Group

  - Applicant is required to present a calculation for number of Canton Coin it should earn for meeting the requirements of the milestone

- If the Tokenomics Working Group agrees the milestone has been met and agrees with the calculation, an announcement will be sent via the Tokenomics-Announce mailing List

  - ⅔ of Super Validator Operators will then assign a portion of the Unclaimed Rewards to be minted by the Applicant’s Validator

  - ⅔ of the Super Validator Operators will update their configurations to allow Applicant to takeover a portion of their SV Weight on a go-forward basis

- If any milestones and associated rewards are not achieved by the deadline

  - Applicant will be notified they have not met a deliverable by the Foundation

  - Remaining SV Weight on the representative SV will be removed from the SV Operator configs

  - The Tokenomics Working Group will make a recommendation to the SVs on what to do with the Unclaimed Rewards

## Copyright
This CIP is licensed under CC0-1.0: Creative Commons CC0 1.0 Universal.

## Changelog
2026-09-08: draft published
