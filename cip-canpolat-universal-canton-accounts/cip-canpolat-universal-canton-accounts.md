<pre>
  CIP: CIP-canpolat-Universal-Canton-Accounts
  Layer: Wallet, Validator, Scan
  Title: Universal Canton Accounts: one key, every wallet
  Author:
    Abdulkadir Canpolat
  Status: Draft
  Type: Standards Track
  Created: 2026-11-21
  License: CC0-1.0
  Requires: CIP-0056, CIP-0103
</pre>

# Universal Canton Accounts: one key, every wallet

## Abstract

A Canton account today is tied to the wallet that created it. The same recovery phrase imported into another wallet usually yields a different key or a different party, and even with the right party the other wallet cannot see the account's non-CC holdings or build transactions on them, because those contracts are visible only to the party's hosting validator. This CIP defines six parts that together make a Canton account portable across every conforming wallet, the way an EVM address works in every EVM wallet:

1. **UCA-1 Key derivation.** One derivation scheme for Canton keys on the registered SLIP-0044 coin type, with the namespace key and the protocol signing keys on separate branches so signing keys rotate without changing the partyID, plus a registry of named legacy schemes so existing accounts stay importable.
2. **UCA-2 Deterministic party id, account credential and discovery.** New parties take a hint derived from the key, so a key maps to one party everywhere. Every party, including those created before this rule, can carry an account credential signed by its namespace key, and a discovery endpoint finds parties by key or account identifier.
3. **UCA-3 Host data service.** The validator hosting a party serves that party's contracts, for disclosure, to any wallet that proves control of the party's key, so the wallet can prepare transactions on its own node.
4. **UCA-4 Portable hosting.** The owner can add another validator as a host through party replication, and later move.
5. **UCA-5 Package availability.** A shared package registry so that the nodes preparing, executing and confirming a dApp's transactions all have its packages.
6. **UCA-6 Host share of app rewards.** When another wallet serves a party, the party's host keeps a fixed share of the app rewards, through the existing beneficiary split.

Three public conformance levels state what each wallet, validator and Scan provider supports.

## Specification

The keywords MUST, SHOULD and MAY are used as in RFC 2119.

### UCA-1 Key derivation

1. **Mnemonic.** BIP-39, English wordlist, 12 or 24 words, empty passphrase by default.
2. **Derivation.** ed25519 with SLIP-0010 derivation (hardened at every level), where 6767 is the SLIP-0044 coin type registered for Canton Coin and `a` is the account index (0 for the first account):
   - **Namespace key** `m/44'/6767'/a'/0'/0'`. Its fingerprint is the party's namespace, so it fixes the partyID. It signs topology changes and the UCA-2 account credential.
   - **Protocol signing key** `m/44'/6767'/a'/1'/i'`, index `i` from 0. These keys are listed in the party's `PartyToKeyMapping` and sign transactions. A wallet rotates to index `i+1`, or moves to a threshold set, without touching the namespace key, so the partyID never changes.
   - A wallet MAY use the namespace key as the first signing key, as external party onboarding does by default; import still works because UCA-2 discovery returns the current `PartyToKeyMapping`.
