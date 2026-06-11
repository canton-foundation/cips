# CIP-XXXX: Building a Name Resolution Service for Permissioned Blockchain Infrastructure - A Hybrid Tiered Approach

<pre>
CIP: XXXX;
Title: Building a Name Resolution Service for Permissioned Blockchain Infrastructure - A Hybrid Tiered Approach
Author: Zhi Zhang
Discussions-To: https://lists.sync.global/g/cip-discuss
Status: Draft
Type: Informational
Created: 2026-06-09
</pre>

# Abstract

This paper recommends how a **name resolution service**, one that maps human-readable metadata to machine-readable identifiers, such as Canton `Party` IDs should be designed for a permissioned network whose primary adopters are regulated financial institutions.

Its central claim is that Canton should **not adopt a single resolution approach**. Instead, it should adopt a **hybrid, tiered architecture**, where metadata is classified into tiers by how mission-critical it is, and each tier is served by a resolution service whose trust level matches it. 

Mission-critical mappings (e.g. bank name to settlement address) are served by a highly trusted Tier 1 service, likely operated by one or more well-trusted super validators. Less critical mappings are served by less trusted or individually hosted services owned by the data owners themselves. 

A benefit of this structure is that institutions can **bring their own existing name resolution mapping sets into Canton ecosystem**, preserving consistency with their existing established processes and practices.  

# The Problem Statement

Canton identifies parties by `Party` IDs, which are long and opaque strings that bind a meaningful label to a cryptographic namespace fingerprint. These identifiers are precise and secure, but not human-usable. No operations analyst will eyeball a fingerprint before authorizing a settlement, and no end user will type one into a payment screen. Every practical workflow therefore needs a layer that translates between what people recognize and what the ledger enforces.

### Existing Solutions

There are multiple types of well known and widely implemented name resolution service architectures, each carrying its own benefits and tradeoffs serving different scenarios.

##### DNS-like
**Key words:** hierarchical, partitioned
A root authority delegates control downward, and the namespace is partitioned so no two registries own the same name (`*.jpmorgan.canton` and `*.goldman.canton` can't collide). Battle-tested at internet scale and delegation maps naturally onto institutions, but it tolerates caching, propagation delay, and divergent answers, which is fine for websites and undesirable for cases like settlement routing.

##### ENS-like
**Key words:** single canonical registry, decentralized governance
One unpartitioned namespace backed by a single canonical on-chain list. Conflicts are prevented at registration: a name is registered once, and a second registration fails. Delivers exactly one unambiguous answer per name, but permissionless registration invites squatting, and nothing ties a name to a real-world identity (anyone can register `jpmorgan.eth`).

##### Federated multi-resolver
**Key words:** multi-source, relying-party trust, divergence as signal
Many independent resolvers answer the same query, agreement raises confidence, divergence is surfaced to the application. Each relying party picks which resolvers to trust. Excellent for verification and importing claims from existing systems, but poor for routing money: the same name can resolve differently across apps, and bad-faith resolvers can grief or force conflicts.

### Canton's Uniqueness

Most name services were designed for the open internet (DNS) or permissionless chains (ENS). Canton's environment differs in three ways that change the requirements:

- **It is permissioned.** Participants are onboarded, known, and accountable. A naming layer can lean on real-world legal identity and existing trust relationships rather than manufacturing trust from scratch.
- **It primarily serves regulated financial institutions.** The dominant failure mode to engineer against is impersonation that misdirects value, not link rot. Resolving "Bank A" to the wrong party in a settlement flow is a potentially irreversible financial event, not a degraded experience.
- **Institutions arrive with pre-existing naming systems.** Banks already maintain authoritative directories, SWIFT/BIC mappings, and curated address books. Adoption is least disruptive when they can keep using them on Canton rather than migrating onto a registry they do not control.

### Trust Must Match the Stakes

Depending on the type of metadata being resolved, a correspondingly trusted service should answer the query. Trust in the source must scale with the consequence of a wrong answer.

- **Mission-critical metadata**: Name resolutions like "Bank of Example" to settlement `Party` ID, or "USDC" to issuer, must come from a very trusted source, such as a top-tier resolution service, likely operated by one or more **well-trusted super validators**. A spoofed answer here misdirects value, possibly irreversibly.
- **Less critical metadata**: display names, avatars, a dApp's own product names, an institution's internal address book, all can be served by **less trusted or individually hosted services owned by the data owners** themselves. A wrong answer is a cosmetic blemish, not a financial event.

This gradient is the seed of the paper's recommendation: not one name service, but a **tiered set of them**, each matched to the criticality of the metadata it serves.

### Serving Needs of Existing Institutional Users

Another benefit of the tiered structure: individual data and service owners can **bring their existing name-resolution mapping sets into Canton**.

Consider a pre-established financial institution newly onboarded onto the network. It already maintains authoritative directories, such as counterparty reference data, SWIFT/BIC mappings, curated address books, all embedded in existing systems. Rather than re-registering everything in a network-wide registry it does not control, the institution **imports its mappings wholesale** into a resolver it owns, keeping its workflows consistent with what it already runs.

Imported mappings are **scoped to their owner** by default, authoritative for that institution's workflows, not imposed on the network, so two institutions importing conflicting mappings never collide. Only the few mappings needing network-wide recognition (e.g. the institution's own settlement identity) are registered in the top-tier service.

