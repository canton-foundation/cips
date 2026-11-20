<pre>
  CIP: TBD
  Layer: Applications
  Title: Token Data Disclosure Standard
  Author: PixelPlex Inc. (Nikita Gerasimenok, Vladislav Demidovich)
  Status: Draft
  Type: Standards Track
  Created: 2026-10-09
  License: CC0-1.0
  Requires: 0056, 0112
</pre>

## Abstract

An admin uses the Token Data Disclosure Standard to put a CIP-0056 instrument on a node that does not already have it. The admin publishes the token at a publication URL. One route there lists the packages written for this token, by name and package id. Another route downloads one package. The node vets each download and submits on its own participant. Transfer and allocation keep going through the CIP-0056 registry routes, on the token's registry URL. The publication and the registry can be on the same server or on different ones. Every route is public.

Each token disclosure has one contract on the ledger that implements a small interface, `TokenDisclosure`. The view holds the CIP-0056 pair `(instrumentAdmin, instrumentId)` and the publication URL. The interface has one choice, `TokenDisclosure_Ping`, that changes nothing. The contract id is the token's id in this API. A node exercises the ping to confirm that the admin created the contract and stands behind that publication URL. The same id is the key for public reads of holdings, holders, activities, and transaction history.

The reference tooling deploys a default token: a complete asset under the token standard, implementing `TokenDisclosure` and both the V1 interfaces of CIP-0056 and the V2 interfaces of CIP-0112. Issuers deploy it as is, or copy it as the starting point for their own token. An admin who already has a token deployed creates one `TokenDisclosure` contract for it and describes the packages, the version, and the migrations under that contract id. Two admins can exchange publication URLs. After both have accepted, each token carries the other's URL, so the publications form a graph anyone can walk. Paths, JSON fields, and status codes are in [token-data-disclosure-http-api.md](token-data-disclosure-http-api.md).

## Copyright

This CIP is licensed under CC0-1.0: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)

## Specification

### Terms

- **Admin.** The instrument admin of a CIP-0056 instrument. Here the admin is also the publisher: it signs the `TokenDisclosure` contract and runs, or has someone run, the publication.
- **CIP-0056 instrument.** Any instrument that implements the token-standard interfaces: the V1 interfaces of CIP-0056, the V2 interfaces of CIP-0112, or both. Nothing in this CIP depends on which.
- **Token disclosure.** One active contract that implements `TokenDisclosure`, together with the publication that serves it.
- **Registry URL.** The URL under which the CIP-0056 registry routes for the instrument are served: `/registry/metadata/v1/...`, `/registry/transfer-instruction/v1/...`, and so on. It is the URL a CIP-0056 wallet is configured with for the admin. The admin may run that registry or another operator may run it.
- **Publication URL.** The URL under which the routes of this CIP are served. The routes are that URL plus `/registry/token-disclosure/v0/...`. The publication URL may be the registry URL, or a different URL the admin chooses.
- **Client.** A node, or the backend in front of a node, that integrates the token.
- **Peer link.** Another admin's publication URL that both admins have agreed to show.
- **Registration check.** The steps a client runs to confirm a `TokenDisclosure` contract on its own participant, ending with `TokenDisclosure_Ping`.

A registry URL and a publication URL are `http` or `https`, with an optional port and an optional path, and with no userinfo, no query, no fragment, and no trailing slash. A path lets one server host several admins, each under its own path.

An admin who does not opt in serves nothing under this CIP, and the instrument remains usable exactly as before. Opt-in is per instrument.

### The `TokenDisclosure` contract

`TokenDisclosure` is the interface every token disclosure implements. It does not move holdings. Its view names the instrument and the publication, and its one choice lets a client check the contract.

```daml
module TokenDisclosure.ApiV0 where

data TokenDisclosureView = TokenDisclosureView with
    instrumentAdmin : Party
    instrumentId : Text
    publicationUrl : Text
  deriving (Eq, Show)

interface TokenDisclosure where
  viewtype TokenDisclosureView

  -- Exists so a client can exercise it and trust that this contract was
  -- created by the instrument admin for the instrument and publication URL
  -- the client passes. The body is defined here, so no implementation can
  -- change it. It creates, archives, and updates nothing.
  nonconsuming choice TokenDisclosure_Ping : ()
    with
      actor : Party
      instrumentAdmin : Party
      instrumentId : Text
      publicationUrl : Text
    controller actor
    do
      assertMsg "instrumentAdmin must match the view"
        ((view this).instrumentAdmin == instrumentAdmin)
      assertMsg "instrumentAdmin must sign the contract"
        (instrumentAdmin `elem` signatory this)
      assertMsg "instrumentId must match the view"
        ((view this).instrumentId == instrumentId)
      assertMsg "publicationUrl must match the view"
        ((view this).publicationUrl == publicationUrl)
      pure ()
```

