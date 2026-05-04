**Purpose**: this doc serves to align the [\#cf-identity-and-metadata](https://daholdings.slack.com/archives/C0A7GDW2LTY) members on a draft of a CIP for a Canton Network credential standard
**Author**: [Simon Meier](mailto:simon@digitalasset.com)
**Status**: preliminary draft ready for review by the Canton Foundation identity working group members (see [\#cf-identity-and-metadata](https://daholdings.slack.com/archives/C0A7GDW2LTY))  \- Jan 12, 2026
Converted to .md on May 4, 2026

# CIP TBD:  Canton Network Credentials Standard

[**Abstract	2**](#abstract)

[**Specification	2**](#specification)

[Credential Registry APIs	2](#credential-registry-apis)

[Overview	2](#overview)

[Daml APIs	4](#daml-apis)

[Credential Interface	4](#credential-interface)

[Credential Factory Interface	6](#credential-factory-interface)

[Expected App Usage of Daml APIs	7](#expected-app-usage-of-daml-apis)

[Read-Only HTTP APIs	7](#read-only-http-apis)

[Credential Registry Info API	7](#credential-registry-info-api)

[Credential Lookup API	7](#credential-lookup-api)

[Bulk Credential Retrieval API	8](#bulk-credential-retrieval-api)

[DSO Credential Registry	8](#dso-credential-registry)

[Technical Details	8](#technical-details)

[Standardized Application and Metadata Discovery	8](#standardized-application-and-metadata-discovery)

[Discovering the DSO Credential Registry and Canton Coin Registry	10](#discovering-the-dso-credential-registry-and-canton-coin-registry)

[**Motivation	10**](#motivation)

[**Rationale	11**](#rationale)

[Use Case Analysis	11](#use-case-analysis)

[Service Discovery / Runtime Application Composition	11](#service-discovery-/-runtime-application-composition)

[Application Discovery	11](#application-discovery)

[Profile Publication	12](#profile-publication)

[Party Name Resolution	12](#party-name-resolution)

[Single Issuer and Single Credential Registry Name Resolution	12](#single-issuer-and-single-credential-registry-name-resolution)

[Multi-Issuer and Multi-Registry Name Resolution	13](#multi-issuer-and-multi-registry-name-resolution)

[Verified Identities	14](#verified-identities)

[Consistent Cross-App Identities	14](#consistent-cross-app-identities)

[KYC Verification Services	14](#kyc-verification-services)

[DSO Credential Registry Limits	15](#dso-credential-registry-limits)

[Focus on Public Credentials Only	15](#focus-on-public-credentials-only)

[**Backwards Compatibility	15**](#backwards-compatibility)

[**Implementation	16**](#implementation)

[**Copyright	16**](#copyright)

[**Changelog	16**](#changelog)

# Abstract {#abstract}

Define standard APIs for storing, retrieving, and using credentials on the Canton Network.

# Specification {#specification}

The specification of this CIP consists of three parts:

1. **Credential Registry APIs**: define standard APIs for storing, retrieving, and using Canton Network credentials.
2. **DSO Credentials Registry**: specifies how these APIs are implemented in a decentralized registry run across the SV nodes.
3. **Standardized Application and Metadata Discovery:** specifies how these APIs are used to standardize the discovery of specific kinds of applications on the network and their metadata. In particular, this CIP standardizes how to discover the off-ledger APIs of credential registries, the UIs of credential issuers, and the off-ledger APIs of [CIP-56 asset registries](https://github.com/global-synchronizer-foundation/cips/blob/main/cip-0056/cip-0056.md#off-ledger-api-discovery-and-access).

We provide details on each of these parts in the following subsections.

## Credential Registry APIs {#credential-registry-apis}

The APIs are inspired by the [W3C Verifiable Credentials Data Model](https://www.w3.org/TR/vc-data-model-2.0/). They are intended to serve as fundamental building blocks for use-cases such as self-publishing party profile information, providing trustworthy human-readable names for parties, or sharing KYC credentials across applications. To keep the scope of this CIP manageable, this CIP only sketches how to implement such use-cases on top of it, but does not provide normative guidance. See “[Use Case Analysis](#bookmark=id.lmabvddqn5o7)” for more information.

### Overview {#overview}

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
![][image1]

As we can see, the APIs cover exactly the interaction between the different kinds of apps and credential registries. Credential holders use custom APIs and UIs to interact with credential issuers. App users are not shown in the diagram as they do not directly interact with any of the APIs standardized in this CIP. They rely on the app provider making suitable choices with respect to how to use the standardized APIs to make use of credentials in the apps UIs and on-ledger workflows.

The diagram does not show the registry info HTTP API, which is used for extensibility. It allows apps interacting with the registry to figure out what standards the registry supports.

In the following sub-sections, we specify the different APIs. We conclude with a specification of the decentralized credential registry implemented by the SVs.

### Daml APIs {#daml-apis}

The Daml APIs mediate the on-ledger interactions of the different applications with the credentials registry. They consist of the mandatory implementation of the `Credential` Interface and an optional implementation of the `CredentialFactory` interface. We explain them in the following two sections. We specify the expected usage of these APIs credential issuers and  wallets thereafter.

#### Credential Interface {#credential-interface}

The schema of credentials is defined by the following Daml code (copied from [Draft PR](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-808147bf36f1c087a42b92d67d2021c2ca203076cc0e3b6a31f2ccc60497a34d)):

\-- | A set of claims that define a credential analogous to W3C Verifiable Credentials.
data Claims \= Claims with
   values : TextMap Text
     \-- ^ The values of the claims are encoded as key-value pairs to align with the
      \-- common use of key-value pairs in ENS, DNS, k8s, and similar systems. A
      \-- W3C claim of the form (subject, property, value) is represented as a
      \-- key-value pair with the key formed as "property\!subject" and value as
      \-- "value".
      \--
      \-- When no '\!subject' suffix is present in the key, the claim pertains
      \-- to the holder of the credential. Thus the key value pair
      \--
      \--  "cip-TBD/displayName" : "Alice"
      \--
      \-- corresponds to the W3C claim
      \-- (subject=holder, property="cip-TBD/displayName", value="Alice").
      \--
      \-- Implementations SHOULD ensure that claims are stored in canonical form without
      \-- redundant '\!holder' suffixes in keys.
      \--
      \-- Keys MUST only contain characters from \[a-zA-Z0-9.\_:/\!-\]
      \-- and the '\!' is only allowed to be used to separate property from subject.
      \--
      \-- All keys MUST be namespaced in the form \`namespace/property' to avoid collisions.
      \-- The namespace \`cip-\<nr\>\` is reserved for CIP-defined properties.
      \-- All other applications MUST use a Java-style reverse DNS name for a domain under their control.
      \-- For example, a key for a property \`prop\` defined by the domain
      \-- \`example.com\` would be \`com.example/prop\`.
   validFrom : Optional Time
     \-- ^ The time from which this credential is valid.
   validUntil : Optional Time
     \-- ^ The time until which this credential is valid.
   meta : Metadata
     \-- ^ Metadata associated with these claims. Used for extensibility.
 deriving (Eq, Show)

\-- | A view of a credential record stored in a credential registry.
data CredentialView \= CredentialView with
   admin : Party
     \-- ^ The party that administers this credential registry.
   issuer : Party
     \-- ^ The party that issued the credential.
   holder : Party
     \-- ^ The party that holds the credential.
   claims : Claims
     \-- ^ The credential associated with this record.
   createdAt : Optional Time
     \-- ^ The time at which this credential record was created.
   expiresAt : Optional Time
     \-- ^ The time at which this credential record expires in the registry.
     \--
     \-- The registry MAY archive the record after this time.
     \--
     \-- Separate from the \`validUntil\` field in \`Claims\`, as the expiry time of the
     \-- credential record in the registry is determined by the registry policy and
     \-- may differ from the validity period of the credential itself.
   meta : Metadata
     \-- ^ Metadata associated with this credential record. Used for extensibility.
 deriving (Eq, Show)

\-- | A credential record stored in a credential registry.
interface Credential where
 viewtype CredentialView

 credential\_archiveAsHolderImpl : ContractId Credential \-\> Credential\_ArchiveAsHolder \-\> Update Credential\_ArchiveAsHolderResult
 credential\_publicFetchImpl : ContractId Credential \-\> Credential\_PublicFetch \-\> Update CredentialView

 choice Credential\_ArchiveAsHolder : Credential\_ArchiveAsHolderResult
   \-- ^ Archive this credential record as the holder.
   \--
   \-- This is always allowed for the holder of the credential and matches the real-world analogue
   \-- of them destroying their copy of the credential.
   \--
   \-- The view is returned for convenience so that the caller does not need to fetch it ahead of time.
   controller (view this).holder
   do credential\_archiveAsHolderImpl this self arg

 nonconsuming choice Credential\_PublicFetch : CredentialView
   \-- ^ Fetch the view of the credential.
   \--
   \-- Registries MAY may restrict the actor in case the credential is not public.
   with
     expectedAdmin : Party
       \-- ^ The expected admin party storing the credential. Implementations MUST validate that this matches
       \-- the admin of the factory.
       \--
       \-- Callers SHOULD ensure they get \`expectedAdmin\` from a trusted source, e.g., a read against
       \-- their own participant. That way they can ensure that it is safe to exercise a choice
       \-- on a factory contract acquired from an untrusted source \*provided\*
       \-- all vetted Daml packages only contain interface implementations
       \-- that check the expected admin party.
     actor : Party
       \-- ^ The party fetching the contract.
   controller actor
   do credential\_publicFetchImpl this self arg

data Credential\_ArchiveAsHolderResult \= Credential\_ArchiveAsHolderResult with
   archivedCredential : CredentialView
     \-- ^ The view of the archived credential.
   meta : Metadata
     \-- ^ Additional metadata specific to the archive operation, used for extensibility.
 deriving (Eq, Show)

Credential registries MAY enforce limits on the credentials they store to avoid operational problems from overly large credentials. The limits are communicated to users via the [Credential Metadata API](#bookmark=id.useqxm7e3ut3). See “[Rationale \> DSO Credential Registry Limits](#bookmark=id.ivn5gi61qa4)” for the concrete limits enforced by the SV operated registry.

#### Credential Factory Interface {#credential-factory-interface}

The purpose of this API is to enable credential issuers and holders to *jointly* create, update, and archive credentials in a third-party credential registry. The above Daml API requires joint authorization by issuer and holder upon creation of the credential. The specific workflows for obtaining this authorization and determining the claims of the credential are provided by the issuer and implemented in their credential issuance app.

Implementing this API is optional for credential registries. They CAN decide to only support registry internal workflows for creating credentials, and not offer third-party issuers the right to publish credentials to that registry.

This API uses the factory pattern pioneered in CIP-56: the `CredentialFactory` Daml interface provides a choice `CredentialFactory_UpdateCredentials` that allows for a bulk update of credentials with the same issuer and holder. A corresponding HTTP API endpoint allows retrieval of the context to call that choice.

Draft specifications of these two interfaces can be found in the draft PR here:

* [Splice/Api/Credential/RegistryV1.daml‎](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-808147bf36f1c087a42b92d67d2021c2ca203076cc0e3b6a31f2ccc60497a34d) (includes the data format of credentials)
* [openapi/credential-registry-v1.yaml‎](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-a73145dfdb26770f01b5fc0a9f35c7c34f067584acb6ec16de7e82040df6f835)

#### Expected App Usage of Daml APIs {#expected-app-usage-of-daml-apis}

We expect applications to be able to `fetch` credentials as part of their Daml workflows using the `Credential` interface to fetch the contract and compute its `CredentialView`. The workflow thereby gets access to full `CredentialView` and can use its data to influence its actions.

We also expect wallets to be able to list all credentials held by their user by asking the user’s validator node for all active contracts implementing the `Credential` interface. Wallets can offer the user to archive an unwanted credential using the `Credential_ArchiveAsHolder` choice. We also expect that wallets can offer the user to open the credential issuer’s custom dApp for managing that credential. We expect them to be able to do as explained in [this section](#bookmark=id.v8brk2y162hk).

Note that apps and users that want to use credentials from a specific registry on-ledger must vet the .dars of that credential registry.

### Read-Only HTTP APIs {#read-only-http-apis}

#### Credential Registry Info API {#credential-registry-info-api}

The purpose of the credential registry info API is twofold:

1. It enables an asynchronous rollout of newer versions of the credential registry APIs.
2. It informs clients about constraints of the registry (e.g. limits on the number of claims or results).

A draft API is specified in [openapi/credential-registry-v1.yaml**‎**](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-a73145dfdb26770f01b5fc0a9f35c7c34f067584acb6ec16de7e82040df6f835).

#### Credential Lookup API {#credential-lookup-api}

The purpose of the credential lookup API is to allow a rich set of retrieval operations to be directly implemented on top of any credential registry under the constraint that the indexing overhead for credential registries is manageable.

A draft API is specified in [openapi/credential-registry-v1.yaml**‎**](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-a73145dfdb26770f01b5fc0a9f35c7c34f067584acb6ec16de7e82040df6f835). It supports filtering by holder, multiple issuers, and a key prefix. The resolution of multiple entries for the same key is left to the client of the API. The record time as of which a credential contract was created is provided, which makes it easy to implement a last-write-wins semantics.

By default the API only returns the `CredentialView` of a credential. It optionally also includes the underlying contract so that it can be disclosed for usage in a Daml transaction that reads the credential.

#### Bulk Credential Retrieval API {#bulk-credential-retrieval-api}

The purpose of the bulk credential retrieval API is to enable network explorers to ingest all credentials of a registry as they are created, updated, and archived.

The corresponding HTTP endpoints work by exposing the list of synchronizers which are used by the registry to store credentials, and then offering retrieving pages of create and archive events for all credentials in record time order.

## DSO Credential Registry {#dso-credential-registry}

A decentralized credential registry is implemented as an extension of the Amulet Name Service (ANS) app run by the SV nodes. It implements all the APIs defined above side-by-side with the existing ANS 1.0 APIs.

There is no CC payment required for creating credential records in the registry. Instead, the registry expires the records within 90 days, so that the traffic cost of creating and renewing them covers their storage cost.

### Technical Details  {#technical-details}

The APIs are implemented as follows:

1. The `splice-amulet-name-service` package is extended with two templates as [shown on this PR](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-271a41476c5ed80c77cbe363f39cc58f5f422a6c9991cfc2fa2bd65398802d7e).
   1. The `AnsCredentialFactory` template implements `CredentialFactory.`
   2. The `AnsCredentialRecord` template implements the `Credential` interfaces and serves to record credentials in the registry.
2. The Scan app backend running on SV nodes implements the [openapi/credential-registry-v1.yaml](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-a73145dfdb26770f01b5fc0a9f35c7c34f067584acb6ec16de7e82040df6f835), so that any Scan app can be used to interact with the credentials registry.
3. The Scan app proxy served by the validator app implements the [openapi/credential-registry-v1.yaml](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-a73145dfdb26770f01b5fc0a9f35c7c34f067584acb6ec16de7e82040df6f835), calling out to multiple Scan apps and comparing the results to implement BFT reads.
4. The SV app is extended with automation ensuring that there is exactly one `AnsCredentialRecord` self-published by the `dso` party, which announces the URLs of the Scan apps serving the off-ledger APIs of the DSO Credential Registry.

## Standardized Application and Metadata Discovery {#standardized-application-and-metadata-discovery}

Together the APIs defined in this CIP and the DSO Credentials Registry enable defining standard ways to discover applications and metadata about them. It works by a CIP defining claim keys within the CIP’s namespace together with their purpose and expected usage.

This CIP defines the following keys:

*  `cip-TBD/credential-registry-urls`: serves to discover the off-ledger credential registry API of a specific credential registry admin party `admin`. It is published by `admin` using a self-published credential in the DSO Credential Registry. It specifies a comma-separated list of URLs that serve the credential registry HTTP API for party `admin`. Multiple URLs are supported for decentralized registries so that clients can implement BFT reads.

* `cip-TBD/credential-issuer-app-url`:  serves to discover the dApp of a specific credential issuer party `issuer`. It is self-published by the `issuer` party in the DSO Credential Registry. The idea is that the users’ wallets read the user’s credentials from their node, and then query the DSO Credential Registry using `cip-TBD/credential-issuer-app-url` to discover the to URL for the issuer-specific dApp to manage the user’s credentials. We expect the wallet UI to offer a redirect to that dApp. These redirects to this URL may specify a `credential-contract-id=<contract-id>` query parameter to focus on a particular credential. Whether to offer such a UI is optional for credential issuers.

* `cip-TBD/is-featured-app`: is issued by the `DSO` party in the DSO Credential Registry to communicate the featured app status of the `holder` of the credential with this key. The corresponding credentials are of the form:
  	`( property=”cip-TBD/is-featured-app”`
        `, subject=”<holder>”`
        `, value=””)` [^1]

This CIP also enables finishing the implementation of [off-ledger API discovery from CIP-56](https://github.com/global-synchronizer-foundation/cips/blob/main/cip-0056/cip-0056.md#off-ledger-api-discovery-and-access) by defining the following key:

* `cip-56/asset-registry-urls`: serves to discover the off-ledger asset registry API of a specific asset registry admin party `admin`. It is published by `admin` using a self-published credential in the DSO Credential Registry. It specifies a comma-separated list of URLs that serve the credential registry HTTP API for party `admin`. Multiple URLs are supported for decentralized registries so that clients can implement BFT reads.[^2]

Note that CIP-56 originally specified the key splice.lfdecentralizedtrust.org/registryUrls for this purpose. However there is no implementation thereof. We thus took this as an opportunity to choose cip-56/asset-registry-urls for consistency here. We plan to adapt the CIP-56 text accordingly once this CN credential standard has been adopted.

In general, the expectation is that all properties in a credential’s claims have the form `namespace/property` and the namespaces are one of the following:

1. `cip-<nr>`: for properties defined in a CIP
2. `<dns-name>`: for properties defined by an organization that owns the DNS name `dns-name`. These namespaces can be freely used by organizations to define their own properties in a way that does not conflict with standardized properties from CIPs or properties defined by other organizations.

We expect future CIPs to define additional well-known properties for discovering applications and metadata of a particular kind.

### Discovering the DSO Credential Registry and Canton Coin Registry {#discovering-the-dso-credential-registry-and-canton-coin-registry}

The above properties will be used to make the DSO Credential Registry discoverable by making the `dso` party publish a credential with issuer \= holder \= admin \= `dso` and claim

`(property=”cip-TBD/credential-registry-urls”,`
      `subject=”<dso”,`
 	 `value=”<scan-url1>/credential-registry/v1/,...,`
             `<scan-urlN/credential-registry/v1/”`
      `)`

in the DSO Credential Registry. The Scan URLs are the one published per network here: [https://canton.foundation/sv-network-status/](https://canton.foundation/sv-network-status/).

Analogously the `dso` party will also publish a credential with issuer \= holder \= admin \= `dso` and claim

`(property=”cip-56/asset-registry-urls”,`
      `subject=”<dso”,`
 	 `value=”<scan-url1>/credential-registry/v1/,...,`
             `<scan-urlN/credential-registry/v1/”`
      `)`

in the DSO Credential Registry.

We expect other asset admins to also make use of that functionality to enable wallets to discover the off-ledger API of an asset admin directly from the network.

# Motivation {#motivation}

TODO: expand

* seen multiple entities start work on identity verification and better name resolution
* have the outstanding gap in CIP-56 that registry URLs cannot be discovered automatically
* have the experience from CIP-56 wrt how to standardize foundational infrastructure APIs
* want to provide the common building blocks to serve existing credentials in an inter-operable fashion

# Rationale {#rationale}

## Use Case Analysis {#use-case-analysis}

The Credential Registry APIs and the DSO Credential Registry are meant to serve as building blocks for use-cases like service discovery, self-published profiles, name resolution, and KYC verification services. In the following sections, we explain how we believe these kinds of services can be built on top of the building blocks provided by this CIP.

These explanations are not meant to specify a standard for how to solve these use cases. They are meant to validate and demonstrate the building blocks provided by this CIP.

Nevertheless many of these use-cases profit from lightweight CIPs standardizing common claims and/or resolution mechanisms. We expect future CIPs to provide this kind of standardization on top of the building block provided by this CIP.

### Service Discovery / Runtime Application Composition {#service-discovery-/-runtime-application-composition}

The problem of service discovery on the Canton Network is about how to resolve the party-ids of application providers to the additional services (e.g., HTTP APIs or custom UIs) that apps and users can use to interact with the contracts from these app providers.

A typical example is the problem of wallets having to resolve the registry `admin` party-id on `Holding` contracts owned by their user to the [URL of the off-ledger registry API](https://github.com/global-synchronizer-foundation/cips/blob/main/cip-0056/cip-0056.md#off-ledger-api-discovery-and-access). The wallet needs to know this URL to read token metadata like total supply and to get the required data for transferring `Holding`s.

As shown in “[Credential and Token Registry Discovery](#bookmark=id.v8brk2y162hk)” storing the URLs of service associated with a party under a well-known claim in a self-published credential in the DSO Credential Registry solves this problem.

##### Application Discovery {#application-discovery}

The credentials used by asset registry operators to self-publish the URLs of their off-ledger APIs can also be used to discover all assets registries by listing all self-published credentials in the DSO Credential Registry with key `cip-56/asset-registry-urls`.

All assets available on the network can then be discovered by listing the instruments in each of these registries using the `GET <registry-url>/registry/medadata/v1/instruments` [endpoint](https://github.com/hyperledger-labs/splice/blob/82a11c72f42da70de44b1d1fd7399dd417c73a7b/token-standard/splice-api-token-metadata-v1/openapi/token-metadata-v1.yaml#L31) defined in CIP-56.

Analogous approaches can be used to discover other applications offering standardized services.

We expect that generalized application discovery is handled as part of profile publication via self-published credentials as explained below. Checking whether an application is featured by the Canton Foundation can be done by querying for the corresponding credential issued by the `dso` party with property `cip-TBD/is-featured-app`.

### Profile Publication {#profile-publication}

The problem of profile publication is how to enable the useful functionality of party owners self-publishing well-known metadata (e.g., website, LinkedIn profile, dApp URL) about themselves. This is common functionality in many systems and helps connect the system’s users.

This information is typically unverified, which is fine as long as that information is not used to resolve names, but only to present additional details on a party (e.g., shown on hover).

Such self-published profile information can be published in credentials registry using credentials with issuer \= holder and an appropriate claim. For example, the owner of a party `p` could publish their website using a claim of the form

`(property=”profile.website”, subject=”<p>”, value=”<url”>)`

To ensure that different applications interpret profile information the same way, a future CIP should standardize the common properties used in profiles (e.g., by building on the corresponding ENS standard [ENSIP-18](https://docs.ens.domains/ensip/18/)).

Furthermore, it might make sense to standardize how applications can discover the registries storing a user’s profile information. A likely default is the DSO Credential Registry.

### Party Name Resolution {#party-name-resolution}

Party-ids are globally unique identifiers used in the Canton Network. However, they are difficult to use for humans as they are neither memorable nor easily comparable. Below we sketch how to build a name resolution system on top of the Credential Registry APIs and the DSO Credential Registry. We do so in two steps:

1. We explain how to resolve names managed by a single issuer within a single credential registry.
2. We explain how to resolve names across multiple issuers and credential registries.

#### Single Issuer and Single Credential Registry Name Resolution {#single-issuer-and-single-credential-registry-name-resolution}

Functionally this is what CNS 1.0 provides, where the `dso` party is both the issuer and credential registry administrator. A CNS record for user `p` with name `n` corresponds a credential with the claim:

	`(property=”hasCnsName”, subject=”<n>”, value=”<p>”)`

The credential is issued by the `dso` party and held by `p`. We can read this credential as “The `dso` party claims that the CNS name \<n\> is owned by \<p\>”.

Resolving a CNS name `n` to the party holding it can be done using:

	`GET /credential-registry/v1/credentials`
		`&issuer=<dso>`
		`&keyPrefix=cns.name!<n>`

The response will contain the credential listing the owner of the CNS name if it exists. The guarantee that there is at most one such credential is provided by the `dso` party as the issuer, which shows why it is paramount to constrain the query with `issuer=<dso>`.

The reverse lookup to query all names of a party `p` can be done using:

	`GET /credential-registry/v1/credentials`
		`&holder=<p>`
		`&issuer=<dso>`
		`&keyPrefix=cns.name!`

The response will list one credential per CNS name assigned to the holder.

The [draft PR shows here](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-6ffb0d08eee67175e91eabd4e3bf1d811e8ab18a029a541d169aa482fe3e294a) how to implement the `Credential` interface directly on the existing `AnsEntry` template to allow accessing CNS 1.0 entries via the Credential Registry API. Note that the issuance of CNS 1.0 entries uses the existing workflow. This matches the overall design of this CIP, which gives full freedom to issuer wrt their issuance workflows for credentials.

#### Multi-Issuer and Multi-Registry Name Resolution {#multi-issuer-and-multi-registry-name-resolution}

The basic idea is to follow the DNS construction and use hierarchical names and recursive resolution. Resolution is always done against a specific pair of an `issuer` and a registry `admin`. The root of the resolution is CNS with issuer `dso` and registry administrator `dso`.

Managing the issuers associated with root entries (i.e., top-level domain registrars) requires defining suitable off-ledger governance. The association itself can be stored on-ledger as a credential issued by the `dso` party. We expect that such governance can be built by adopting existing policies like the ones from ICANN for the Canton Foundation.

To support deduplicating names across multiple organizations issuing them concurrently, we expect that a more specific name registry interface will need to be developed. It can be implemented without contract keys by having the name registry administrator maintain the key-value map on-ledger in a scalable fashion (e.g., as a radix tree).

The main challenge we see with multi-issuer, multi-registry name resolution is actually not in the name issuance and resolution aspect, but the design problem of how to cleanly allow apps to leverage the existing names that entities have in off-ledger systems like DNS, email, ENS or LEI.

### Verified Identities {#verified-identities}

There are many systems that associate names with entities. In particular, DNS names and email addresses are well-known and widely used to identify counter-parties. In contrast to CNS 1.0, these systems have their authoritative data source off-ledger. Thus we cannot expect that statements about party-to-name associations in these systems can be resolved directly on-ledger.

However, we do want to support imports of statements in the form “I \<issuer\> have verified that the entity controlling party \<p\> also controls name \<n\> in system \<S\>”. We can represent this using credentials issued by `issuer` for holder `p` with a claim:

	`(property=”identity.<S>”, subject=”<n>”, value=”<p>”)`

Once represented that in this way these can be used for name resolution in the same way as explained for CNS 1.0 above.

Issuers have full control over the verification they do before issuing such a credential. For example, doing DNS verification using a [DNS challenge](https://letsencrypt.org/docs/challenge-types/#dns-01-challenge). Metadata about the verification done can be represented on the credential as well using additional claims. Care should though be taken to avoid bloating the credential.

App providers can choose which issuers to query for names in what systems to resolve party names in their applications. They can combine multiple naming sources by issuing multiple name resolution queries.

#### Consistent Cross-App Identities {#consistent-cross-app-identities}

For identities to work consistently across multiple applications it is important that these apps use compatible name resolution strategies, including compatible lists of issuers and registries. We envision that this can be built for Canton Network in a future CIP that standardizes two aspects:

1. How names from different systems are represented in a single namespace as ASCII strings.
2. How to build suitable Canton Foundation governance such that most apps can use the same issuer and registry configuration.

### KYC Verification Services {#kyc-verification-services}

KYC verification is similar to verified identities as explained above. The difference is that it often imports statements about the physical world and that the processes for doing so are non-standard across organizations.

These statements are always made by the issuer of the KYC credential and should be understood relative to the specific process the issuer makes. App providers that want to consume or provide external KYC services can do so without network wide standardization. Properties support namespacing, and in fact, prefixing custom properties should be prefixed with the DNS name of the organization defining the custom property; e.g.,  `acme.com/custom-property`.

We suggest that organizations experiment with the exact claims that they need to outsource KYC services, and then use their experience to build a CIP standardizing the claims that have proven their value for wide use.

## DSO Credential Registry Limits {#dso-credential-registry-limits}

TODO: inline the explanations from the source code

* for now see the [source code here](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-271a41476c5ed80c77cbe363f39cc58f5f422a6c9991cfc2fa2bd65398802d7eR105)

## Focus on Public Credentials Only {#focus-on-public-credentials-only}

TODO: expand

* credentials that can be discovered publicly provide large value, and serve to gain intuition
  * credentials must be public for them to be indexable by explorers
* private credentials can then be built as an extension (i.e., future CIP) by authenticating the users looking up credentials in a registry and only returning the credentials they are allowed to see
  * this is though a non-trivial effort as it requires standardizing access control specifications on credentials published to a registry
  * probably best done for cases where the credential issuer and the registry are run by the same entity, and the registry can thus use custom rules for determining access control

# Backwards Compatibility {#backwards-compatibility}

TODO: expand

* the change is backwards compatible, as it only adds new functionality
* we expect that the future CIP that standardizes CNS (potentially including identity verification) will also be constructed such that
  * CNS 1.0 entries are properly integrated
  * existing name issuance and identity verification services can integrate into the unified system

# Implementation {#implementation}

TODO: add additional implementation notes

* a draft of the HTTP \+ Daml API specs and Daml implementation of the DSO Credential Registry is available on [this PR](https://github.com/hyperledger-labs/splice/pull/3416)
* see [here for notes on how to build the indices for listing of credentials](https://github.com/hyperledger-labs/splice/pull/3416/changes#diff-898d544e4b90bc149b606729ed90e3c4452c3eea8bb1b11301d6adedde704f2e)
* add a note that renewal of credentials is best done by creating a new credential 24h ahead of time to avoid contention with existing prepared transactions referencing the old credential
  * the last-write-wins semantics implemented on the client side for name resolution works fine with that

# Copyright {#copyright}

This CIP is licensed under CC0-1.0: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)

# Changelog {#changelog}

Jan 9, 2026: wrote first draft

# Appendix

## Open Comment Threads

TODO: fix these in the actual text and remove this section

### Claims Data Model (ADT vs triples)

- **leo@c7.digital (Jan 12, 10:54 PM):** Suggested using a Daml ADT instead of a key-value representation.
- **Simon Meier (Jan 13, 8:41 AM):** Agreed this may be preferable despite JSON ergonomics of key-value maps; planned to evaluate a pure `(subject, property, value)` triple model.
- **leo@c7.digital (Jan 13, 3:49 PM / 3:51 PM):** Noted real cases where duplicate `(subject, property)` entries are useful (aliases, multiple titles).
- **Simon Meier (Jan 13, 4:10 PM):** Agreed that multiset semantics align well with multiple credentials defining the same property for the same subject.

### Deterministic Resolution and Ordering

- **Vladislav Kokosh (Jan 20, 11:39 PM):** Requested precise rules for last-write-wins and tie-breaking when `createdAt` is optional.
- **Simon Meier (Jan 23, 4:45 PM):** Clarified that:
  - Record time is Canton protocol sequencing time for the transaction confirmation request.
  - Record time is guaranteed to be present on the off-ledger credential registry API.
  - Contract ID is the deterministic tie-breaker (relevant for same-transaction creations).

### Renewal and Expiry Policy

- **Wayne Collier (Jan 12, 4:12 AM):** Asked whether `expiresAt` supports automatic renewal.
- **Simon Meier (Jan 12, 10:52 AM):** Recommended renewing by creating a new credential ~24h before expiry to reduce contention; automation is intentionally not standardized in this CIP.
- **Frank Preiwuss (Jan 20-21):** Asked who defines expiry policy, whether usage-based extension is possible, and whether payment/deposit mechanisms could support longer lifetime.
- **Simon Meier (Jan 20, 1:12 PM / 4:57 PM):** Clarified registry operator defines policy (DSO likely ~90 days); usage-based extension is conceptually interesting but may add significant complexity and does not remove renewal requirements.
- **Frank Preiwuss (Jan 21, 1:54 PM / 2:02 PM):** Agreed complexity trade-off is significant; payment/deposit model remains a possible direction.

### Security Model for `expectedAdmin`

- **Vladislav Kokosh (Jan 21, 12:18 AM):** Requested explicit threat-model language: package vetting/trusted participants are required; `expectedAdmin` alone is insufficient if implementations are incorrect.
- **Simon Meier (Jan 23, 4:47 PM):** Confirmed this is an implementation constraint to be validated via registry provider security audits and customer DAR vetting.

### Pagination Semantics

- **Vladislav Kokosh (Jan 20, 11:59 PM):** Asked for explicit total ordering and cursor semantics to avoid gaps/duplicates when many events share the same record time.
- **Simon Meier (Jan 23, 4:48 PM):** Agreed and noted OpenAPI definitions will make this explicit.

### Encoding Consistency in Examples

- **Vladislav Kokosh (Jan 20, 11:40 PM / 11:43 PM):** Pointed out inconsistency between triple examples and key encoding rules (`namespace/property[!subject]`), and suggested using implicit holder subject where applicable.
- **Simon Meier (Jan 23, 4:51 PM):** Agreed to improve clarity in a polishing pass; planned to switch uniformly to triple notation.

### KYC Interoperability and Liability

- **Edward Newman (Jan 9, 8:18 PM):** Asked whether third parties can realistically rely on externally issued KYC credentials, especially given legal/regulatory liability concerns.
- **Simon Meier (Jan 12, 8:52 AM / 8:55 AM):** Suggested focusing this CIP on interoperable tooling first; provided examples where shared verification services may emerge (e.g., large organizations with multiple on-ledger parties).
- **Edward Newman (Jan 12, 3:19 PM):** Noted examples may still be intra-entity rather than true cross-entity reliance.
- **Simon Meier (Jan 13, 8:52 AM):** Agreed from a legal perspective; added that technically issuer and consuming app can still be distinct parties/apps.

[^1]:  This is implemented by the `FeaturedAppRight` contract implementing the `Credential` interface.

[^2]:

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnAAAAFHCAMAAAAWWoEZAAADAFBMVEX////c3d+doaV+g4mrrrL7/Pzu7/COkpjR09X29vc6QUpdY2q5u79uc3rm5+hMUlvFx8rH3viqzPX0+P3h7fvX5/q51ffU5fr7/P4QceVjou47iumWwPLr8/xPluuIuPKZwvPw9fx3rvAmfuff39/7+/vq6uq1tbWlpaXS0tIAAABubm4YGBguLi6Tk5P09PRERETExMRZWVmBgYGMj5W/wcSZnKFJT1hDSlN4fIK2ubzy8/SLj5RHTVZKUFg8Q0xbYGekp6zf4OKHjJFrb3c9RE1QVl6GipBucnp5foSusbTt7u9nbXTQ0tSlqKyipaqpq7B6f4R1eoFcYmlESlOEiI54fYOsr7OKjpNyd31eZGxGTVabnqNjaW+Dhoy2uLyAhYpSWWCcoKTX2dt1eoD3+fnHycyQlJlUW2JkanFHTldOVFyUl51fZWxOVF2IjJKbn6R6f4WGio9hZ26Xmp9IT1iLkJR/g4pWXWRqb3ZFTFVQV15ma3K+wMOIi5E+RU55foWNkJZYXmaIjZJdY2tBSFFbYWlYXmWEiY9CSFFwdXze3+GDh42bnaOtr7SkpqyprLBVW2NlanFXXWSPk5hNU1uanqNeZGs7Qks+RU1/hIlBSFB7gIZ2eoFwdXtnbHNtcnhiZ25XXWXr7O2Tl5xkaXFUWmLq8vvG3fjO0NKpq6/V1dWdnZ1zeH7ExskAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADCgNW8AAAp8ElEQVR4Xu2de2wcyZ3ff/2cB0lJHE0k9hCUhOVDZEsixZGdGOsEd17fIQcriwN8F/hu1zmvbcjebAwEt0EuONjJX3EeRpL7I4lje+Gcc/EaMRAYiI117p/b+yc2Yjui3q0HSUFaQRxJpoYrUZxHP1PVPUPO1Aypme7qnulRfSTOdP+6uqar+9u/qq6qrgJgMBgMBoPBYDAYDAaDwWAwGAwGg8FgMBgMBoPBYDAYjFDgSMOgkyYNwahapKW/kEXSEgxui7Qw9iQ9QloCIaUF0tRXpNKUPcr+/aSFsSeUHVwIEVIlkSAtQQmaXp40DDbDlG/4fkegLjiQSUN3vGCCgwppYHRJkjR0x4smOEaPYYJjRAoTHCNSmOAYkcIEx4gUJjhGpDDBMSKFCY4RKUxwjEhhgmNEChMcI1KY4BiRwgTHiBTKHUIZkCnivwxeFNzuwJwD/HpTCJAeNq4DZO0i/hoV1tEiDp0FvEdurTlYI83bsrK7mpUKjdZ+hHk42uAeaAng+QTPD7uf3DAvKO6m0VoIHsaP7uywQ1ICsEd4SwHbRqujJhlgF47C+h7S7C+YhwuHdVDWsZdCn1lzHY4deoSMqY36RlCQN0pX7ivpUoor6Z75sGyOPYDNIuSyWG+QFmAcksYHClSRA5wEFByMfVW7soHMFTgoS+aaUk3ZBT2ny2sK5/S9ewMmuBDwvFkDYpavIr2NplI5qHsiLuuqDlZBKWSHvTdT+LsHhwBG+OHqupsjl/mss4YD6UhvhzYfHQIoAMo0kQPEH0MfQG7C5JEKYS2LfuXeS9n6L/YxTHDUKbRqzsL+bWOjodzlrI8na/5u59U55MDw1+bj+gargjYeBLwu6oAjQYU3gIMcLgsZObxaLx1OmJlOc+Cewspw4WOubyuoDnJW9tb22wFP3c+cXSjIo7DZEHojhaTprVaHQBnDC2u2+dhBu4MsrFXubQflU0UjDhczDsc4MNQdnKIMF8Di0okmT+igR9e7xBsDpqK4Tg/gcVmRH6BvfZJLQEVROLjLKwe8bTqK5y43WejvVxZfSIapX5Ogr82FS3ofaQlK0BiZh2NEChNcC1OkYccyNd1oHhz2SnKjlQIv9lPqCc4G4QphJN70nRq6tG2RazVmMeYEeuBIXCCMRJLnru9YAr733MIL7eFOS7qmySppbmZ4CzTS1h3ZlmqSZupbOw23jVsv0mDNutV3e3IyoWladYY0N8NB0CTvzgvt4XR8Ws8DqJyj5Suybt6aNwVBhxnZlnVjWeXBTkB1eEbUQOVt7yKogtXiE5vJig+y6xP3xgxcn5EpwuGkiJ40J4wHkF0/XGtEza6j/9n10Q0A15RN3YPRIRSubsP1wphD3ENkw+0U2O5aHsFByUS/getLUDBjTLqHv922jOdiL6EPY3lKhuSmBDiV+Qov6jDH8XbqfL6K/J92Ws8/a0wyVV5kD7dzn3MaVLSLpgimdgXd3qKtXbSHkCCvWsYFeHYLYMG+qgEuwM3xV7TyThRtUARuQhrXjyS48dExRVYAXUMJlK3EOEgZ5yUvkIT/S5Noq5I6CjApVHM121HpCCjWpFSLjNcVkI7YKBznNr8enLRQjKgkoFjyIZhMoa0PTPcH+PH6EezBovu5jP60pYSlXUwkUMKv4upl8ypOl6MhiT2DJZTkGZxk+rzIgnMbLF28s3DL/dz0TKaODVYtzKUb01NYOXDdnoMVz7YL/MOEDuZD4+46P2pUHnAT9iauPyveRVEVHzWJVcfO7c5dgI2Hj5yDXri7j5A7XH9SC1F9gP3aFnZ3xbvYkH72OI30VXwAGxUTNusVv+kx64FY6xuwF+WG620nweskACmoJ76hGvDWjQXaDwyYFzlLXdkuvZXQw1i+0VpfqTMjpmoj8Um2yl9t3tjE4TLcAeUhLluZJiTHk3XttOFevVFrOME5O+M6TViwXiuZJSbLSOaNDRX8EcDHO8bBBuQeuREkDif1B8pkpYORoTyB1e4wAaXSrZfcEuspLtXCIaZkJwxxhBFnfJhCzmpawjnHiooLN5jFKvqor9QZts+DJ8/Scm1hFx6OwzFXYwUYe5CrFBWvUxyBV118ELdRYYzCwYanwXsK1JrhM9wq8ajAGQVlDDnfBwqM7q89M9+ZLBUy8urk3lm9yy11Brmyk/xlnIbSjZoVyw8XHJpI2Zf3Tqk/XmjBmbKa1G2vzZtXLcm4yasppDeHU23erF2BlIBylmfiLJ9MHkeFOeN4Yu9GclGpbij4Cy1XE4ouP1TQwyPu4+ZtV3BfoyeKhHJOR5GhgsOl0apUwOFcZEU0QSmgbFRR0mVPcVXvqyQphlu+Q+t33KdUbExBEf1SotYKthe6fNJx4LK3qFqCcx3wOQBbnE1atYehlXzeMkA00BPUmfONOzO6pqVpaw6XU9z63AW3QD015VZ1zszhZeT+pvAXtmCDG3CuuU6h66Yt5fD2UqO5kRxMjO6+tRvaNETNLC5ArT53xkvyjLu2iNI2s+BtcZOM095a8dsmRsbutAguMF0LboddJTWhdPLE2Qn05RE0xhc6S+0xu3bQ3el0NHi8INUi6Y+9TJqoIv3tdABXxxg40pi/K4WTpR74pBs9uaUfCJoBthI0xg7qbuLNvt/gOR7+srZ29kftKinaMluvNNibtEVdwzQRvd7E9EgHjHFQy3CvCvxfwu/YmV//5Cd4Fbufj05z7/xvIpiHW92UJOveauR3sdepgiS4BZOGStO+YQ+3q4bRcPUCsu+zf5j+9O++SljT6X/kZgXts1RXcOpCvWpkegHXD0wBzOBKERXXEUy5lQVkFQGmdkmTsctScaK9xiucroWZWoUI/pjZo9vfHjF2xAB5OOkzw7y1Vvw+wI/ITcj7/GfS1AIPJ62qat08rYuqUAUZToGhmjw6RbIqWAuXQG6rVo9Yzv8wb4knzRtqylC16rDb9U3lBOT5ho3w3N+ACO5z+v96c/n7pLVjFjdFyboAtgbTkttpScVlWyuBq95VVJYztFkbFmLxVlQ3OLLbKvwU9x5xOQ7XYB6VIazQ9DYIgvvSyIO1/wbwH0h7F5TFobKGFLXTdogbOU2ku2vu2jLcUIFzLm1vHgyuqKpQWRYBuXV3fUZ0VNzloKEfDXViLrizM9/+9HdIY/cgJ6bO3rhEZCS4mXu7MVGY0683bR0ENDidwA2r6gLusQC2xYfn2mrEWXCfG0pd+DPwn5E2oWHvdub8rHgV8pspt31eNZZ3+nDwXMBJpvqPKVlfKcu4PzMq41ZgFt146uKFk7zbtB8WcRXcxz/2X978jx30jugIV0p2fknLq+Jl0E7IgqMjo5RUzctg5Zfw9kvb/ZcGhCSswAmVuwLHTznGMiyqVtIEyTxp3AQT98hkNPD2Wx8lTZ3RvlqkmfxiraKkialWk0tf1oZsE7QSoxX6MfY9X05/ijR1TCeCA1VV51ttpKUGE1x3xK1p64sZK8jj6HC546atDkn3YwPDNkEboloJGmO8ynBvC+e/S9oYsSJGgjt7tBjEuTEYXbEvQNFtm47KcF3BynDdEZfWmpfTf7/0U9LIiB/xyFI/8hHr56zwxoiIj3yVtPiGZalBoR9jn3E2/TXSFAAmuKAEjbHPs9Rzf0N471+SRkaM6W/Bvan/K9LEYITF194gLYEJMUs922jtF4JmgK3Qj7Ff+MrnSQsFQhLc2T9irwl2CPULQImz9+HHpI0Cslkbr4ga0mu/Z//6Du63SKuzFE0k3u1ZSZGgMfap4F478MtQxjsIQXD/b/j/eEu/f/vVea9Hev8QVB6t0I+xD/hCGLmpS0hZ6he/XstSX307PUK+othLgmaArdCPsfekwyt/hyQ4xL/5t3WL9OX0H9SXew19edCPsdd85U9JC0XCE1wzL6f/hDT1BPryoB9jjwnRvUF0gkN8Kv3aOdIWOfTlQT/GnhKqe4NIBQfYz4U7SNjzoS+PoDH2V0vD69r7pCnO/BxOzFe+R1oZ/cIrr5MW6kTr4VxGRkhLhAT1R60EjbF/OmCeS+feJW2DwObm2zT7uzAo8ZFvkJYw6IGHw4y8QVoiIqg/aoV+jL3htS+SllDokeAAPu/zze2A0JcH/Rh7QoeXLTA9ExycTfeikoS+PILG2BdluFc+39dvE1PhvVI55CqfeNAXgsv0V+VMSHxf+AppYnTD6PZ0icdy3uTELewEcakFOtZkxLTsfQzwBMkAE2PZHSBbm/PM2zbmro5N1G2dMEy9jqLTLBVzNl2bBjUygmaAraQDzkkewMNx2+OS6I47YmQrcsPQJRNZWPOWapPgebgTmtU27ICD4ItjmbZtS7b3AZKdUQ7hzQelwwBmwj6mgNnVYCHVrkJ3QFcKeq/09YidXJV+X6Kmq9c9QTKz4QR/P8Ov57xDOLK5AXBU5+8rfJmXwH44moQKBzlHvpuR+PSqKYFSGLdrE/5kZafwUplbUyArgSEVDgnpDx8rBRRkstQ0J1ARQEF/3gdewcYDq/jLKRaPHepudFAjPWR3MMtjx8hid1f0T/a9HmllIy8MPyNtQUhxXd1hbQgiOLNwaCfLPAp47mKncCwLZhErB5IFyFVGrYeHDplDt3MTW9iZlouHj7ozG6fMwoRdOHx0y/YCC+hjwvXWG8VRLwjWVovjzLkJrj9jjFUfbeeynfFESHSTCT4XvUuX+fTdN+FbpDE8DC5FNblgBX28CyK4Ctip7eHideyWRp9tT4dcC5G2FeDMp1Dx8u7EuOD1xL6XQ9klyhBre7t7bOnHSpWdINjREYW7DAhYi0fNHPfSbeAyevcFiqYzNlKbb7xLPvHXpKULvgVvGe+QxtDQO8wBv/xt0hISAcpwkAS+ss+qeSEHa2wjBcfc6UALBVc0STCrBX2nhJbl7++U6qpywbkP9VJtoaAXH1aFDRRk95ugWHQ7nuv31+6XMzhLxbPEB8A6QFo64Uu/IC3d8c1srzuRtPLfXyEtIRFEcJIyUryTnPRKMQ+q2BtJShX5NxAVZR9UFUWGh0ml5oWKUhbWbeXpdi75WFA4WK960yBbCloBnsdBtloy0may+KC5BGnuHtFfCTjw6NL/+uBrpKnn/DZpYNDH57t9aQrd3Hz9cHh8Iv0bpIlBHyQ4H3nqKz512sxbvWjp2hWUpFB7Wu8QJEuNO1hsPvLU3yQNvvjmVjTdFTrm75GGcOiZ4PqgYdGH2DB/hf4+Rxq75wfFT5GmnvEJ6KESooFCphQYdx7nrvPUj+O9qNRrvPwGaekV7pn4OGkdJPpBb+D7MHzu1sIrf0FaegatJD2X3jjS/p7cIDLe5/4daWKEwBcju52eh88Dab/baCZzkDBlvIY3XNWYcbd6lY5tUMhGlRoZpd5q00wWB8/uGl3XtE9SCPTAw+0rDqZ/S/HFkbbiyKXGABJFbugQuLXV7aS13V/hWIPxeazjDg0xY/dmpLA4t/UD0jQw3Bk9dkdJlQvZ/YbBcXZNRY7tdmx//NiT44SZW1MkA290u8coaXBuoyWYkCvJVSG3Nll2dE52CjgmvMPovrtjwn0UOlV2HhwxCpMVFDM3bjumnSjAeGUIpI3YSC96DycNrt4ANqpQuJ3KgvMBVO9Xvb40o/ID3Icqk1G8ng73YC1T/cA4tr3T6qrXY+re6v0SlNcOWmsFGZwCiolzs+QNHdJ418JtgwejkDXvi2OQvG8jd4l+wn5sfLBKoZ0vIiL3cOlvkpZB4jA3YVaROD5EDg1AcDvrJXUFRjeAd3a6+Y1swXqrRo5IuIcXCHoGqjwHWakqelWF0lgZxQZK1XUP/CbSbLYMFvKbRWWCxyXD7nrl9ZKoPdzrg1l+qzHBr/Fy0WnqFDoGhUIhiQpcWDM1qjIc8npmje0YwdiS0frYo1RRwt0X9slFw7s8uoDVOZEuJnFfm0cpmHQ934f4w76LZCdT70keGhEL7rXInoZ6gKRYDtw1x7G8dnB79zUlW1QeWArgXjW20jhOq82l7SGbgydKAru62+KRgpcBPbDvoM975Und7UdTVaz17X2QuJ0jQ/769Q0+X4iq11WH+JS/z918MzpJWqgTWZIiLcO9UhqowZGi4qC4SpoYHUFvzixK+Lyvfe7WzwxgkgDe6Luirc/T7HO3fiayJEX40PAKH2y29IGgXSvDaPO73LUg7UIOABEK7uh/JS0vDDstXu1e1+Aa35RV6m+Ftws5AET30JD+c9IyYHjtVJbAl7iiYqwrhWNVQF+psiU6ijNUStzJSrxbRTfGgVge0gtHDG4NLctbMG7L9j2FcyopJ+cUDsog30U+zgG9ofJuMIjMw30t/PFU+wKrYG8kgJeBP1guFPYD3C4Ia1Dgtwr2Qalw3w3DFZwt0AuHNwvlo7xREOFYpYBf0V0rJNewg+MKBdzE4BQKQd9z7z+i8nBf+lmQl4djhOuSJp4lR01uWHS221UcTjEaBlp5AFkOhKQCRmoNLKjKSmN/9337yzhDNSZLPnvB9zFReTjjBdGbiyxtcOmHidL9nXEgUnrB3m4eQJkqfiQQEgV9bSMLVbDsgtFw65dX3XIcv+p0P7JAvxORh3t90AtwgNupUrXSf5UDXYLqfkXWvS6SvFJKKumHYu3hQZ8sYSneO4rW5SEpZTzKKVDbN41sKSVdRl/IAQ6eh4uGfmvSquOz9snnbv1MZEmKJEuVcqxJixEhkd0+3eLzwHzu1s9ElqQoPNw3XpAaETq8RhoYXXKub2YPbcHnfe1zt874aE+GgAg1SRHTx2nxeWg+d+uQ0KbD3otwkxQpn+3jIQR8nmafu3VKL0ogISdph/DLcMd+RloYe/O0N9MkDQi9uF07xud97XO3jnmTNIRP2EmKjH/+KmnpJ3yeZp+7dU70igs9SXXCzlIrPyEtjOdj9/Vt2s98gzT0Fz7va5+7dUHkBZHwk1QjZA/HOpX7490+v1P7lZ5UKXWBz/va527d8EbEXS8jSJJHuB6u7ehVjA5Y/gxpYTyfN0hDv+Hzvva5W1dE/KAaRZJcwvRw/Z6h9jXfGtCzF6bgRr9HWhidY0Q0U8fgEINb1GdG4nO3LonmV2pE9mPhvdNwLuhEuHgU0pbVrLzWvCWnN7yb4pIpoj9u5z3iYgaA897vzPKP3IGdUYhRd/C/fuazhUGsNA8vSz3wfdISgEzDsMvPAw/el3hcLCaKRfcDEkU54T0vS3iw3WSRV8Yg1bRPP/IdPOXNwBGah/t41w7u8HDFLihQHTFBvDuerNhwBKTNR0o16RRGk2vK9iDL4L6UDoUxzjVMyKveS+8AlV3c1gM4MnEPYIyXXMe2Tm+4+TD5xMbPSVP8CU1wF7rulcRb9yfGkCNL4CnJ7VX0YeAlENfGoYxf1CzAobpSHLQ8yuuFTBYE0520193u+bGW2r8MJNxBw4XKfbSNy+CfiAHvvTWAggsrSz33m6Tl+TyBe+4Mz5lMfYxkd+lRbVyXMSXTmA8mRlPrIA0D31LeLRQIPfFDnsWWsRYFXo6F3tCD6mdJS/wJS3AHfkpanks6DZPuVC7F4gj6xIs7oyWjtapUFBumYuOfFA8hnwWG9RJaO+QG2qU9aN3zgZlEoWDkwFwPOHF5ZLwzTFriT1iC8+FDVquKhR8mC7lJG3RlP8o4x5GgAI/YvSYDbMD4qjfTAQpzJPf08QYoFtLOHe5gdRI9fSJBfbATWxsSd5D2YjUK1rfeJi2M9vSiDq6l6PZ8WnLjzvC5mw8iO4+RJSkkD+fNwRItDYMTDQziV0gLox24DBYHfN7XPnfzwz+N6LkhsiSF5OEYlPjQR0GhrwlFcF9gE6PQ4p0Pv0CaGC1E5p+D4vNAfe7mj2h+LJpfgXA83NlPkhaGfz7Zd7Nb9B1vkYa+xed97XM3n0Tya5H8CCYMDxeb2YnjQaiFuMXad7tZRWfRP5JWS+/5Y9LQv/i8r33u5pc/JQ3tUUkDwClsO5k/rZ5otxWTB2/H2dmdEOqU9z3VZifXEkR1IfQWCSFKRntOwtVZc2XW5KRkOVVRtTNV5xqc5JyrJxPn8XYruXAJ5CVPJ9MJ2bmAvk/r4uX8EgoxLYj1XhIes3xyCctJhuOCfBHwEOpzXOr8VNq+ulhNXIAFwx3kWoWpIQvH6ocQstRfkwZGMC7t9nZDnrPn3YUUt8U5YC+WE9wZsGXIm25vxAXBaWg65p0trK8psE3k+4wyjPBG8zzofMKeAzAhBYJlzbkmzi7PgSlC1a4ugJF0px5OJocM2cC+0Qf0BfcH3yMtjGD8tHnytx0qV7TL7oIu2doFuFHVzl9FSjtvmjdcs125gLSl5/Oq2+zH2Rr6XLmIJz+v3kS7czd3JpJwqVy8jgLAE9DsstsVbIq7oYnAX1y0zYQAsHQVG0ulS7B0pd6PokvoC+7HpIERlOe0TMtwwxlpKm7VHgEsSYUFlKUuadfQ2k1BxoFOn8Lqu+VuB3cGdGEGQMIq1GzV82ugOp4wcJ98a0VGIWGTzrAd1AV37jRpYQRl/WXSUmPq9Gk7gfJA9ZJborLmpxfdTM8rRs/bmmbs+DC1hGWH8ken9mwqiOB2uKvIC4vWClo4eVN3n4fQ7itp14Ndt2Eex3BZWtmHrAvujs4QKhBO4ddDfEBdcNkB7Bbda965SFo8NNG+eMtcTPDafN4Ea/ZmaR8sQRJSKcC6E1HGuizjWeMQSdBSp93MlBuRyiY2XBHyDrYsV03dwIZKPo2fNSx5IXFiy15IItPVE5WbOIZKfusGaGYJx3sTFrR9I1d2jqOnRDxEQTB81m/43M0/nyANjDr7XiEt/YxP5fjcLQAxqtt8DrSz1HNskqMwaK4vizO0BbfLayyMYPyq07kHZrY/2jAz3bzqfeF2hYWFpi2dUWuQ2PXn2kJZcGd/SVoYNPjVUdKyC0OwcGphiLTWGG6oBp7CYV1wg8LW1s6WjnEnc1VnvUfdTqHcDpV4j7QwqHCENGAWHOHC4hZvrsCCsARwXLwGFtgCepRccCq4pm0myV3Kl+xbC8LmslcXMpW4BvOXT9jXk/klC+BMRV/G5hGAE1bi0pTIXZ+/DJBfmtq3dRPmS/vPozhQVMc5XJU8a9/KL7kbN5fnK8MV3BRbwQXa6ZFn3pYZ3hRTuP1sVyh7OPf1UAZ9ftmuV5xxeWu2LN8YnpoTl04tnEkY6rwIxrNbIliXRZTRzaQvG9OV1C2VWxqaOWNdqMDx/ddOgpi/xuEWVhFOPr3mlYHK5RPGDRvkG84cdkEVtDmxCCb3bH46cVlcOOlYuM44IYFxHPQz6aUkiGkk8ZPPlgB9LSSXkosoch2khHyjcrzpIAnoCu6c22TMoM/7v0daEIKKHI8Jz/aLTl6oli/fqrV0wXETNOThklXQlgE5HD4PyfJllAcKTp6bg+03AISdBgpRPIE81snU9dpq3uRAWL4pCjpol+xh97WoS86CKM1JKCaku2cApyS3wQKqOlw2rTnBmHYugZq8WY+zHXQFN/or0sKgRLvxd65owydQSUzakp8tXbyBilRTtaeCJCrKoS/DqRXony5dvIw267iZ68p1cHNRjLGJW1ddLmm6BNpVcxGm0b8Fc8n2ngDtBI5qackLaF6wxQvJaZAdWEFCqz08cxws2DdTcDPFg6Y5e/Zeoiu4/0QaGLS48UPSggrsixUZ9HnOeioeV6dL6mm5VkN4qXwGt5Je5+fdMjovz6rTnHoGoKTO13xa6QT+lFXw+pvAiTNICuoc2OXkiSRcgtmk1zp/y0RRcafy7m6WA6IFz6RZ03Vtt0wvsuv8cUOEigimhI6p1rQRCV8mDX2Ozxpcn7sF4y3SgEC+Z9arnHCrNRpqPWrVHPXajp1aj+b6j8Y1vNyuhqNNjUmLqcHQsi1EPkca+h2fyvG5WzD+CWnwqAkuNlDNUvt/VMkYs3mOtLjcwN08YgRVwe1W4cigwHdCHT8jlr7iXOwmlvWZN/rcLSCh/mqokTdC08OVY1wpkssdJTtye6N65JD5WC73Evp0Ayi59u/UQTZXX8rgEe3o8w9IQyyhKbgfkYYY4azdlV9qWHeH4kSMibj+am3tiQK6N0z22k4gtBl/1MM2LoXAt2OXgbSDZlvqP/z3pCVWrCowXk7KdxQe7LQ59IFrFLbcJmp4XBvFKMOPZiqQXFXSHz6GQ0JVKSh8edx45G5UqooOcnV0Y8JM2KUU+hBvK/x9b8/gnIlxDrINTcGRM3TEj/uQddDnGIfHUHexH48evQs5SLmvmwAUcxtJd7T0VbQiFCA3BpViLfBola+kQC8mwRLvTIIFz3BdPTW9DQYUBfdKzB7Q23DMa6t5sD0o2xhk3FPkOJ7Da6HiJPG4xJkEGDBaxgJzoAKpVSijBcqdA2M1PPFuUCzDne56Zob+YhSgWnBfLd9B0ItF9IiwVrjdbPdAghrecJeKeFz+p4lCYa3CwTA4WaQOuXX8/mDYXyItMYSih/sWaYgVijvy+hGp1NTDykbuyzpay05ryIo7uxJiS+Eb3yRe33/EcIAbt+CJPGkZVX6ylLjTsD0o7+zS2PCiEsMXPcKqfTo4AeOkjQIhvhEX1plogWKWGv8iHDUey0oYBa6upy8baGLXcg8R3teUCK83TtzOBMRnqPxG4naawzve8GImoJelEgPxxJtcc+uU12qV7fkQ9iEW4qKCnuB+lzTEmcaxqDJEc1YP+cUXSUvsoFct8oQ0xIrJSnJVgeqBatK6M56sOPpBmePu5yre5MC5NYVzvDq1DBQzvJUpp1bHHcdYH4dEuZCVJCuSBoWffYy0xA5qgns11hO0H94oZhsnB57U99+Go1lw1ibrkwNnGl5j2WeuuW1Wk+t2YQIgcd+bcTp86GVIvYKa4I7HWnAp3BKMi2i1PkZlKOfAsGCjVhUxxlUPfLgT/O4hJb2qJEqlgxzcUybMHJg+h0vrEneEt1hD7ZZ5RhpixR0BFLdv0Zrt9g5xwLLWpFqDAtpgp4plb3Jg/gCMwtFHhRLaKQWPHZTH3pOFtWQkDg5+GvuBu6gJ7i9IQ7ywlARuhHeOcBYYilKFR4YieDNHYwk+qk4WvIb99Upu06pOohApxZay+mQROTxBsRviCpNfkIYXlk+ThjgQvPZJgWPh9O/dhX9GGigR/Ex0CDUPN1DVcJ1TyJQi7QZ49RXSEjOoCS7S+7yPKHqdfaPivSjfM+5n4tnf3mdG4nM3KoT02yFF2wotD/d3SAMjHF4lDTGDluDcqU4Y4fPD2FeM0CEyl0wVn0ftczc6hPPj4cTaBloejhEV/5g0xAtagvsd0sAIiV/sNrdgPKAluHZD0DLC4P0wOq9HBy3BRTjq4YvOMdIQK2gJLt694WJFLEfW2oaS4OLdGy5efNjprDR9CSXB7ScNjND47t8iLXGCkuDi3RsuZsR6iANKgqMUDaMTYj0yIVNK/Pj2p0hLjKAkuDnSwAiRtjO9xQRKgvsz0sAIkaekIUZQEhwjSlKxrhihQmSdDeji87B97kYP+iOj9TxJXRK3463h87B97kYP+gdAP8ZdoJSlxrzPTNyIcdUvJcHtOScrgzZ/Hd9uv5QEx4iWX8T2sYEJLpa8+TdJS1ygNpgNI0o23yUtcYGSh6sN+8KIiHdi+7bg817vk72ppp6H3ZFwq80THvSGfQ3jztj+brid1Paul8xnfkhaduFAR52xO7uAFK7g3oKTJPDGDKJDAozABxwQWaSZorTVfirLCEh39sMjlkTzpgj7CqaTpCUYByKrX9yNdGceu2OEXqXobdLQFo724YV8BanHTj3CLpGpHwD1CDtEepm0tGNomLQEJWh6O8u66dHj1wllivlpbzEukpZ2OPSvb8ArSP+AGNHwR6QhHjDBxZVb8XwDnwkurrwfzzflmOAYkcIEF1uexHKCaCa42PLeFmmJA0xw8SWWA8czwcWX//EGaYkBTHAxJtRmzZBggosxT2M4fSrrgBljfhK0YbMHMA8XZ35LIi19DxNcnPnxZ0lL38MEF2tGSUPMoV5GSAfs3BKUYeoTN1M/Rd3xVdLQDP3zHTRG5uHijTdD+sBA/fYNen8EZeA8HLxJGpqgf76Dxsg8XMx5do609DesHi7mfL/XLrZLmIeLO3/Y0ds0fQMTXNz57nHS0tcwwcWeP/88aelnmODij/RR0tLHMMHFn+/8NmnpY3wITj2JPmbz9dWFhk3bqKQhNizE8ND/bxcDYi6eVPMtl4xI80KDhfbp8CE4sBunATk+MO+ye1jc9q0UG94/+gpp2o0zxlWtbEyT5mYsAI200cJPPZzhdYqZQfuatgD/819oMG9qoGrzJtq4rCYr6HCnJWOZ2C8W2Bq+p1VLAPnirOAAf5UM0Yd876uT75C29pTRpbk+tTIlQ3IJJ1SDxSrYyKkZAM71/JYAwhXVVnVZw75NuELuHxg/Hm6ZO42H+RJNzRBXkvbvQ31CaFPTxAQAh2+PmOptXgZ+EX1LmqajS6BpTe68b/l6Z4N31aaoWkF/2tKpFErdKagamoD8RELT0DUVNM0CHTQUYspdpo4fwcE1Hd8QMJwf8dancTa7yE2hxTK6W86jb9WMpd7A3AIdFxLweZnCn8l4TDH/7uukpS2Nw69ZTj6fRpJadkfM4/K4KNGQ4a3oedrlN4yfLLXu0JZqa1Zqwbxx2hTxcadrL3b4i7fnzIDknWXd/dx7uMa+4t23jA5y1Qtu6mZureBv61LDFu9iesl2mTeXqD8xgE8PB7cEPO7YDCqDAshw0zQN0K1L2FPXx4e6LMSv7I2QLQ1lLXnvhlnBpedKRyOW9gHf3OroyQGlbVqcwUsCStnMcZw/4RGa59yLWQM/VDgielp9ztOFD/wJDq6gW8EUVXUTNk2UBOeWG5Otqma9jH2lgnPYuGHjGU6uVebBUFUZ6U9VeXwbxYIfOG+QplY0XVWlxC28eMVRVfEmpCScUoNT1frgxysJCV073lQ5O+p3Jqj3RAjamyoonfaHU927ZaeycXeon6IAnEu/QVjon++gMfr0cIx+5J3Su69/ijTGCuq3b9D7IyiderjOoX6KAnL2rcZmB/rnO2iMMX2aZOzGewB/LF77KWnuG5jgBo8/A/jMwe99+ddPfkJu6QP2rmlqO/vErPt5o9GULzWt7k5a7O187cPldpXns5DabPMwqroNit7nrrQ9RX3CxzN/tev5nsVXbGrkgrem6jj9nVzGoFfQh4fjG+YOGgx4u7zPO+VN7K20GPCzPUqY7tOiuLe/CQMfgvOc2/TIEsyllvIlPulWUk8P6dw1yD8dvjiTsOwbkHeMODR7e6AUHU9C/ln64oxsi5fzuN49v5RfgsUqvrvmOL6yAnlTrLetDBL5Su0CJhzsrE/jy7hoWdbznZ0vfFeLLFfzwC1BRTAqbg21VNH4E1BJPQOxqolzUOEamkliQIKDSgIdvGSYi04Fnf8KVOCMoQ0BLHBaVZ6GijRgbx27qKBVcQvWtFSpIjGonCadgU3Talf0oIEfD4ePL7l0TT2FJYVuB3wdZpCXqKLI+JVZQQNcQR0nb5AHwzTxwR+HCzBb1c6cOS/jdu6yDudVEBxYPiN6nRIGh3o76RJcw4sCv4JM0yj9F3Gtd0j+zZ/gamUb0fRmut/CceCc5xY68Esg23ncwBornro9dtDBc0hmpoxV5rjycss4OpeHePQZ6QZ8Fb3nPw90yZIlB7e1QmKzwU4ZP4LzmDZ17wHOzZVx9wOvs5VgLsF0zPombT8vmCgzTeObp9Zq7c6N5kD8UtQ1uBhRQZfRzZhCbAb3Izi3hXFJkrRT85dBTZXdwhpfX7ignuTNuF6fFfWkXDEALMmd4zpRPYPKC6jwIA9i8c0lqdo8Lj3cVE/acgVdRptP1OpKQsHHQ4P+FDOtX4Ir6LFGs7UVeJaAq1IJLWDJaXpJW27sWdX31I7VO/in6ODhpn4Br18wSrjjr1be1Jr6ig0AbmrQU9KSltKWUKkBNEtz0GU0OO0C9OyBb/dqnDpddtEL2hIXlMFvS22G/vkOGqMPD8dg+Ceo4GJfG8+IlqCCYzC6ggmOESlMcIxIYYJjRAoTHCNSmOAYkcIEx4gUJjhGpDDBMSKFCY4RKUxwjEhhgmNEChMcI1KY4BiRwgTHiBQmOEakMMExIoUJjhEpTHCMSGGCY0QKExwjUpjgGJHCBMeIFCY4RqQwwTEihQmOESlRCy7YENiB2XJH4XqBoD+0YMAr+BzBUR7JMkUaosZxR4OlyAHS0F/oAcc6aiHwFdx7QEIRJJoDq3NWz0fc12WqM+46en/Pbmka6QrNAcWCX8Hn6WmY5tCPTtCjpYDk0BQc1996AzwDLGkJQj9cQQaDwWAwGAwGg8FgMBgMBoPBYDAYDAaDwWAwGAxGfPj/tLJScIC+8okAAAAASUVORK5CYII=>