# Goals and non-goals

### Goals

- Recommend a **hybrid, tiered architecture**: classify metadata by how mission-critical its resolution is, and match each tier to a service with the corresponding trust level and operator, from a super-validator-operated registry for critical mappings down to owner-hosted resolvers for the rest.
- Enable institutions to **bring their existing name-resolution mappings into Canton**, keeping consistency with established processes without forcing migration onto a registry they do not control.
- Serve as the **rubric against which concrete name-service proposals are assessed**.

### Non-Goals

- This paper does **not** specify wire formats, Daml templates, API schemas, fee models, or a governance charter, those belong in dedicated Standards Track CIPs.
- This paper does **not** endorse a single existing proposal to the exclusion of others.
- This paper does **not** attempt to solve general-purpose decentralized identity; it is scoped to resolving names/metadata to Canton identifiers.

# The Proposed Solution: A hybrid, Tiered Name-Resolution Service

### The Core Idea:  No Single Approach

Canton should not solve its metadata problem with a single name-resolution approach. The metadata spans too wide a spectrum, ranging from "which `Party` do I settle against?" to "what logo should this wallet show?". No one mechanism can serve both ends well. A mechanism strong enough for settlement is too expensive and restrictive for logos. One cheap enough for logos is dangerously weak for settlement.

Instead, classify metadata into **tiers by how mission-critical its resolution is**, and serve each tier with a service whose **trust level, operator, and guarantees match**.

### Mission-Critical Resolution Comes From Highly Trusted Sources

For Tier 1, a wrong answer is a misdirected, possibly irreversible financial event. These mappings must come from a very trusted source: a registry operated by a **well-trusted super validator** (or a small governed set of them), reusing the accountability and availability the network has already vetted. Registration is deliberate and verified against the recognized source of truth (e.g. SWIFT directory, GLEIF); a name is registered once, and conflicts are **prevented at registration**, never reconciled later.

### Less Critical Resolution Is Owned by the Data Owners

Outside Tier 1, the cost of a wrong answer drops sharply while the value of flexibility and owner control rises. These tiers are served by **less trusted, or individually hosted, services owned by the data owners**, for a dApp resolving its own product names, an institution serving its own display metadata. Relying parties choose which resolvers to trust and in what precedence. This spends super-validator-grade trust only where errors are catastrophic, keeping everything else cheap and under the owner's control.

### Bring Your Own Mappings

The tiered structure also lets data and service owners **bring their existing name-resolution mapping sets into Canton**. A pre-established financial institution, newly onboarded, can import its directories, including counterparty reference data, SWIFT/BIC mappings, address books. All wholesale into a resolver it owns, keeping consistency with existing processes and forms. Imported mappings are **scoped to their owner** by default, so two institutions' conflicting imports never collide; only mappings needing network-wide recognition (e.g. the institution's settlement identity) are registered in Tier 1.
  

# Assumptions & Design Priorities

The recommendations in this paper are derived from an explicit priority ordering. These are **assumptions, not conclusions**; if the working group weights them differently, the recommended architecture shifts accordingly.

1. **Spoof-resistance is the top priority.** For value-bearing flows, preventing impersonation matters more than feature breadth or namespace richness. A naming layer that resolves a counterparty incorrectly is not a degraded experience. It is a potentially irreversible financial event.
2. **Resolution availability should track the ledger or application it serves.** Workflows that depend on resolution inherit its uptime. Where resolution is deliberately moved off-ledger (e.g. to limit ACS/Scan load), that trade-off must be named and bounded, and fail-closed is generally safer than fail-open for routing.
3. **Risk-averse, proven-mechanism bias.** On a high-stakes network, prefer mechanisms with a real-world track record (registries, delegation) over novel constructs being validated for the first time in production.
4. **Trust is asserted by the relying party, not imposed by the network.** No participant should be forced to fully trust any single registry or resolver. Participants choose whom to trust, in what precedence, and may operate their own resolvers.