The package name is `token-disclosure-api-v0`. A forked interface is a different API and is outside this version.

The rules for the contract:

1. The admin MUST keep exactly one active `TokenDisclosure` contract for each token disclosure, with `instrumentAdmin` as a signatory. An instrument has at most one, so it has one API id.
2. `publicationUrl` in the view MUST be the publication URL that serves this token. Moving the publication to another URL means replacing the contract.
3. Replacing the contract creates a new contract id, which is the new API id. The publication stops serving the old id, and the new card carries the same `instrumentId`.
4. CIP-0056 holdings, transfers, allocations, and settlement do not record this contract id, and those flows MUST NOT depend on this contract. The publication still serves holdings, holders, activities, and transaction history under this contract id, to every caller. Admins SHOULD NOT archive the contract: this id is the id of those routes.

### Publisher obligations

An admin who publishes a token disclosure MUST:

1. Serve every route of the HTTP API for that token at the publication URL, to every caller, with no access token.
2. Put on the token card the registry URL where the CIP-0056 registry routes for that instrument are served, and the publication URL.
3. Make sure the registry URL serves the CIP-0056 metadata routes for the instrument, and the CIP-0056 transfer and allocation routes for the flows the token supports, to every caller. The client confirms the admin there with `GET {registryUrl}/registry/metadata/v1/info`, whose `adminId` MUST be `instrumentAdmin`.
4. List the token's packages, version, and migrations as specified below.

The admin does not have to run the registry. A token whose registry another operator runs is published without any change on that registry.

CIP-0056 metadata carries a `supportedApis` map from a token-standard API name to its minor version. The name is the Daml package that defines the API, with the major version in it, for example `splice-api-token-metadata-v1`. When the publication URL is the registry URL, the registry's metadata for the instrument MUST list:

```json
"token-disclosure-api-v0": 0
```

The key tells a client that a publication for the instrument is served at that registry URL. The minor version `0` means the shapes in the HTTP API. A registry MUST NOT list the key for an instrument whose publication is elsewhere. A client MUST NOT read a missing key as "not published", because the publication may live at another URL.

### Packages

The publication lists the packages a node needs for this token that it does not already get from Splice. Splice packages, including the token-standard interface packages of CIP-0056 and CIP-0112, MUST NOT appear in the list. Each entry carries the Daml package name from that package's `daml.yaml` and the Canton package id.

The list MUST include `token-disclosure-api-v0` and the package that defines the template of the token's `TokenDisclosure` contract, both as `current`. For a default token that package is `token-disclosure-default`.

A package is `current`, `planned`, or `deprecated`:

- `current`: the download route serves it now.
- `planned`: a future package id with a date and an optional message. The download route serves it only after it becomes `current`. A planned id that disappears before it becomes `current` is withdrawn. A replacement plan is a new `planned` row.
- `deprecated`: the publisher no longer serves it.

`dependsOn` names package ids from the same list that the client uploads first. The graph MUST be acyclic.

Each download is a DAR that contains that one package and no other. A download MAY redirect. Before the client uses an uploaded package, it MUST confirm that the upload introduced that package id and no other new package id. A published package id does not mean that anyone has audited or vetted the package. The client decides whether to vet it, and SHOULD audit each package it uploads.

### Version and migrations

The publication carries the current version label and what changed in it, and the announcements an integrator has to handle. An announcement says whether action is required, which version it belongs to, when it takes effect, and what to change. A client reads the version and the migrations before it builds against the token and before it calls the CIP-0056 registry for a transfer or an allocation, and again before each later change. A card whose default flag is false means the client reads the migrations before it assumes the free-form argument maps.

Package status says which package id to vet. A migration says what the integrator has to change, by when. The two differ: a new required key in a free-form argument map is not a new package at all, and a token that adds the CIP-0112 V2 interfaces next to V1 announces the date here so V2 wallets know when to switch and V1 wallets know nothing breaks.

