<pre>
  CIP: CIP TBD
  Layer: Daml
  Title: Canton Network Credentials Standard
  Author:
    PixelPlex, Simon Meier
  License: CC0-1.0
  Status: Draft
  Type: Standards Track
  Created: 2026-01-09
</pre>

FIXME:
- remove KYC use-cases; generally shrink use-cases to the essential ones
- SV credential registry -> DSO credential registry
- use kebab-case and cip prefix in keys
- change lookup API to be limited
- change rich credential lookup API in diagram
  - make the rich credential lookup API be served by explorers
  - credential lookup API served by scan should only support queries of the form (property, issuer?, holder?)
    - this is all that is required to support lookups of the registry API, and can be served with a single index in Scan DB
- link to registry info HTTP API
- self-review with copilot
- reopen draft PR and adjust links
- comment on
- adjust API links to draft PR

## Abstract

Define standard APIs for storing, retrieving, and using credentials on the Canton Network.

## Specification

The specification of this CIP consists of three parts:

1. **Credential Registry APIs**: define standard APIs for storing, retrieving, and using Canton Network credentials.
2. **DSO Credentials Registry**: specifies how these APIs are implemented in a decentralized registry run across the SV nodes.
3. **Standardized Application and Metadata Discovery**:
   specifies how these APIs are used to standardize the discovery of specific
   kinds of applications on the network and their metadata
   like for example the off-ledger APIs of [CIP-56 asset registries](https://github.com/global-synchronizer-foundation/cips/blob/main/cip-0056/cip-0056.md#off-ledger-api-discovery-and-access).

We provide details on each of these parts in the following subsections.

## Credential Registry APIs

The APIs are inspired by the [W3C Verifiable Credentials Data Model](https://www.w3.org/TR/vc-data-model-2.0/). They are intended to serve as fundamental building blocks for use-cases such as self-publishing party profile information, providing trustworthy human-readable names for parties, or sharing KYC credentials across applications. To keep the scope of this CIP manageable, this CIP only sketches how to implement such use-cases on top of it, but does not provide normative guidance. See [Use Case Analysis](#use-case-analysis) for more information.

### Overview

This standard is concerned with entities and apps acting in the following roles:

* **credential issuers**: entities that issue credentials and back their veracity
* **credential holders**: entities that hold credentials and agree to the credential's claims
* **credential registry administrators**: entities that store and serve credentials that were jointly published by their issuer and holder
* **network explorers**: entities building apps for exploring Canton Network activity and structure
* **app providers**: entities that operate apps that retrieve and use credentials in their UIs and/or in their on-ledger workflows
* **app users**: entities that use apps that use credentials

Entities often act in multiple roles. For example, a [CIP-56 token administrator that self-publishes their off-ledger token registry URLs](https://github.com/global-synchronizer-foundation/cips/blob/main/cip-0056/cip-0056.md#off-ledger-api-discovery-and-access) to the SV credential registry acts both as the credential issuer and the credential holder of the corresponding credential. The claim in the credential would associate the key `splice.lfdecentralizedtrust.org/registryUrls` to the actual URLs. Token standard wallets are typical apps using credentials with that kind of key. They use them to resolve the admin party-ids encountered in tokens held by a wallet user to the [URLs to query to execute transfers and other actions](https://github.com/global-synchronizer-foundation/cips/blob/main/cip-0056/cip-0056.md#utxo-access-management).

Another example is an identity verification service that acts both as a credential issuer and a credential registry serving credentials whose claims associate the verified identities with the party-id of the credential holder.

The following diagram shows how the APIs defined in this CIP mediate the interaction between the apps in the different roles. Arrows point from clients to servers of APIs.

![](images/credentials_lifecycle.png)

As we can see, the APIs cover exactly the interaction between the different kinds of apps and credential registries. Credential holders use custom APIs and UIs to interact with credential issuers. App users are not shown in the diagram as they do not directly interact with any of the APIs standardized in this CIP. They rely on the app provider making suitable choices with respect to how to use the standardized APIs to make use of credentials in the apps UIs and on-ledger workflows.

The diagram does not show the registry info HTTP API, which is used for extensibility. It allows apps interacting with the registry to figure out what standards the registry supports.

In the following sub-sections, we specify the different APIs. We conclude with a specification of the decentralized credential registry implemented by the SVs.

### Daml APIs

The Daml APIs mediate the on-ledger interactions of the different applications with the credentials registry. They consist of the mandatory implementation of the `Credential` Interface and an optional implementation of the `CredentialFactory` interface. We explain them in the following two sections. We specify the expected usage of these APIs credential issuers and wallets thereafter.

#### Credential Interface

The schema of credentials is defined by the following Daml code (copied from [Draft PR](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-808147bf36f1c087a42b92d67d2021c2ca203076cc0e3b6a31f2ccc60497a34d)):

```haskell
-- | A claim that is part of a credential.
data Claim = Claim with
    subject : Optional Text
      -- ^ The subject of the claim.
      -- If not set, then the claim pertains to the holder of the credential.
      -- Implementations SHOULD leave it unset rather than set it to the holder.
      -- Subjects MUST only contain characters from [a-zA-Z0-9._:/-].
    property : Text
      -- ^ The property of the claim.
      --
      -- Properties MUST only contain characters from [a-zA-Z0-9._:/-].
      --
      -- All properties MUST be namespaced in the form `namespace/property` to avoid collisions.
      -- The namespace `cip-<nr>` is reserved for CIP-defined properties.
      -- All other applications MUST use a Java-style reverse DNS name for a domain under their control.
      -- For example, a property `prop` defined by the domain `example.com` would be `com.example/prop`.
    value : Text
      -- ^ The value of the claim.
  deriving (Eq, Show)

-- | A view of a credential record stored in a credential registry.
data CredentialView = CredentialView with
    admin : Party
      -- ^ The party that administers this credential registry.
    issuer : Party
      -- ^ The party that issued the credential.
    holder : Party
      -- ^ The party that holds the credential.
    claims : [Claim]
      -- ^ The claims of the credential.
    validFrom : Optional Time
      -- ^ The time from which this credential is valid.
    validUntil : Optional Time
      -- ^ The time until which this credential is valid.
    createdAt : Optional Time
      -- ^ The time at which this credential record was created.
    expiresAt : Optional Time
      -- ^ The time at which this credential record expires in the registry.
      --
      -- The registry MAY archive the record after this time.
      --
      -- Separate from `validUntil`, as the expiry time of the
      -- credential record in the registry is determined by the registry policy and
      -- may differ from the validity period of the credential itself.
    meta : Metadata
      -- ^ Metadata associated with this credential record. Used for extensibility.
  deriving (Eq, Show)

-- | A credential record stored in a credential registry.
interface Credential where
  viewtype CredentialView

  credential_archiveAsHolderImpl : ContractId Credential -> Credential_ArchiveAsHolder -> Update Credential_ArchiveAsHolderResult
  credential_publicFetchImpl : ContractId Credential -> Credential_PublicFetch -> Update CredentialView

  choice Credential_ArchiveAsHolder : Credential_ArchiveAsHolderResult
    -- ^ Archive this credential record as the holder.
    --
    -- This is always allowed for the holder of the credential and matches the real-world analogue
    -- of them destroying their copy of the credential.
    controller (view this).holder
    do credential_archiveAsHolderImpl this self arg

  nonconsuming choice Credential_PublicFetch : CredentialView
    -- ^ Fetch the view of the credential.
    --
    -- Registries MAY restrict the actor in case the credential is not public.
    --
    -- Callers SHOULD check that the fetched credential view matches their
    -- expectations, e.g., that it has the correct admin, holder and issuer.
    with
      actor : Party
        -- ^ The party fetching the contract.
    controller actor
    do credential_publicFetchImpl this self arg

data Credential_ArchiveAsHolderResult = Credential_ArchiveAsHolderResult with
    archivedCredential : CredentialView
      -- ^ The view of the archived credential. It is returned for convenience
      -- so that the caller does not need to fetch it ahead of time.
    meta : Metadata
      -- ^ Additional metadata specific to the archive operation, used for extensibility.
  deriving (Eq, Show)
```

Credential registries MAY enforce limits on the credentials they store to avoid operational problems from overly large credentials. The limits are communicated to users via the [Credential Registry Info API](#credential-registry-info-api). See [DSO Credential Registry Limits](#dso-credential-registry-limits) for the concrete limits enforced by the SV operated registry.

#### Credential Factory Interface

The purpose of this API is to enable credential issuers and holders to *jointly* create, update, and archive credentials in a third-party credential registry. The above Daml API requires joint authorization by issuer and holder upon creation of the credential. The specific workflows for obtaining this authorization and determining the claims of the credential are provided by the issuer and implemented in their credential issuance app.

Implementing this API is optional for credential registries. They CAN decide to only support registry internal workflows for creating credentials, and not offer third-party issuers the right to publish credentials to that registry.

This API uses the factory pattern pioneered in CIP-56: the `CredentialFactory` Daml interface provides a choice `CredentialFactory_UpdateCredentials` that allows for a bulk update of credentials with the same issuer and holder. The choice takes `requestedAt`, the time when the creation of the new record was requested. Callers supply it so that implementations can compute expiry without `getTime`. Callers MUST set `requestedAt` in the past, and SHOULD set it close to ledger time, because the free period is measured from it. The new record's `createdAt` is that `requestedAt`. A corresponding HTTP API endpoint allows retrieval of the context to call that choice.

Specifications of these two interfaces can be found here:

* [Splice/Api/Credential/RegistryV1.daml](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-808147bf36f1c087a42b92d67d2021c2ca203076cc0e3b6a31f2ccc60497a34d) (includes the data format of credentials)
* [openapi/credential-registry-v1.yaml](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-a73145dfdb26770f01b5fc0a9f35c7c34f067584acb6ec16de7e82040df6f835)

#### Expected App Usage of Daml APIs

We expect applications that need to fetch credentials as part of their Daml workflows to use `Credential_PublicFetch`.
We also expect wallets to be able to list all credentials held by their user by asking the user's validator node for all active contracts implementing the `Credential` interface. Wallets can offer the user to archive an unwanted credential using the `Credential_ArchiveAsHolder` choice. We also expect that wallets can offer the user to open the credential issuer's custom dApp for managing that credential. We expect them to be able to do as explained in [Standardized Application and Metadata Discovery](#standardized-application-and-metadata-discovery).

Note that apps and users that want to use credentials from a specific registry on-ledger must vet the DAR files of that credential registry.

### Read-Only HTTP APIs

#### Credential Registry Info API

The purpose of the credential registry info API is twofold:

1. It enables an asynchronous rollout of newer versions of the credential registry APIs.
2. It informs clients about constraints of the registry (e.g. limits on the number of claims or results).

The API is specified in [openapi/credential-registry-v1.yaml](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-a73145dfdb26770f01b5fc0a9f35c7c34f067584acb6ec16de7e82040df6f835).

#### Credential Lookup API

The purpose of the credential lookup API is to allow a rich set of retrieval operations to be directly implemented on top of any credential registry under the constraint that the indexing overhead for credential registries is manageable.

A draft API is specified in [openapi/credential-registry-v1.yaml](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-a73145dfdb26770f01b5fc0a9f35c7c34f067584acb6ec16de7e82040df6f835). It supports filtering by holder, multiple issuers, and a key prefix. The resolution of multiple entries for the same key is left to the client of the API. The API MUST include the record time of the transaction that created the credential contract. Record time is the Canton protocol sequencing time of that transaction's confirmation request.

Clients MAY implement a last-write-wins semantics by selecting the credential with the latest record time among the records whose `expiresAt` is absent or has not passed. The API MAY return records whose `expiresAt` is in the past. A client that needs a deterministic winner MAY break a tie on record time by selecting the credential whose contract id is lexicographically smaller, using the contract-id string returned by the API. A client for which that tie means the name does not resolve does not select a winner. If every record for that key has an `expiresAt` in the past, the client does not select a winner. The API returns matches ordered by matched claim key ascending, then record time descending, then contract id ascending. Within one key, the winner is the first returned record whose `expiresAt` is absent or has not passed.

By default the API only returns the `CredentialView` of a credential. It optionally also includes the underlying contract so that it can be disclosed for usage in a Daml transaction that reads the credential.

#### Bulk Credential Retrieval API

The purpose of the bulk credential retrieval API is to enable network explorers to ingest all credentials of a registry as they are created, updated, and archived.

The corresponding HTTP endpoints work by exposing the list of synchronizers which are used by the registry to store credentials, and then offering retrieving pages of create and archive events for all credentials in ascending record time order, with contract id ascending as the tie-break.

## DSO Credential Registry

A decentralized credential registry is implemented as an extension of the Amulet Name Service (ANS) app run by the SV nodes.
It implements all the APIs defined above side-by-side with the existing ANS 1.0 APIs.

By default, there is no CC payment required for creating credential records in the registry.
Instead, the registry expires the records at the end of a free period, 90 days by default (configurable by SV voting),
so that the traffic cost of creating and renewing them covers their storage cost.
This CIP does not define automatic renewal. Unpaid renewal is a new credential with the same claims. A client that implements the Lookup last-write-wins rule selects that new record. Applications SHOULD create that replacement about 24 hours before `expiresAt`, so prepared transactions on the old contract id are less likely to contend with archival.

### Extended Expiration Durations

The registry optionally supports extending the expiration of an existing record by burning CC. The fee defaults to USD 1 per year and is configurable by SV voting.
A paid extension archives the record and creates a replacement with the same claims, the same `createdAt`, and a new `expiresAt`:

```
purchasedDuration = USD value of the burned CC / yearly fee
newExpiresAt      = max(expiresAt, transfer.requestedAt) + freePeriod + purchasedDuration
newExpiresAt      = min(newExpiresAt, validUntil)    -- only if validUntil is set
```

`transfer.requestedAt` is the wallet timestamp on the Token Standard transfer, and it MUST already be in the past. A paid extension also adds the free period, as creating the record anew would, because its traffic pays for it.

`CredentialFactory_UpdateCredentials` creates a credential without burning CC. The new record's `createdAt` is that choice's `requestedAt`, and `expiresAt` is `requestedAt` plus the free period.

Extending a credential is a Token Standard transfer on the `TransferFactory` implemented by `AnsRules`. Either the issuer or the holder of the record can extend it alone:

- `transfer.sender` is the issuer or the holder. On Token Standard V2 it is the basic account of that party: an `Account` whose owner is that party, with no provider and an empty account id.
- `transfer.receiver` is the party `cip-tbd_credential-expiry::1220000000000000000000000000000000000000000000000000000000000000abcd`, or its basic account on V2. No participant hosts that party, so the factory omits it from the transfer's informees.
- `transfer.amount` is the CC to burn. It MUST NOT be negative. If it is zero, the extension adds only the free period.
- `extraArgs.context` carries `cip-tbd/credential-id` as an `AV_ContractId` of the record being extended.

The preparing app asks Scan for the choice context of this transfer. Scan's token-standard handler selects the `AnsRules` factory for a transfer to this receiver party. The app sets `cip-tbd/credential-id` on the context it submits. The factory burns the transferred CC, archives the record, and creates the replacement.

Generic wallet send flows typically only let the user enter a receiver and a memo, so they cannot set `cip-tbd/credential-id` in `extraArgs.context`. This is a limitation of such user interfaces, not of the Token Standard: both V1 and V2 transfers carry `extraArgs.context`. An extension is therefore prepared by an app that knows the credential's contract id, e.g. the issuer's dApp discovered via `cip-TBD/credential-issuer-app-url`, or a wallet that offers a dedicated extension flow.

### DSO Credential Registry Limits

The DSO Credential Registry rejects records that are too large to index and serve from Scan. It does not validate claim content. Content checks are application-specific and would bind the registry to particular use cases.

A DSO credential record is accepted only if all of the following hold:

- it contains at most 32 claims.
- each claim key is shorter than 512 characters, with the property at most 254 characters and the subject at most 255 characters, so that a full party-id can appear as subject.
- each claim value is shorter than 2048 characters.
- `validFrom` and `validUntil`, when present, are consistent with each other and with the record's `createdAt`.

These limits are advertised via the Credential Registry Info API. Other registries MAY choose different limits.

### Technical Details

The APIs are implemented as follows:

1. The `splice-amulet-name-service` package is extended as [shown on this PR](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-271a41476c5ed80c77cbe363f39cc58f5f422a6c9991cfc2fa2bd65398802d7e):
  1. The `AnsCredentialRegistry` template implements `CredentialFactory`.
  2. The `AnsCredentialRecord` template implements the `Credential` interface and serves to record credentials in the registry.
  3. The `AnsRules` template implements the Token Standard `TransferFactory` (V1 and V2) to burn CC for [paid extensions](#extended-expiration-durations).
2. The Scan app backend running on SV nodes implements the [openapi/credential-registry-v1.yaml](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-a73145dfdb26770f01b5fc0a9f35c7c34f067584acb6ec16de7e82040df6f835), so that any Scan app can be used to interact with the credentials registry.
3. The Scan app proxy served by the validator app implements the [openapi/credential-registry-v1.yaml](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-a73145dfdb26770f01b5fc0a9f35c7c34f067584acb6ec16de7e82040df6f835), calling out to multiple Scan apps and comparing the results to implement BFT reads.
4. The SV app is extended with automation ensuring that there is exactly one `AnsCredentialRecord` self-published by the `dso` party, which announces the URLs of the Scan apps serving the off-ledger APIs of the DSO Credential Registry.
5. The `splice-amulet` package adds `ExternalPartyAmuletRules_BurnAmulet`, which burns CC and returns its USD value. Scan's token-standard handler selects the `AnsRules` factory for transfers to the credential-expiry receiver party.

## Standardized Application and Metadata Discovery

Together the APIs defined in this CIP and the DSO Credentials Registry enable
defining standard ways to discover applications and metadata about them.
It works by a CIP defining claim keys within the CIP's namespace together with
their purpose and expected usage.

This CIP defines the following keys:

- `cip-TBD/credential-registry-urls`: serves to discover the off-ledger credential registry API of a specific credential registry admin party `admin`.
  It is published by `admin` using a self-published credential in the DSO Credential Registry.
  It specifies a comma-separated list of URLs that serve the credential registry HTTP API for party `admin`.
  Multiple URLs are supported for decentralized registries, so that clients can implement BFT reads.

- `cip-TBD/credential-issuer-app-url`: serves to discover the dApp of a specific credential issuer party `issuer`. It is self-published by the `issuer` party in the DSO Credential Registry. The idea is that the users' wallets read the user's credentials from their node, and then query the DSO Credential Registry using `cip-TBD/credential-issuer-app-url` to discover the URL for the issuer-specific dApp to manage the user's credentials. We expect the wallet UI to offer a redirect to that dApp. These redirects to this URL may specify a `credential-contract-id=<contract-id>` query parameter to focus on a particular credential. Whether to offer such a UI is optional for credential issuers.

In general, the expectation is that all properties in a credential's claims have the form `namespace/property` and the namespaces are one of the following:

1. `cip-<nr>`: for properties defined in a CIP
2. `<dns-name>`: for properties defined by an organization that owns the DNS name `dns-name`. These namespaces can be freely used by organizations to define their own properties in a way that does not conflict with standardized properties from CIPs or properties defined by other organizations.

We expect future CIPs to define additional well-known properties for discovering applications and metadata of a particular kind.

### Discovering the DSO Credential Registry

The above properties will be used to make the DSO Credential Registry discoverable by making the `dso` party publish a credential with issuer = holder = admin = `dso` and claim

```text
(property="cip-TBD/credential-registry-urls", subject="<dso>",
 value="<scan-url1>/credential-registry/v1/,...,<scan-urlN>/credential-registry/v1/")
```

in the DSO Credential Registry. The Scan URLs are the ones published per network here: [https://canton.foundation/sv-network-status/](https://canton.foundation/sv-network-status/).

## Motivation

Multiple entities have started work on identity verification and better name resolution for Canton parties. Without a shared way to store and look up credentials, each effort uses its own APIs, and wallets, explorers, and applications cannot consume those credentials interchangeably.

CIP-56 left a concrete gap: the HTTP URL of a token registry cannot be discovered automatically from the registry `admin` party on a `Holding`. Wallets need that URL to read token metadata and to transfer holdings. The same discovery problem appears for other off-ledger services bound to a party.

CIP-56 showed how to standardize foundational infrastructure APIs. This CIP applies that approach to credentials: standard APIs for storing, retrieving, and using them.

The aim is common building blocks so existing credentials can be served in an interoperable fashion.

## Rationale

### Use Case Analysis

The Credential Registry APIs and the DSO Credential Registry are meant to serve as building blocks for use-cases like service discovery, self-published profiles, name resolution, and KYC verification services. In the following sections, we explain how we believe these kinds of services can be built on top of the building blocks provided by this CIP.

These explanations are not normative and are not requirements of this CIP. They show options for applying the API. They are meant to validate and demonstrate the building blocks provided by this CIP.

Nevertheless many of these use-cases profit from lightweight CIPs standardizing common claims and/or resolution mechanisms. We expect future CIPs to provide this kind of standardization on top of the building block provided by this CIP.

### Service Discovery / Runtime Application Composition

The problem of service discovery on the Canton Network is about how to resolve the party-ids of application providers to the additional services (e.g., HTTP APIs or custom UIs) that apps and users can use to interact with the contracts from these app providers.

A typical example is the problem of wallets having to resolve the registry `admin` party-id on `Holding` contracts owned by their user to the [URL of the off-ledger registry API](https://github.com/global-synchronizer-foundation/cips/blob/main/cip-0056/cip-0056.md#off-ledger-api-discovery-and-access). The wallet needs to know this URL to read token metadata like total supply and to get the required data for transferring `Holding`s.

As shown in [Discovering the DSO Credential Registry](#discovering-the-dso-credential-registry), storing the URLs of services associated with a party under a well-known claim in a self-published credential in the DSO Credential Registry solves this problem.

### Profile Publication

The problem of profile publication is how to enable the useful functionality of party owners self-publishing well-known metadata (e.g., website, LinkedIn profile, dApp URL) about themselves. This is common functionality in many systems and helps connect the system's users.

This information is typically unverified, which is fine as long as that information is not used to resolve names, but only to present additional details on a party (e.g., shown on hover).

Such self-published profile information can be published in a credential registry using credentials with issuer = holder and an appropriate claim. For example, the owner of a party `p` could publish their website using a claim of the form

```text
(property="profile.website", subject="<p>", value="<url>")
```

To ensure that different applications interpret profile information the same way, a future CIP should standardize the common properties used in profiles (e.g., by building on the corresponding ENS standard [ENSIP-18](https://docs.ens.domains/ensip/18/)).

Furthermore, it might make sense to standardize how applications can discover the registries storing a user's profile information. A likely default is the DSO Credential Registry.

### Party Name Resolution

Party-ids are globally unique identifiers used in the Canton Network. However, they are difficult to use for humans as they are neither memorable nor easily comparable. Below we sketch how to build a name resolution system on top of the Credential Registry APIs and the DSO Credential Registry. We do so in two steps:

1. We explain how to resolve names managed by a single issuer within a single credential registry.
2. We explain how to resolve names across multiple issuers and credential registries.

#### Single Issuer and Single Credential Registry Name Resolution

Functionally this is what CNS 1.0 provides, where the `dso` party is both the issuer and credential registry administrator. A CNS record for user `p` with name `n` corresponds to a credential with the claim:

```text
(property="cns.name", subject="<n>", value="<p>")
```

The credential is issued by the `dso` party and held by `p`. We can read this credential as "The `dso` party claims that the CNS name \<n\> is owned by \<p\>".

Resolving a CNS name `n` to the party holding it can be done using:

```text
GET /credential-registry/v1/credentials?issuer=<dso>&keyPrefix=cns.name!<n>
```

The response will contain the credential listing the owner of the CNS name if it exists. The guarantee that there is at most one such credential is provided by the `dso` party as the issuer, which shows why it is paramount to constrain the query with `issuer=<dso>`.

The reverse lookup to query all names of a party `p` can be done using:

```text
GET /credential-registry/v1/credentials?holder=<p>&issuer=<dso>&keyPrefix=cns.name!
```

The response will list one credential per CNS name assigned to the holder.

A later CIP that standardizes CNS may implement the `Credential` interface on the existing `AnsEntry` template, so that CNS 1.0 entries are visible through the Credential Registry API. Issuance of CNS 1.0 entries stays on the existing workflow. This CIP does not add that instance.

#### Multi-Issuer and Multi-Registry Name Resolution

The basic idea is to follow the DNS construction and use hierarchical names and recursive resolution. Resolution is always done against a specific pair of an `issuer` and a registry `admin`. The root of the resolution is CNS with issuer `dso` and registry administrator `dso`.

Managing the issuers associated with root entries (i.e., top-level domain registrars) requires defining suitable off-ledger governance. The association itself can be stored on-ledger as a credential issued by the `dso` party. We expect that such governance can be built by adopting existing policies like the ones from ICANN for the Canton Foundation.

To support deduplicating names across multiple organizations issuing them concurrently, we expect that a more specific name registry interface will need to be developed. It can be implemented without contract keys by having the name registry administrator maintain the key-value map on-ledger in a scalable fashion (e.g., as a radix tree).

The main challenge we see with multi-issuer, multi-registry name resolution is actually not in the name issuance and resolution aspect, but the design problem of how to cleanly allow apps to leverage the existing names that entities have in off-ledger systems like DNS, email, ENS or LEI.

### Verified Identities

There are many systems that associate names with entities. In particular, DNS names and email addresses are well-known and widely used to identify counter-parties. In contrast to CNS 1.0, these systems have their authoritative data source off-ledger. Thus we cannot expect that statements about party-to-name associations in these systems can be resolved directly on-ledger.

However, we do want to support imports of statements in the form "I \<issuer> have verified that the entity controlling party \<p> also controls name \<n> in system \<S>". We can represent this using credentials issued by `issuer` for holder `p` with a claim:

```text
(property="identity.<S>", subject="<n>", value="<p>")
```

Once represented that in this way these can be used for name resolution in the same way as explained for CNS 1.0 above.

Issuers have full control over the verification they do before issuing such a credential. For example, doing DNS verification using a [DNS challenge](https://letsencrypt.org/docs/challenge-types/#dns-01-challenge). Metadata about the verification done can be represented on the credential as well using additional claims. Care should though be taken to avoid bloating the credential.

App providers can choose which issuers to query for names in what systems to resolve party names in their applications. They can combine multiple naming sources by issuing multiple name resolution queries.

#### Consistent Cross-App Identities

For identities to work consistently across multiple applications it is important that these apps use compatible name resolution strategies, including compatible lists of issuers and registries. We envision that this can be built for Canton Network in a future CIP that standardizes two aspects:

1. How names from different systems are represented in a single namespace as ASCII strings.
2. How to build suitable Canton Foundation governance such that most apps can use the same issuer and registry configuration.

### KYC Verification Services

KYC verification is similar to verified identities as explained above. The difference is that it often imports statements about the physical world and that the processes for doing so are non-standard across organizations.

These statements are always made by the issuer of the KYC credential and should be understood relative to the specific process the issuer makes. This CIP specifies how to publish and look up such credentials. It does not create a legal right or duty to rely on another party's KYC process. App providers that want to consume or provide external KYC services can do so without network wide standardization. Properties support namespacing, and in fact, prefixing custom properties should be prefixed with the DNS name of the organization defining the custom property, e.g., `acme.com/custom-property`.

We suggest that organizations experiment with the exact claims that they need to outsource KYC services, and then use their experience to build a CIP standardizing the claims that have proven their value for wide use.

## Focus on Public Credentials Only

This CIP covers credentials that can be discovered publicly. Public records are useful on their own, and they are how applications and explorers learn the shape of the network. Credentials MUST be public to be indexable by explorers. The bulk retrieval API is built for that ingest.

Private credentials are left to a future CIP. That CIP would authenticate the users looking up credentials in a registry and return only the records those users are allowed to see. Standardizing access-control specifications on credentials published to a registry is a non-trivial effort. It is probably best done where the credential issuer and the registry are run by the same entity, so the registry can use custom rules for access control.

## Backwards Compatibility

This CIP is backwards compatible: it only adds functionality. Existing ANS 1.0 APIs stay. The `Credential` interface is additive. A later CIP may implement it on existing `AnsEntry` contracts. The `AnsEntry` issuance workflows from ANS 1.0 are not migrated in this CIP.

We expect that a future CIP that standardizes CNS, potentially including identity verification, will be constructed so that CNS 1.0 entries are properly integrated, and so that existing name issuance and identity verification services can integrate into that unified system.

## Implementation

A draft of the HTTP and Daml APIs, and of the DSO Credential Registry, is in [this Splice PR](https://github.com/hyperledger-labs/splice/pull/3416). It includes `Splice.Api.Credential.RegistryV1`, `openapi/credential-registry-v1.yaml`, and the DSO templates `AnsCredentialRegistry` and `AnsCredentialRecord`. It does not implement `Credential` on `AnsEntry`.

Lookup pagination (`limit`, `pageToken`) is specified in that OpenAPI.

## Copyright

This CIP is licensed under CC0-1.0: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