3. **Raw key.** A wallet MUST also accept a raw 32-byte ed25519 private key (64 hex characters).
4. **Legacy scheme registry.** Derivations used before this CIP are published as named schemes in the CIP repository. The first entry is `wallet-sdk-seed32`: the first 32 bytes of the BIP-39 seed, as in the Wallet SDK guide. Wallets with their own scheme register it, for example `vendor-native-v1`: `sha256(bip39_seed || "VENDOR_CONTEXT")`.
5. **Import order.** On import a wallet derives the standard key and every registered legacy key, asks UCA-2 which of them control existing parties, and shows the user what it found.
6. **Export.** A wallet MUST let the user export the raw private key, and the phrase when one exists, behind the wallet's own authentication.
7. **Reference SDK.** The Wallet SDK adopts the path in item 2 as its default (Wallet SDK issue #2164), keeping `wallet-sdk-seed32` for existing keys.

### UCA-2 Deterministic party id and discovery

1. **Deterministic hint.** A wallet creating a new party MUST use the hint `hex(sha256(public_key))[0:48]`, where `public_key` is the raw 32-byte ed25519 public key. With the fingerprint also coming from the key, the party id is computed from the key alone, like an EVM address. This rule is in production use: all 610 user accounts of one mainnet application follow it (checked 2026-11-21).
2. **Discovery for older parties.** Scan MUST serve `GET /api/scan/v0/namespaces/{fingerprint}/parties`, listing each party in that namespace with its hosts, their permissions and the confirmation threshold, as recorded in the global synchronizer's topology state, plus each host's UCA-3 base URL when published.
3. **Access.** The discovery endpoint MUST be reachable by any wallet, directly or through a public mirror, since Scan instances may restrict direct access.
4. **Wallet behaviour.** On import a wallet MUST use the deterministic party when it exists, otherwise query discovery, and MUST NOT silently create a new party when one already exists.
5. **Account credential.** The deterministic identifier is also carried as a credential associated with the partyID, so it covers every party whatever its hint, with no migration. The credential states the account identifier `hex(sha256(namespace_public_key))[0:48]`, the partyID, the namespace public key, the current signing keys and threshold, the hosts and the issue time, and is signed by the party's namespace key. A verifier checks the signature and checks against topology state that the key's fingerprint is the party's namespace; no issuer is trusted. A conforming wallet MUST issue the credential for every party it creates or imports and refresh it when keys or hosts change. Its representation follows the Identity & Metadata SIG credentials standard once published; the reference code uses a minimal form until then.
6. **Discovery by identifier.** Discovery MUST also answer by account identifier, returning the parties whose credential carries it.

### UCA-3 Host data service

A party's non-CC contracts are held only by the nodes hosting its stakeholders. The host is therefore the one place a wallet on another node can get them. Every validator that hosts external parties MUST run this service for those parties. It never holds a key.

**Implementations.** This section defines an interface, not a component. Any implementation that passes the conformance suite conforms. The Wallet Gateway is a natural carrier: when it exposes these endpoints with party-key authentication, every wallet works with it. No conforming wallet may depend on one vendor's implementation.

**Authentication.** Each request carries `X-UCA-Party`, `X-UCA-Ts` (unix ms) and `X-UCA-Sig`: an ed25519 signature by one of the party's current signing keys (UCA-1) over `ts \n method \n path \n sha256(body)`. Requests older than 60 seconds or replayed are refused. Only the party itself can read its data; no node user token is involved.

**Required endpoints** (prefix `/uca/v1`):

| Method and path | Purpose |
|---|---|
| `GET /parties/{party}/holdings` | Active holdings through the CIP-0056 / CIP-0112 holding interfaces, with created-event blobs for use as disclosed contracts. |
| `POST /parties/{party}/contracts` | Active contracts of given templates or interfaces, with created-event blobs. |
| `GET /parties/{party}/pending` | Open transfer instructions and offers addressed to the party. |
| `GET /packages` | Packages vetted on this host, so a wallet knows which dApp flows its confirmations will accept. |

**Optional endpoints**, for wallets without their own node:

| Method and path | Purpose |
|---|---|
| `POST /parties/{party}/prepare` | Interactive prepare with `actAs = [party]`; returns the prepared transaction and its hash, plus any traffic charge as a standard transfer. |
| `POST /parties/{party}/execute` | Executes a prepared transaction with the party's signature. |

**Scope of data.** The service returns only contracts on which the signing party is a stakeholder (signatory or observer), and the host's vetted package list. It never returns another party's contracts, balances or transaction history, and it never returns past (archived) contracts.

**Rate limits.** The service MUST apply limits per party and publish them in its metadata. The recommended minimum is 60 read requests per minute with a burst of 20, and 10 prepare or execute requests per minute. A request above the limit receives HTTP 429 with a `Retry-After` header. A request with a missing, expired, replayed or invalid signature receives HTTP 401 before any lookup and does not count toward the party's quota.

**Obligations.** The service MUST serve every hosted party that has not opted out, MUST apply the same limits to all callers, and MUST publish its base URL in the validator's metadata so UCA-2 can return it.

**Effect.** With UCA-1 to UCA-3 a user imports their phrase into any wallet; the wallet computes or discovers the party, reads its contracts from the host, prepares and executes on its own node or through the optional endpoints, and signs locally. The party's host confirms as it does today.

### UCA-4 Portable hosting

1. **Add a host.** The owner MAY add the importing wallet's validator as an additional host by signing the `PartyToParticipant` change with the party's namespace key. The new host receives the party's active contract set through party replication: the documented offline procedure today, with party-level freezing from Party Mobility Phase 1, and online replication when the later Party Mobility work is delivered. UCA-4 defines the wallet-side flow and its conformance checks; the protocol work belongs to Party Mobility.
2. **Move.** Removing the old host waits until party offboarding is supported by Canton. Until then, multi-hosting is the supported form of moving.
3. **Rights and pre-approvals.** Rights granted to a party, such as a Featured App right, belong to the party and are unaffected by hosting. Transfer pre-approvals name a provider and expire; the new host recreates them in the same flow as the host change.
4. **Threshold safety.** A host change MUST NOT leave fewer fully onboarded hosts than the party's confirmation threshold.

### UCA-5 Package availability

1. **Shared registry.** dApp packages are published to a shared registry with package id, source hash and an independent audit report.
2. **Vetting policy.** Hosts conforming at Level 3 vet registry packages whose publisher holds a Featured App right or meets the registry's audit bar, without per-dApp negotiation.
3. **Availability check.** UCA-3 `packages` and the registry together tell a wallet whether every node in a transaction's path can process it.
4. **Per-party choice and per-host state.** When parties can choose whether to use a given package, a wallet needs that choice and the vetting state of each confirming host before it submits. UCA-5 asks the package directory work to expose both, queryable per party and per host.

### UCA-6 Host share of app rewards

When a party is served by a wallet on another validator, the party's host still does work: it runs the UCA-3 service and confirms every transaction. Without a share of the rewards those transactions produce, hosts have no reason to serve other wallets, and portability stalls. UCA-6 gives the host a fixed share, using reward mechanisms that already exist.

1. **Scope.** Applies to transactions prepared through UCA-3 data by a wallet whose validator is not a host of the party, and that carry an app reward (a featured activity marker, or token-standard app reward metadata).
2. **Split.** The reward beneficiaries are split between the serving wallet's provider party and the party's hosting validators: by default **70% serving wallet, 30% hosts**, the host share divided equally among the party's hosts with Confirmation permission. The final percentages are set by the Tokenomics Committee, or by the Super Validators' CIP on host rewards where that CIP covers this case, and published with this CIP; wallets do not choose them per transaction. The author contributes per-transaction marker and traffic data from a live application to that process.
3. **Mechanism.** No protocol change. Featured activity markers already accept `beneficiaries` with weights in (0, 1] summing to 1.0 (up to 20 beneficiaries), and the token standard carries `app-reward-beneficiaries` and `app-reward-beneficiary-weights` metadata, validated to sum to 1.0. Splitting divides an existing reward; it never increases it, so it adds no inflation and leaves the 1:1 marker-to-burn rule untouched.
4. **Host identity.** Each host publishes its reward party in its UCA-3 metadata; UCA-2 discovery returns it.
5. **Own wallet.** When the serving wallet's validator is itself a host of the party, the split does not apply.
6. **Conformance.** Level 2 includes applying the published split; the conformance suite checks it.

### Conformance levels

| Level | Wallets | Validators hosting external parties | Scan providers |
|---|---|---|---|
| **1 Import** | UCA-1 import and export; UCA-2 deterministic party and discovery | Publish the UCA-3 base URL | UCA-2 endpoint, publicly reachable |
| **2 Operate** | Level 1, plus reading from any host's UCA-3 service, preparing transactions with disclosed contracts, and applying the UCA-6 split | UCA-3 required endpoints | Host URLs in UCA-2 responses |
| **3 Move** | Level 2, plus UCA-4 host changes | UCA-4 support; UCA-5 vetting policy | Hosting history per party |

A public conformance suite decides the level: key vectors for UCA-1, a discovery fixture for UCA-2, a test harness for UCA-3.

## Motivation

External parties already give users self-custody: the user holds the signing key and the validator hosts the party. The protocol already allows a lot of mobility: the participant that prepares an external party's transaction does not need to host that party, and neither does the participant that executes it (Canton external party reference). What is missing is the layer of conventions that lets a key, its party and its contracts be found and used from any wallet.

On EVM chains portability comes from three things: a shared derivation (BIP-39, BIP-32, BIP-44), an address computed from the public key alone, and state that any node can read. On Canton:

| EVM property | Canton today | Effect |
|---|---|---|
| Shared derivation path | Keys come from BIP-39 phrases, but derivations differ. The Wallet SDK guide uses the first 32 bytes of the BIP-39 seed as the ed25519 key, with no path. Wallets use their own schemes. SLIP-0044 coin type 6767 is registered for Canton Coin, but no documented derivation uses it. | The same phrase gives different keys in different wallets. |
| Address computed from the key | Party id is `hint::fingerprint`. The fingerprint comes from the key; the hint "can be anything that is unique for the fingerprint" (Wallet SDK guide). | The same key gives different parties in different wallets. |
| Any node reads the account | CC is publicly visible through the scan service, since every Amulet has the DSO as a signatory. Other token holdings and application contracts are distributed only to the nodes hosting their stakeholders. | Another wallet can show the CC balance, but not the other holdings, and cannot obtain the contracts a transaction needs. |
| Any node can submit | Preparing and executing nodes need not host the party, but the preparing node needs the input contracts (as disclosed contracts) and the packages, the executing node must have vetted the packages, and the party's confirming hosts must confirm. | Acting from another wallet needs contracts that only the host has, and packages that each node vets on its own. No standard way exists to get either. |
| Contract code is global | Packages are vetted node by node. | A dApp flow fails on any node in the path that lacks the package. |

The consequences reach the whole network:

- **Users** are tied to the wallet that created their account. If that wallet stops serving them, the key alone does not give them practical access in another wallet.
- **dApps** integrate wallet by wallet and wait for each wallet operator to vet their packages. CIP-0103 solves the connection between dApp and wallet, not the account underneath.
- **Featured App guidance** asks asset-moving platforms for integration with independent wallets. That requirement is only as achievable as wallet interoperability.
- **Exchanges and custodians** run separate account models, so moving between them is always a transfer, never an import.

### Evidence from production

Each gap below was met by application developers on Canton mainnet in 2026, in a deployment with its own validator, external-party accounts for every user, and integrations with an independent wallet and a DEX:

| Date | Observation | Part |
|---|---|---|
| 2026-10-14 | A dApp transaction prepared through a widely used wallet failed with `TEMPLATES_OR_INTERFACES_NOT_FOUND`: the dApp's package was not on the wallet's node. The same payment worked as a plain CC transfer. | UCA-5 |
| 2026-10-14 | That wallet takes network traffic from a prepaid fee balance only the user can fund, so a user holding CC could not sign until topping it up. | UCA-3 |
| Oct 2026 | The interactive prepare endpoint of the validator release in use accepted one command per transaction (`Preparing multiple commands is currently not supported`). | UCA-3 |
| Sep to Nov 2026 | Super Validator Scan endpoints answered only from approved validator addresses, so a wallet elsewhere could not use them directly. | UCA-2 |
| 2026-11-12 | Transfer pre-approvals are contracts with a provider and an expiry on a given package version; 144 had to be recreated on the current version. | UCA-4 |
| Sep 2026 | Re-onboarding a validator left ten parties for one operator identity, and importing an active contract set onto the new node was not usable; the working path was fresh parties. | UCA-4 |
| 2026-11-19 | A user lost access after the browser cleared local storage. The recovery phrase worked only in the one wallet that knows its derivation. | UCA-1 |
| 2026-11-21 | Hint practice differs: the Wallet SDK guide leaves it free, one production application derives it from the key, a custodian uses a fixed letter. | UCA-2 |
| 2026-11-21 | A party other than the owner submitted, signed only by itself, a transaction that moved the owner's CC: authority came from a contract the owner had signed earlier, and the owner's holdings were passed as disclosed contracts. All parties were on one validator; doing the same across validators is what UCA-3 standardises. | UCA-3 |
| 2026-11-21 | A launchpad and a DEX exposed no individual trades through a public API; integration needed each venue's cooperation. | UCA-3, UCA-5 |
| 2026-11-21 | No standard key exists for a transfer memo. CIP-0056 defines `splice.lfdecentralizedtrust.org/reason` for explaining a withdrawal or abort; applications reuse it as a memo, and a DEX documents a memo without naming a key. | Related work |

## Relation to ongoing work

UCA is the user-side contract that connects the following efforts. Each keeps its own scope; UCA fixes what a wallet can rely on and how conformance is checked.

| Area | Ongoing work | What UCA adds |
|---|---|---|
| Key derivation | Wallet SDK issue #2164; security specialists | One scheme with separate namespace and signing branches, legacy registry, test vectors |
| Identifier and discovery | Identity & Metadata SIG credentials proposal | Account credential profile and discovery by key or identifier |
| Host data | Wallet Gateway | Implementation-neutral interface with party-key authentication |
| Hosting | Party Mobility Phase 1 grant and later phases | Wallet-side host change flow, threshold safety, conformance |
| Packages | Package directory and per-party package choice | Per-host vetting state for wallets |
| Host rewards | Super Validator discussion and upcoming CIP | Default split, existing beneficiary mechanism, live data |

## Rationale

- **Use what the protocol already allows.** Preparing and executing nodes need not host the party. The missing pieces are conventions and data access, which this CIP adds without protocol changes. Only full moving waits for party replication and offboarding.
- **Deterministic hint over discovery alone.** Discovery finds every party a key controls, but a key-derived hint makes most lookups unnecessary and gives the EVM property directly.
- **Registered legacy schemes.** Requiring every wallet to migrate keys would strand existing users; a registry keeps every past derivation importable.
- **Hosts must want to serve.** A host that runs the data service and confirms transactions for other wallets needs a reason to do it. UCA-6 gives it a share of what those transactions earn, using the beneficiary split that markers and the token standard already support.
- **Levels.** A wallet can adopt Level 1 quickly. Making everything mandatory at once would delay all of it.
- **Related work, out of scope.** A standard metadata key for a transfer memo, read the same way by wallets, exchanges and DEXes, is a natural companion proposal.

## Backwards compatibility

- Existing parties keep their ids, hosts and contracts. Nothing moves without the owner's signature.
- Existing derivations stay valid through the legacy registry.
- Parties created before this CIP, with any hint, are covered by the UCA-2 account credential without moving.
- UCA-3 is additive and reads only what the host already holds for the party.
- CIP-0103 connections are unchanged.

## Security considerations

- **No key leaves the user.** The host service and any new host never receive a private key. Prepared transactions are signed locally.
- **Data access.** Only a request signed by the party's key reads the party's contracts. A 60-second window, replay refusal and the published per-party rate limits of UCA-3 stop abuse.
- **Prepared transaction review.** Wallets MUST decode and show the effect of a prepared transaction before signing, as for any external signing.
- **Discovery privacy.** UCA-2 exposes only what the topology state already exposes to connected participants: party ids and their hosts. No contracts or balances.
- **Hosting changes.** UCA-4 needs the party's own signature and keeps the confirmation threshold.
- **Key separation.** The namespace key, which fixes the partyID, is used only for topology changes and the account credential. Day-to-day signing uses separate keys that can rotate, so a compromised signing key is replaced without changing the account.
- **Credential trust.** The account credential needs no issuer: it is valid only if signed by the key whose fingerprint is the party's namespace in topology state.

## Reference implementation

Reference code for UCA-1, UCA-2 (including the account credential), UCA-3 and UCA-6 is in the `code/` folder next to this document, in TypeScript and Python, with test vectors. The TypeScript and Python implementations produce identical keys and identical credential signatures.

The production work is built in the open as separate work packages any team can take on through the Canton Dev Fund:

1. UCA-1 in the Wallet SDK (continuing issue #2164), with test vectors and the legacy registry.
2. UCA-2 as a Scan endpoint over topology state, with a public mirror.
3. UCA-3 as an open validator component next to the external-party APIs validators already run.
4. UCA-4 on top of party replication, coordinated with the Party Mobility work.
5. UCA-5 as a Foundation-operated package registry with an audit bar.
6. The conformance suite, maintained by the Foundation.

## Adoption plan

| Phase | Scope | Who |
|---|---|---|
| 0 | Draft on cip-discuss, feedback from wallets, validators, custodians and Scan providers | Author, community |
| 1 | UCA-1 in the Wallet SDK, UCA-2 endpoint and mirror; Level 1 in wallets | Dev Fund grantees, wallet teams, Scan maintainers |
| 2 | UCA-3 component; Level 2 in independent wallets and custodians | Dev Fund grantees, validator operators |
| 3 | UCA-5 registry; Level 3 once party replication is available to operators | Foundation, validators, Party Mobility |
| 4 | Conformance level shown in wallet listings and considered in Featured App reviews | Foundation, Tokenomics Committee |

## References

- Canton external party reference (preparing and executing participants): docs.canton.network/overview/reference/external-party
- Wallet SDK guide, creating an external party (BIP-39 seed, party hint): docs.canton.network/sdks-tools/sdks/wallet-sdk/guides/creating-an-external-party
- SLIP-0044, coin type 6767 Canton Coin: github.com/satoshilabs/slips/blob/master/slip-0044.md
- Splice Amulet template (signatories dso, owner): docs.canton.network/sdks-tools/api-reference/splice-daml/splice-amulet
- Canton Coin tokenomics ("CC balances and transaction history are publicly visible via the network's scan service")
- Party management, replication and multi-hosting: docs.canton.network/global-synchronizer/production-operations/party-management
- CIP-0056, CIP-0103, CIP-0112
- Wallet SDK issue #2164: github.com/canton-network/wallet/issues/2164
- Dev Fund proposal #810 and milestone #952 (Party Mobility): github.com/canton-foundation/canton-dev-fund

## Copyright

This CIP is licensed under CC0-1.0.