### Public reads

The publication serves four reads for every token disclosure, at the publication URL, to every caller, with no access token. The path key is the `TokenDisclosure` contract id.

- `/registry/token-disclosure/v0/tokens/{contractId}/holdings` and any path under it. Holdings of the token.
- `/registry/token-disclosure/v0/tokens/{contractId}/activities`. Activity on the token.
- `/registry/token-disclosure/v0/tokens/{contractId}/holders`. Holders of the token.
- `/registry/token-disclosure/v0/tokens/{contractId}/updates` and any path under it. Transaction history.

The server MUST answer each of them. The body is that token's holdings, holders, activities, or transaction history. A response that is only a message means this token has none of that read. `404` means this publication does not serve that contract id. The message shape is in the HTTP API.

These reads do not move the token. When the token has CIP-0056 flows, transfer and allocation stay on `registryUrl`.

### Registration check

A disclosed `TokenDisclosure` contract from a publication is a claim of that publication's server until the client submits it. A client SHOULD run the registration check before treating the token as the admin's:

1. Read the token card. Continue only when `(instrumentAdmin, instrumentId)` is the instrument the client is integrating, `publicationUrl` is the URL the card came from, and `GET {registryUrl}/registry/metadata/v1/info` returns `instrumentAdmin` as `adminId`.
2. Download `token-disclosure-api-v0` and the package that defines the contract's template, and audit both. The interface holds the view and the ping. The reference template holds three fields and the interface instance.
3. Upload both to the client's own participant, after the one-package check above.
4. Exercise `TokenDisclosure_Ping` against the disclosed contract, as a party hosted on the client's participant. The other arguments are the card's `instrumentAdmin`, the card's `instrumentId`, and the publication URL the card came from. The disclosed-contract blob goes through unchanged.

What a successful exercise establishes:

- The client's participant checks the disclosed contract against its contract id. A contract whose fields or signatories were altered is rejected.
- The `instrumentAdmin` argument is a signatory, so it is an informee of the exercise, and the admin's participant confirms that the contract is active.
- The ping body checks that the view's `instrumentAdmin`, `instrumentId`, and `publicationUrl` equal the arguments.

Success means the admin created this contract, it is active, and its view names the instrument and the publication URL the client passed. A card that disagrees with the view fails the ping. `registryUrl` is not in the view. After the ping succeeds, the client trusts the card served at the publication URL the view names, including that card's `registryUrl`. The metadata `adminId` check in step 1 still has to match `instrumentAdmin`. The check does not confirm the package list, the version label, the migration text, or the peer links. Those remain statements of the publication's server, now bound to the admin through `publicationUrl`.

The ping is a real transaction. The client pays its traffic, the admin's participant sees which party pinged, and the ping fails while the admin's participant is unreachable. A client SHOULD run the check once per contract id and reuse the result. A failed check, including an inactive contract, means the client MUST NOT treat the token as verified.

### Peer exchange

An admin who publishes a token can offer its publication URL to another admin who publishes one. The offer carries the offering admin, its publication URL, and a nonce the initiator generated. The second admin accepts in their own tooling. The return offer carries the second admin's publication URL and echoes the nonce. The initiator treats the echo as the return of its own offer.

The rules:

1. A first offer is stored as pending. It is not shown on token cards, and the receiver MUST NOT call out to the offered URL until its operator accepts. Storing a first offer submits no ledger command.
2. On accept, the receiver runs the registration check on a token from the offered publication. The ping arguments are the offered admin, that card's `instrumentId`, and the offered URL. The card's `instrumentAdmin` MUST be the offered admin, and the card's own publication URL MUST be the offered URL. If the check fails, the offer stays pending and no return is sent.
3. The initiator runs the same check on the return before it answers `active`, and that handling submits `TokenDisclosure_Ping`. A return that does not echo a nonce the initiator sent to that URL does not activate a link.
4. The initiator lists the peer as it answers `active`. The receiver lists the peer when that response arrives. A client follows a peer URL only when both publications list it.
5. There is no public route that lists pending offers and no public accept route.
6. Either admin can drop a link locally. The initiator keeps the listing it wrote with `active` until the receiver has applied that response. After both publications list a peer, a publication MUST stop listing it once the other's active list omits it. Clients skip a publication URL that does not answer.

