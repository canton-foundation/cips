<pre>
  CIP: CIP TBD
  Layer: Daml
  Title: Canton Network Credentials Standard
  Author:
    Simon Meier
  License: CC0-1.0
  Status: Early Draft (comment threads at the bottom of this doc, and inlined TODO notes)
  Type: Standards Track
  Created: 2026-01-09
</pre>

## Abstract

Define standard APIs for storing, retrieving, and using credentials on the Canton Network.

## Specification

The specification of this CIP consists of three parts:

1. **Credential Registry APIs**: define standard APIs for storing, retrieving, and using Canton Network credentials.
2. **DSO Credentials Registry**: specifies how these APIs are implemented in a decentralized registry run across the SV nodes.
3. **Standardized Application and Metadata Discovery:** specifies how these APIs are used to standardize the discovery of specific kinds of applications on the network and their metadata. In particular, this CIP standardizes how to discover the off-ledger APIs of credential registries, the UIs of credential issuers, and the off-ledger APIs of [CIP-56 asset registries](https://github.com/global-synchronizer-foundation/cips/blob/main/cip-0056/cip-0056.md#off-ledger-api-discovery-and-access).

We provide details on each of these parts in the following subsections.

## Credential Registry APIs

The APIs are inspired by the [W3C Verifiable Credentials Data Model](https://www.w3.org/TR/vc-data-model-2.0/). They are intended to serve as fundamental building blocks for use-cases such as self-publishing party profile information, providing trustworthy human-readable names for parties, or sharing KYC credentials across applications. To keep the scope of this CIP manageable, this CIP only sketches how to implement such use-cases on top of it, but does not provide normative guidance. See [Use Case Analysis](#use-case-analysis) for more information.

### Overview

This standard is concerned with entities and apps acting in the following roles:

* **credential issuers**: entities that issue credentials and back their veracity
* **credential holders**: entities that hold credentials and agree to the credential’s claims
* **credential registry administrators**: entities that store and serve credentials that were jointly published by their issuer and holder
* **network explorers**: entities building apps for exploring Canton Network activity and structure
* **app providers:** entities that operate apps that retrieve and use credentials in their UIs and/or in their on-ledger workflows
* **app users:** entities that use apps that use credentials

Entities often act in multiple roles. For example, a [CIP-56 token administrator that self-publishes their off-ledger token registry URLs](https://github.com/global-synchronizer-foundation/cips/blob/main/cip-0056/cip-0056.md#off-ledger-api-discovery-and-access) to the SV credential registry acts both as the credential issuer and the credential holder of the corresponding credential. The claim in the credential would associate the key `splice.lfdecentralizedtrust.org/registryUrls` to the actual URLs. Token standard wallets are typical apps using credentials with that kind of key. They use them to resolve the admin party-ids encountered in tokens held by a wallet user to the [URLs to query to execute transfers and other actions](https://github.com/global-synchronizer-foundation/cips/blob/main/cip-0056/cip-0056.md#utxo-access-management).

Another example is an identity verification service that acts both as a credential issuer and a credential registry serving credentials whose claims associate the verified identities with the party-id of the credential holder.

The following diagram shows how the APIs defined in this CIP mediate the interaction between the apps in the different roles. Arrows point from clients to servers of APIs.

TODO: add _Diagram omitted in this markdown export._

As we can see, the APIs cover exactly the interaction between the different kinds of apps and credential registries. Credential holders use custom APIs and UIs to interact with credential issuers. App users are not shown in the diagram as they do not directly interact with any of the APIs standardized in this CIP. They rely on the app provider making suitable choices with respect to how to use the standardized APIs to make use of credentials in the apps UIs and on-ledger workflows.

The diagram does not show the registry info HTTP API, which is used for extensibility. It allows apps interacting with the registry to figure out what standards the registry supports.

In the following sub-sections, we specify the different APIs. We conclude with a specification of the decentralized credential registry implemented by the SVs.

### Daml APIs

The Daml APIs mediate the on-ledger interactions of the different applications with the credentials registry. They consist of the mandatory implementation of the `Credential` Interface and an optional implementation of the `CredentialFactory` interface. We explain them in the following two sections. We specify the expected usage of these APIs credential issuers and  wallets thereafter.

#### Credential Interface

The schema of credentials is defined by the following Daml code (copied from [Draft PR](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-808147bf36f1c087a42b92d67d2021c2ca203076cc0e3b6a31f2ccc60497a34d)):

```daml
-- | A set of claims that define a credential analogous to W3C Verifiable Credentials.
data Claims = Claims with
   values : TextMap Text
     -- ^ The values of the claims are encoded as key-value pairs to align with the
      -- common use of key-value pairs in ENS, DNS, k8s, and similar systems. A
      -- W3C claim of the form (subject, property, value) is represented as a
      -- key-value pair with the key formed as "property!subject" and value as
      -- "value".
      --
      -- When no '!subject' suffix is present in the key, the claim pertains
      -- to the holder of the credential. Thus the key value pair
      --
      --  "cip-TBD/displayName" : "Alice"
      --
      -- corresponds to the W3C claim
      -- (subject=holder, property="cip-TBD/displayName", value="Alice").
      --
      -- Implementations SHOULD ensure that claims are stored in canonical form without
      -- redundant '!holder' suffixes in keys.
      --
      -- Keys MUST only contain characters from [a-zA-Z0-9._:/!-]
      -- and the '!' is only allowed to be used to separate property from subject.
      --
      -- All keys MUST be namespaced in the form `namespace/property` to avoid collisions.
      -- The namespace `cip-<nr>` is reserved for CIP-defined properties.
      -- All other applications MUST use a Java-style reverse DNS name for a domain under their control.
      -- For example, a key for a property `prop` defined by the domain
      -- `example.com` would be `com.example/prop`.
   validFrom : Optional Time
     -- ^ The time from which this credential is valid.
   validUntil : Optional Time
     -- ^ The time until which this credential is valid.
   meta : Metadata
     -- ^ Metadata associated with these claims. Used for extensibility.
 deriving (Eq, Show)

-- | A view of a credential record stored in a credential registry.
data CredentialView = CredentialView with
   admin : Party
     -- ^ The party that administers this credential registry.
   issuer : Party
     -- ^ The party that issued the credential.
   holder : Party
     -- ^ The party that holds the credential.
   claims : Claims
     -- ^ The credential associated with this record.
   createdAt : Optional Time
     -- ^ The time at which this credential record was created.
   expiresAt : Optional Time
     -- ^ The time at which this credential record expires in the registry.
     --
     -- The registry MAY archive the record after this time.
     --
     -- Separate from the `validUntil` field in `Claims`, as the expiry time of the
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
   --
   -- The view is returned for convenience so that the caller does not need to fetch it ahead of time.
   controller (view this).holder
   do credential_archiveAsHolderImpl this self arg

 nonconsuming choice Credential_PublicFetch : CredentialView
   -- ^ Fetch the view of the credential.
   --
   -- Registries MAY restrict the actor in case the credential is not public.
   with
     expectedAdmin : Party
       -- ^ The expected admin party storing the credential. Implementations MUST validate that this matches
       -- the admin of the factory.
       --
       -- Callers SHOULD ensure they get `expectedAdmin` from a trusted source, e.g., a read against
       -- their own participant. That way they can ensure that it is safe to exercise a choice
       -- on a factory contract acquired from an untrusted source *provided*
       -- all vetted Daml packages only contain interface implementations
       -- that check the expected admin party.
     actor : Party
       -- ^ The party fetching the contract.
   controller actor
   do credential_publicFetchImpl this self arg

data Credential_ArchiveAsHolderResult = Credential_ArchiveAsHolderResult with
   archivedCredential : CredentialView
     -- ^ The view of the archived credential.
   meta : Metadata
     -- ^ Additional metadata specific to the archive operation, used for extensibility.
 deriving (Eq, Show)
```

Credential registries MAY enforce limits on the credentials they store to avoid operational problems from overly large credentials. The limits are communicated to users via the [Credential Registry Info API](#credential-registry-info-api). See [Rationale > DSO Credential Registry Limits](#dso-credential-registry-limits) for the concrete limits enforced by the SV operated registry.

#### Credential Factory Interface

The purpose of this API is to enable credential issuers and holders to *jointly* create, update, and archive credentials in a third-party credential registry. The above Daml API requires joint authorization by issuer and holder upon creation of the credential. The specific workflows for obtaining this authorization and determining the claims of the credential are provided by the issuer and implemented in their credential issuance app.

Implementing this API is optional for credential registries. They CAN decide to only support registry internal workflows for creating credentials, and not offer third-party issuers the right to publish credentials to that registry.

This API uses the factory pattern pioneered in CIP-56: the `CredentialFactory` Daml interface provides a choice `CredentialFactory_UpdateCredentials` that allows for a bulk update of credentials with the same issuer and holder. A corresponding HTTP API endpoint allows retrieval of the context to call that choice.

Draft specifications of these two interfaces can be found in the draft PR here:

* [Splice/Api/Credential/RegistryV1.daml](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-808147bf36f1c087a42b92d67d2021c2ca203076cc0e3b6a31f2ccc60497a34d) (includes the data format of credentials)
* [openapi/credential-registry-v1.yaml](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-a73145dfdb26770f01b5fc0a9f35c7c34f067584acb6ec16de7e82040df6f835)

#### Expected App Usage of Daml APIs

We expect applications to be able to `fetch` credentials as part of their Daml workflows using the `Credential` interface to fetch the contract and compute its `CredentialView`. The workflow thereby gets access to full `CredentialView` and can use its data to influence its actions.

We also expect wallets to be able to list all credentials held by their user by asking the user’s validator node for all active contracts implementing the `Credential` interface. Wallets can offer the user to archive an unwanted credential using the `Credential_ArchiveAsHolder` choice. We also expect that wallets can offer the user to open the credential issuer’s custom dApp for managing that credential. We expect them to be able to do as explained in [Standardized Application and Metadata Discovery](#standardized-application-and-metadata-discovery).

Note that apps and users that want to use credentials from a specific registry on-ledger must vet the .dars of that credential registry.

### Read-Only HTTP APIs

#### Credential Registry Info API

The purpose of the credential registry info API is twofold:

1. It enables an asynchronous rollout of newer versions of the credential registry APIs.
2. It informs clients about constraints of the registry (e.g. limits on the number of claims or results).

A draft API is specified in [openapi/credential-registry-v1.yaml](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-a73145dfdb26770f01b5fc0a9f35c7c34f067584acb6ec16de7e82040df6f835).

#### Credential Lookup API

The purpose of the credential lookup API is to allow a rich set of retrieval operations to be directly implemented on top of any credential registry under the constraint that the indexing overhead for credential registries is manageable.

A draft API is specified in [openapi/credential-registry-v1.yaml](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-a73145dfdb26770f01b5fc0a9f35c7c34f067584acb6ec16de7e82040df6f835). It supports filtering by holder, multiple issuers, and a key prefix. The resolution of multiple entries for the same key is left to the client of the API. The record time as of which a credential contract was created is provided, which makes it easy to implement a last-write-wins semantics.

By default the API only returns the `CredentialView` of a credential. It optionally also includes the underlying contract so that it can be disclosed for usage in a Daml transaction that reads the credential.

#### Bulk Credential Retrieval API

The purpose of the bulk credential retrieval API is to enable network explorers to ingest all credentials of a registry as they are created, updated, and archived.

The corresponding HTTP endpoints work by exposing the list of synchronizers which are used by the registry to store credentials, and then offering retrieving pages of create and archive events for all credentials in record time order.

## DSO Credential Registry

A decentralized credential registry is implemented as an extension of the Amulet Name Service (ANS) app run by the SV nodes. It implements all the APIs defined above side-by-side with the existing ANS 1.0 APIs.

There is no CC payment required for creating credential records in the registry. Instead, the registry expires the records within 90 days, so that the traffic cost of creating and renewing them covers their storage cost.

### Technical Details

The APIs are implemented as follows:

1. The `splice-amulet-name-service` package is extended with two templates as [shown on this PR](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-271a41476c5ed80c77cbe363f39cc58f5f422a6c9991cfc2fa2bd65398802d7e).
  1. The `AnsCredentialFactory` template implements `CredentialFactory`.
   2. The `AnsCredentialRecord` template implements the `Credential` interfaces and serves to record credentials in the registry.
2. The Scan app backend running on SV nodes implements the [openapi/credential-registry-v1.yaml](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-a73145dfdb26770f01b5fc0a9f35c7c34f067584acb6ec16de7e82040df6f835), so that any Scan app can be used to interact with the credentials registry.
3. The Scan app proxy served by the validator app implements the [openapi/credential-registry-v1.yaml](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-a73145dfdb26770f01b5fc0a9f35c7c34f067584acb6ec16de7e82040df6f835), calling out to multiple Scan apps and comparing the results to implement BFT reads.
4. The SV app is extended with automation ensuring that there is exactly one `AnsCredentialRecord` self-published by the `dso` party, which announces the URLs of the Scan apps serving the off-ledger APIs of the DSO Credential Registry.

## Standardized Application and Metadata Discovery

Together the APIs defined in this CIP and the DSO Credentials Registry enable defining standard ways to discover applications and metadata about them. It works by a CIP defining claim keys within the CIP’s namespace together with their purpose and expected usage.

This CIP defines the following keys:

- `cip-TBD/credential-registry-urls`: serves to discover the off-ledger credential registry API of a specific credential registry admin party `admin`. It is published by `admin` using a self-published credential in the DSO Credential Registry. It specifies a comma-separated list of URLs that serve the credential registry HTTP API for party `admin`. Multiple URLs are supported for decentralized registries so that clients can implement BFT reads.

- `cip-TBD/credential-issuer-app-url`: serves to discover the dApp of a specific credential issuer party `issuer`. It is self-published by the `issuer` party in the DSO Credential Registry. The idea is that the users' wallets read the user's credentials from their node, and then query the DSO Credential Registry using `cip-TBD/credential-issuer-app-url` to discover the URL for the issuer-specific dApp to manage the user's credentials. We expect the wallet UI to offer a redirect to that dApp. These redirects to this URL may specify a `credential-contract-id=<contract-id>` query parameter to focus on a particular credential. Whether to offer such a UI is optional for credential issuers.

- `cip-TBD/is-featured-app`: is issued by the `dso` party in the DSO Credential Registry to communicate the featured app status of the `holder` of the credential with this key. The corresponding credentials are of the form:

```text
(property="cip-TBD/is-featured-app", subject="<holder>", value="")
```

This CIP also enables finishing the implementation of [off-ledger API discovery from CIP-56](https://github.com/global-synchronizer-foundation/cips/blob/main/cip-0056/cip-0056.md#off-ledger-api-discovery-and-access) by defining the following key:

- `cip-56/asset-registry-urls`: serves to discover the off-ledger asset registry API of a specific asset registry admin party `admin`. It is published by `admin` using a self-published credential in the DSO Credential Registry. It specifies a comma-separated list of URLs that serve the credential registry HTTP API for party `admin`. Multiple URLs are supported for decentralized registries so that clients can implement BFT reads.

Note that CIP-56 originally specified the key splice.lfdecentralizedtrust.org/registryUrls for this purpose. However there is no implementation thereof. We thus took this as an opportunity to choose cip-56/asset-registry-urls for consistency here. We plan to adapt the CIP-56 text accordingly once this CN credential standard has been adopted.

In general, the expectation is that all properties in a credential’s claims have the form `namespace/property` and the namespaces are one of the following:

1. `cip-<nr>`: for properties defined in a CIP
2. `<dns-name>`: for properties defined by an organization that owns the DNS name `dns-name`. These namespaces can be freely used by organizations to define their own properties in a way that does not conflict with standardized properties from CIPs or properties defined by other organizations.

We expect future CIPs to define additional well-known properties for discovering applications and metadata of a particular kind.

### Discovering the DSO Credential Registry and Canton Coin Registry

The above properties will be used to make the DSO Credential Registry discoverable by making the `dso` party publish a credential with issuer = holder = admin = `dso` and claim

```text
(property="cip-TBD/credential-registry-urls",
 subject="<dso>",
 value="<scan-url1>/credential-registry/v1/,...,<scan-urlN>/credential-registry/v1/")
```

in the DSO Credential Registry. The Scan URLs are the ones published per network here: [https://canton.foundation/sv-network-status/](https://canton.foundation/sv-network-status/).

Analogously, the `dso` party will also publish a credential with issuer = holder = admin = `dso` and claim

```text
(property="cip-56/asset-registry-urls",
 subject="<dso>",
 value="<scan-url1>/credential-registry/v1/,...,<scan-urlN>/credential-registry/v1/")
```

in the DSO Credential Registry.

We expect other asset admins to also make use of that functionality to enable wallets to discover the off-ledger API of an asset admin directly from the network.

## Motivation

TODO: expand

* seen multiple entities start work on identity verification and better name resolution
* have the outstanding gap in CIP-56 that registry URLs cannot be discovered automatically
* have the experience from CIP-56 wrt how to standardize foundational infrastructure APIs
* want to provide the common building blocks to serve existing credentials in an inter-operable fashion

## Rationale

### Use Case Analysis

The Credential Registry APIs and the DSO Credential Registry are meant to serve as building blocks for use-cases like service discovery, self-published profiles, name resolution, and KYC verification services. In the following sections, we explain how we believe these kinds of services can be built on top of the building blocks provided by this CIP.

These explanations are not meant to specify a standard for how to solve these use cases. They are meant to validate and demonstrate the building blocks provided by this CIP.

Nevertheless many of these use-cases profit from lightweight CIPs standardizing common claims and/or resolution mechanisms. We expect future CIPs to provide this kind of standardization on top of the building block provided by this CIP.

### Service Discovery / Runtime Application Composition

The problem of service discovery on the Canton Network is about how to resolve the party-ids of application providers to the additional services (e.g., HTTP APIs or custom UIs) that apps and users can use to interact with the contracts from these app providers.

A typical example is the problem of wallets having to resolve the registry `admin` party-id on `Holding` contracts owned by their user to the [URL of the off-ledger registry API](https://github.com/global-synchronizer-foundation/cips/blob/main/cip-0056/cip-0056.md#off-ledger-api-discovery-and-access). The wallet needs to know this URL to read token metadata like total supply and to get the required data for transferring `Holding`s.

As shown in [Discovering the DSO Credential Registry and Canton Coin Registry](#discovering-the-dso-credential-registry-and-canton-coin-registry), storing the URLs of services associated with a party under a well-known claim in a self-published credential in the DSO Credential Registry solves this problem.

##### Application Discovery

The credentials used by asset registry operators to self-publish the URLs of their off-ledger APIs can also be used to discover all assets registries by listing all self-published credentials in the DSO Credential Registry with key `cip-56/asset-registry-urls`.

All assets available on the network can then be discovered by listing the instruments in each of these registries using the `GET <registry-url>/registry/metadata/v1/instruments` [endpoint](https://github.com/hyperledger-labs/splice/blob/82a11c72f42da70de44b1d1fd7399dd417c73a7b/token-standard/splice-api-token-metadata-v1/openapi/token-metadata-v1.yaml#L31) defined in CIP-56.

Analogous approaches can be used to discover other applications offering standardized services.

We expect that generalized application discovery is handled as part of profile publication via self-published credentials as explained below. Checking whether an application is featured by the Canton Foundation can be done by querying for the corresponding credential issued by the `dso` party with property `cip-TBD/is-featured-app`.

### Profile Publication

The problem of profile publication is how to enable the useful functionality of party owners self-publishing well-known metadata (e.g., website, LinkedIn profile, dApp URL) about themselves. This is common functionality in many systems and helps connect the system’s users.

This information is typically unverified, which is fine as long as that information is not used to resolve names, but only to present additional details on a party (e.g., shown on hover).

Such self-published profile information can be published in a credential registry using credentials with issuer = holder and an appropriate claim. For example, the owner of a party `p` could publish their website using a claim of the form

```text
(property="profile.website", subject="<p>", value="<url>")
```

To ensure that different applications interpret profile information the same way, a future CIP should standardize the common properties used in profiles (e.g., by building on the corresponding ENS standard [ENSIP-18](https://docs.ens.domains/ensip/18/)).

Furthermore, it might make sense to standardize how applications can discover the registries storing a user’s profile information. A likely default is the DSO Credential Registry.

### Party Name Resolution

Party-ids are globally unique identifiers used in the Canton Network. However, they are difficult to use for humans as they are neither memorable nor easily comparable. Below we sketch how to build a name resolution system on top of the Credential Registry APIs and the DSO Credential Registry. We do so in two steps:

1. We explain how to resolve names managed by a single issuer within a single credential registry.
2. We explain how to resolve names across multiple issuers and credential registries.

#### Single Issuer and Single Credential Registry Name Resolution

Functionally this is what CNS 1.0 provides, where the `dso` party is both the issuer and credential registry administrator. A CNS record for user `p` with name `n` corresponds to a credential with the claim:

```text
(property="hasCnsName", subject="<n>", value="<p>")
```

The credential is issued by the `dso` party and held by `p`. We can read this credential as “The `dso` party claims that the CNS name \<n\> is owned by \<p\>”.

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

The [draft PR shows here](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-6ffb0d08eee67175e91eabd4e3bf1d811e8ab18a029a541d169aa482fe3e294a) how to implement the `Credential` interface directly on the existing `AnsEntry` template to allow accessing CNS 1.0 entries via the Credential Registry API. Note that the issuance of CNS 1.0 entries uses the existing workflow. This matches the overall design of this CIP, which gives full freedom to issuer wrt their issuance workflows for credentials.

#### Multi-Issuer and Multi-Registry Name Resolution

The basic idea is to follow the DNS construction and use hierarchical names and recursive resolution. Resolution is always done against a specific pair of an `issuer` and a registry `admin`. The root of the resolution is CNS with issuer `dso` and registry administrator `dso`.

Managing the issuers associated with root entries (i.e., top-level domain registrars) requires defining suitable off-ledger governance. The association itself can be stored on-ledger as a credential issued by the `dso` party. We expect that such governance can be built by adopting existing policies like the ones from ICANN for the Canton Foundation.

To support deduplicating names across multiple organizations issuing them concurrently, we expect that a more specific name registry interface will need to be developed. It can be implemented without contract keys by having the name registry administrator maintain the key-value map on-ledger in a scalable fashion (e.g., as a radix tree).

The main challenge we see with multi-issuer, multi-registry name resolution is actually not in the name issuance and resolution aspect, but the design problem of how to cleanly allow apps to leverage the existing names that entities have in off-ledger systems like DNS, email, ENS or LEI.

### Verified Identities

There are many systems that associate names with entities. In particular, DNS names and email addresses are well-known and widely used to identify counter-parties. In contrast to CNS 1.0, these systems have their authoritative data source off-ledger. Thus we cannot expect that statements about party-to-name associations in these systems can be resolved directly on-ledger.

However, we do want to support imports of statements in the form "I <issuer> have verified that the entity controlling party <p> also controls name <n> in system <S>". We can represent this using credentials issued by `issuer` for holder `p` with a claim:

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

These statements are always made by the issuer of the KYC credential and should be understood relative to the specific process the issuer makes. App providers that want to consume or provide external KYC services can do so without network wide standardization. Properties support namespacing, and in fact, prefixing custom properties should be prefixed with the DNS name of the organization defining the custom property; e.g.,  `acme.com/custom-property`.

We suggest that organizations experiment with the exact claims that they need to outsource KYC services, and then use their experience to build a CIP standardizing the claims that have proven their value for wide use.

## DSO Credential Registry Limits

TODO: inline the explanations from the source code

- for now see the [source code here](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-271a41476c5ed80c77cbe363f39cc58f5f422a6c9991cfc2fa2bd65398802d7eR105)

## Focus on Public Credentials Only

TODO: expand

- credentials that can be discovered publicly provide large value, and serve to gain intuition
  * credentials must be public for them to be indexable by explorers
- private credentials can then be built as an extension (i.e., future CIP) by authenticating the users looking up credentials in a registry and only returning the credentials they are allowed to see
  * this is though a non-trivial effort as it requires standardizing access control specifications on credentials published to a registry
  * probably best done for cases where the credential issuer and the registry are run by the same entity, and the registry can thus use custom rules for determining access control

## Backwards Compatibility

TODO: expand

- the change is backwards compatible, as it only adds new functionality
- we expect that the future CIP that standardizes CNS (potentially including identity verification) will also be constructed such that
  * CNS 1.0 entries are properly integrated
  * existing name issuance and identity verification services can integrate into the unified system

## Implementation

TODO: add additional implementation notes

- a draft of the HTTP + Daml API specs and Daml implementation of the DSO Credential Registry is available on [this PR](https://github.com/hyperledger-labs/splice/pull/3416)
- see [here for notes on how to build the indices for listing of credentials](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-898d544e4b90bc149b606729ed90e3c4452c3eea8bb1b11301d6adedde704f2e)
- add a note that renewal of credentials is best done by creating a new credential 24h ahead of time to avoid contention with existing prepared transactions referencing the old credential
  * the last-write-wins semantics implemented on the client side for name resolution works fine with that

## Copyright

This CIP is licensed under CC0-1.0: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)

## Changelog

Jan 9, 2026: wrote first draft

## Appendix

### Open Comment Threads

TODO: fix these in the actual text and remove this section

#### Claims Data Model (ADT vs triples)

- **leo@c7.digital (Jan 12, 10:54 PM):** Suggested using a Daml ADT instead of a key-value representation.
- **Simon Meier (Jan 13, 8:41 AM):** Agreed this may be preferable despite JSON ergonomics of key-value maps; planned to evaluate a pure `(subject, property, value)` triple model.
- **leo@c7.digital (Jan 13, 3:49 PM / 3:51 PM):** Noted real cases where duplicate `(subject, property)` entries are useful (aliases, multiple titles).
- **Simon Meier (Jan 13, 4:10 PM):** Agreed that multiset semantics align well with multiple credentials defining the same property for the same subject.

#### Deterministic Resolution and Ordering

- **Vladislav Kokosh (Jan 20, 11:39 PM):** Requested precise rules for last-write-wins and tie-breaking when `createdAt` is optional.
- **Simon Meier (Jan 23, 4:45 PM):** Clarified that:
  - Record time is Canton protocol sequencing time for the transaction confirmation request.
  - Record time is guaranteed to be present on the off-ledger credential registry API.
  - Contract ID is the deterministic tie-breaker (relevant for same-transaction creations).

#### Renewal and Expiry Policy

- **Wayne Collier (Jan 12, 4:12 AM):** Asked whether `expiresAt` supports automatic renewal.
- **Simon Meier (Jan 12, 10:52 AM):** Recommended renewing by creating a new credential ~24h before expiry to reduce contention; automation is intentionally not standardized in this CIP.
- **Frank Preiwuss (Jan 20-21):** Asked who defines expiry policy, whether usage-based extension is possible, and whether payment/deposit mechanisms could support longer lifetime.
- **Simon Meier (Jan 20, 1:12 PM / 4:57 PM):** Clarified registry operator defines policy (DSO likely ~90 days); usage-based extension is conceptually interesting but may add significant complexity and does not remove renewal requirements.
- **Frank Preiwuss (Jan 21, 1:54 PM / 2:02 PM):** Agreed complexity trade-off is significant; payment/deposit model remains a possible direction.

#### Security Model for `expectedAdmin`

- **Vladislav Kokosh (Jan 21, 12:18 AM):** Requested explicit threat-model language: package vetting/trusted participants are required; `expectedAdmin` alone is insufficient if implementations are incorrect.
- **Simon Meier (Jan 23, 4:47 PM):** Confirmed this is an implementation constraint to be validated via registry provider security audits and customer DAR vetting.

#### Pagination Semantics

- **Vladislav Kokosh (Jan 20, 11:59 PM):** Asked for explicit total ordering and cursor semantics to avoid gaps/duplicates when many events share the same record time.
- **Simon Meier (Jan 23, 4:48 PM):** Agreed and noted OpenAPI definitions will make this explicit.

#### Encoding Consistency in Examples

- **Vladislav Kokosh (Jan 20, 11:40 PM / 11:43 PM):** Pointed out inconsistency between triple examples and key encoding rules (`namespace/property[!subject]`), and suggested using implicit holder subject where applicable.
- **Simon Meier (Jan 23, 4:51 PM):** Agreed to improve clarity in a polishing pass; planned to switch uniformly to triple notation.

#### KYC Interoperability and Liability

- **Edward Newman (Jan 9, 8:18 PM):** Asked whether third parties can realistically rely on externally issued KYC credentials, especially given legal/regulatory liability concerns.
- **Simon Meier (Jan 12, 8:52 AM / 8:55 AM):** Suggested focusing this CIP on interoperable tooling first; provided examples where shared verification services may emerge (e.g., large organizations with multiple on-ledger parties).
- **Edward Newman (Jan 12, 3:19 PM):** Noted examples may still be intra-entity rather than true cross-entity reliance.
- **Simon Meier (Jan 13, 8:52 AM):** Agreed from a legal perspective; added that technically issuer and consuming app can still be distinct parties/apps.