Every card a publication serves lists its own publication URL and each active peer. A peer URL is another admin's publication. A client uses it for that admin's tokens, never for an instrument whose `instrumentAdmin` is someone else.

Because every publication lists its active peers, the links form a graph. A client that starts from one publication URL can read its peers, open each of them, read their peers, and so on, until it has reached every publication connected to the first one. No central list is involved. Each admin serves only its own links, and each link is there because both admins accepted it and checked each other on the ledger. The client remembers the URLs it has visited, so a cycle ends the walk. Reaching a publication through the graph does not verify its tokens. The client still runs the registration check on each token it uses.

### Default token

The reference template implements `TokenDisclosure` and nothing else:

```daml
module TokenDisclosure.Default where

import TokenDisclosure.ApiV0

template DefaultTokenDisclosure
  with
    instrumentAdmin : Party
    instrumentId : Text
    publicationUrl : Text
  where
    signatory instrumentAdmin

    interface instance TokenDisclosure for DefaultTokenDisclosure where
      view = TokenDisclosureView with
        instrumentAdmin
        instrumentId
        publicationUrl
```

The package name is `token-disclosure-default`. It has three fields, one signatory, and no choices of its own. Any admin can use it for its `TokenDisclosure` contract, including for a token it deployed earlier.

The default token is a `DefaultTokenDisclosure` contract plus the holding, transfer, and allocation factories of a fungible instrument, from the same package. The holdings and factories implement both the V1 interfaces of CIP-0056 and the V2 interfaces of CIP-0112, as CIP-0112 recommends for assets, so a wallet on either version can use the token. Following CIP-0112, the V1 `Allocation` interface is implemented only on allocations that settle through the V1 flow. The reference factories MUST NOT require extra keys in the free-form argument maps. A default token is served with its registry and its publication at the same URL.

The default token is a complete asset under the token standard: it implements every API that CIP-0056 and CIP-0112 expect an asset to implement, on the ledger and on the registry routes, with issuance and burning by the admin. It is also meant as a starting point. An issuer who needs its own rules can copy the package, change it, and publish the result as a custom token, keeping the parts it does not change.

A custom token MAY require extra keys. It sets the card's default flag to false and announces the keys in migrations.

### Reference tooling

This section is informative. The reference tooling is one way to meet the obligations above. It:

1. Serves the routes of this CIP at the publication URL.
2. Distributes the token's packages on the package routes.
3. Deploys the default token when the operator asks: uploads `token-disclosure-api-v0` and `token-disclosure-default`, creates `DefaultTokenDisclosure` and the factories signed by the admin, serves the CIP-0056 registry routes for it at the same URL, and lists `"token-disclosure-api-v0": 0` in its `supportedApis` next to the V1 and V2 entries.
4. Publishes an existing token when the operator asks: creates its `TokenDisclosure` contract and serves the routes, leaving the existing registry as it is.
5. Runs peer exchange, with the accept as an operator action.

Together with `token-disclosure-default`, the reference tooling is a full token-standard implementation an issuer can start from: the Daml package, the registry that serves it, and tests that exercise each CIP-0056 and CIP-0112 flow against it.

Hosting, language, process layout, rate limits, and where offers are stored are up to the implementation.

### HTTP API

Paths, JSON fields, status codes, and errors are in [token-data-disclosure-http-api.md](token-data-disclosure-http-api.md), the HTTP API for version 0 of this CIP. If the two disagree, this CIP decides the meaning and the HTTP API decides the JSON shape. A breaking change to either document is a new major version of both, and a new `token-disclosure-api-vN` package. The path key is the `TokenDisclosure` contract id, percent-encoded as one path segment.

### Non-goals

This CIP defines no new token operations and no new factory interfaces. Transfer, allocation, and settlement stay as CIP-0056 and CIP-0112 define them. The default token implements those existing interfaces.

Access tokens and login are out of scope. Holdings, holders, activities, and transaction history are public reads of this CIP.

There is no network-wide directory. Community lists of registries stay outside this CIP.

Splice packages are assumed to be on the node already. A node missing them cannot finish an install from a publication.

## Motivation

A Canton token stays unusable on a node outside the admin's until that node has the packages written for the token and knows where the token's registry is. CIP-0056 says how to hold, transfer, allocate, and settle an instrument once a client knows its registry. The packages written only for this token, and the registry URL, still arrive by personal message. Wallets keep the map from an admin party to a registry URL by hand.

An admin can write the contracts and still have no standard place for an outside node to fetch those packages. For each new token the node has to ask again. Applications end up supporting few tokens.

Many tokens are served by a registry the admin does not run. Their admins still need a way to publish what a node has to install, without asking the registry's operator to change anything.

A default token is a deployment for an issuer whose rules already fit the token standard, and it works with V1 and V2 wallets from the first day. An issuer whose rules differ starts from the same package and its tests instead of from nothing. Peer exchange lets admins link their publications, so the next person can find one from the other.

## Rationale

### Registry routes stay CIP-0056

A node cannot derive the factory contract id, the choice context, or the disclosed contracts from the package bytes. The CIP-0056 registry routes already return them, so this CIP leaves those routes and their JSON to CIP-0056. The token's own package bytes sit outside CIP-0056, so this CIP serves them.

### Publication URL separate from the registry URL

A registry is often run by an operator who serves many admins. If the routes of this CIP had to sit on the registry URL, every such admin would need its operator to add them first. With a separate publication URL, any admin publishes on its own, and the registry stays as it is. When the admin runs both, as the default token does, the two URLs are the same and `supportedApis` points at the publication.

Separating the URLs needs another binding between a publication and its admin. Before, the registry's `adminId` gave it. Now the admin signs `publicationUrl` into the `TokenDisclosure` contract, and the ping proves it. A mirror that copies a real contract cannot claim a different publication URL.

### Named like the CIP-0056 APIs

The `supportedApis` key, the interface package, and the path segment follow the Splice token-standard APIs: `splice-api-token-metadata-v1` is a package name, a `supportedApis` key, and `/registry/metadata/v1`. This API is `token-disclosure-api-v0`, the same key, and `/registry/token-disclosure/v0`. A client that already reads `supportedApis` needs no new rule, and the name does not change when this CIP receives a number. The term "admin" and the field `adminId` are the CIP-0056 ones.

### Separate routes, not new metadata fields

The CIP-0056 metadata API has grown by adding fields, for example the pause status in CIP-0112. Package bytes and a disclosed contract do not fit into an instrument description, so they need routes of their own in any case. Keeping them under their own segment lets the metadata API keep evolving with CIP-0056 and CIP-0112, and lets this API evolve without touching it.

### Two package routes

A node vets package ids one at a time. A list of CDN URLs would skip that, and so would one DAR that mixes packages. The list route names each package the token adds. The download route returns one package, the unit the node uploads and audits. A validate route that asks the same server whether a hash is in the list was rejected: the package id is already the hash.

### One contract per token, ping in the interface

The token's id, its CIP-0056 pair, its publication URL, and the check that the admin created it are one contract. The ping sits on the interface, so its body is the same for every implementation, and the signatory check and the view comparisons inside it do not depend on how a custom template is written. The reference template is three fields and an interface instance, which takes minutes to audit. The ping goes through the admin's participant, so it also confirms that the contract is still active.

Transfer choices stay on the CIP-0056 and CIP-0112 interfaces. A parallel set on `TokenDisclosure` would split wallets. `TokenDisclosure` carries an identity and a check and no token operations, so it does not compete with interfaces that define operations, such as the one planned by CIP-0086. Middleware of that kind can use the package routes to install a token and the ping to check it.

### Default token

The default factories require no extra keys, so a client written against CIP-0056 or CIP-0112 can use them without a private appendix. CIP-0112 ships `TestTokenV2`, a reference implementation built to exercise every V2 workflow in testing. The default token has a different job: it is a complete fungible asset an issuer runs in production, deployed by the reference tooling in one step, and the code an issuer copies to start a custom token.

### Public reads

The `TokenDisclosure` contract id is how a client names the token in this API. Holdings, holders, activities, and transaction history are public routes under that id. An optional access token was rejected: each publisher would have invented its own gate, and a client could not write one integration. The routes do not submit a transfer. When the token has CIP-0056 flows, those stay on `registryUrl`, and those contracts still do not store this contract id.

### Mutual exchange

A public directory of registries is a different problem. What admins need is smaller: one has published a token, another has too, and each agrees to point at the other. A one-way list would put a URL on a token whose admin never agreed to it. Both accepts, the echoed nonce, and both registration checks come before either listing. The initiator writes its listing as it answers `active`. The receiver writes its listing when that answer arrives. A client follows the URL only when both publications list it. The receiver does not serve pending offers, so a third party does not learn the nonce. Accept stays off the public surface, so receiving an offer is not agreeing to it. The links still add up to a graph that reaches every connected publication, with no one keeping a central list.

### Alternatives considered

- Keying the API by `instrumentId` alone was rejected. Publishing an existing token needs a handle for that act; the `TokenDisclosure` contract is that handle.
- A separate registration contract beside the instrument was rejected. It gave one token two contract ids and two templates to audit.
- Requiring the publication on the registry URL was rejected. Admins whose registry is run by an operator could not publish on their own.
- Serving holdings and history behind an optional access token was rejected. The four reads are public, under the `TokenDisclosure` contract id. A message response means the token has none of that read.
- Putting Splice and the token-standard packages on the download route was rejected. The route would become a mirror of the SDK.
- An off-ledger signed list of every registry was rejected. Peer exchange has two admins and an on-ledger check; a global list does not.
- Standardizing every free-form argument map was rejected for custom tokens. Tokens differ there on purpose, and migrations announce the differences.

## Examples

The parties below are placeholders. They are not tokens on the network.

The admin `example-issuer::1220abcd` has a token `EXAMPLE` whose registry an operator runs at `https://registry.example/api/token-standard/v0/registrars/example-issuer::1220abcd`. The admin publishes it on its own server at `https://example-issuer.example`. It creates a `DefaultTokenDisclosure` contract with `instrumentId` `EXAMPLE` and that publication URL. Its contract id, `00example-token-cid`, is the API id. Clients request `https://example-issuer.example/registry/token-disclosure/v0/tokens/00example-token-cid`. The card carries the pair `(example-issuer::1220abcd, EXAMPLE)` and the operator's registry URL. The registry is not changed. The token's own factories need an extra key, so the card's default flag is false and the key is announced in migrations.

A wallet node given that publication URL reads the card and checks that the registry's `adminId` is `example-issuer::1220abcd`. It downloads each current package and vets `token-disclosure-api-v0` before `token-disclosure-default`. It exercises `TokenDisclosure_Ping` as `wallet-backend::1220ffff`, passing `example-issuer::1220abcd`, `EXAMPLE`, and `https://example-issuer.example`. The admin's participant confirms. It reads the version and the migrations. When a user sends `EXAMPLE`, the node calls the transfer-factory route on the registry URL and submits `TransferFactory_Transfer` on its own participant with the context and disclosed contracts that route returned.

Another admin, `shop::1220eeee`, deploys the default token `SHOP` with the reference tooling at `https://shop.example`, which is both its registry URL and its publication URL. The first admin offers `https://example-issuer.example` to the shop with a nonce. The shop's operator accepts. The shop's tooling checks the `EXAMPLE` contract and sends `https://shop.example` back, echoing the nonce. The first admin's tooling checks the `SHOP` contract, sees its own nonce, lists `https://shop.example`, and answers `active`. The shop lists `https://example-issuer.example` when that answer arrives. Both cards then list both publication URLs. The wallet still sends `EXAMPLE` through the operator's registry and `SHOP` through `https://shop.example`.

## Backwards compatibility

The standard is additive and opt-in per instrument. Existing instrument identifiers, packages, and registry routes are unchanged, and a registry needs no change for its tokens to be published elsewhere. Clients that never read the new routes are unaffected. Clients that do not recognize `token-disclosure-api-v0` in `supportedApis` ignore it.

This draft replaces the unpublished Public Token Standard draft for this work. The `supportedApis` key, the path prefix, and the package routes differ. A server built to that draft does not satisfy this one. Nothing that draft deployed is on a public network as a Final CIP.

Changing the meaning of the package list, the registration check, or the rule that a peer link requires both accepts is a breaking change.

## Reference implementation

PixelPlex maintains the reference implementation: the reference tooling, the packages `token-disclosure-api-v0` and `token-disclosure-default`, and a token test kit that runs each CIP-0056 and CIP-0112 flow against the default token or a token built from it. They are not part of this text and are required before this CIP can move to Final. They match Specification and [token-data-disclosure-http-api.md](token-data-disclosure-http-api.md). Another implementation satisfies this CIP when it serves the same routes with the same behavior. A conformance test suite, published with the reference implementation, checks that against a running server.
