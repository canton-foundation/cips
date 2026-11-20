# Token Data Disclosure Standard HTTP API

This document is the HTTP specification for version 0 of the Token Data Disclosure Standard. The CIP states what the publisher owes and what each check means. This document states the paths, fields, status codes, and errors. If the two disagree, the CIP decides the meaning and this document decides the JSON shape. A breaking change to either document is a new major version of both, and a new `token-disclosure-api-vN` package.

The terms admin, registry URL, publication URL, peer link, and registration check are defined in the CIP, under Terms.

## Where the routes live

Every path in this document is relative to the publication URL. The routes use their own path segment, `/registry/token-disclosure/v0`. They do not change or reuse any other path under `/registry`, so a server can add them next to CIP-0056 routes and next to any other routes it already serves.

The publication URL may be the registry URL, or a different URL the admin runs:

| Setup | Registry URL | Publication URL |
| --- | --- | --- |
| Admin runs both, as with a default token | `https://shop.example` | `https://shop.example` |
| An operator runs the registry, the admin publishes on its own | `https://registry.example/api/token-standard/v0/registrars/example-issuer::1220abcd` | `https://example-issuer.example` |

A full catalog URL in the second setup is:

```text
https://example-issuer.example/registry/token-disclosure/v0/tokens
```

Transfer and allocation always go to the CIP-0056 routes on the card's `registryUrl`.

## Calls in the order a client makes them

The examples follow the admin `example-issuer::1220abcd`, the instrument `EXAMPLE`, and its `TokenDisclosure` contract `00example-token-cid`. These are placeholders, not a live token. A client starts from a publication URL someone gave it, or one it read from a token card. Its participant already has the Splice packages.

1. Catalog. Learn which tokens this publication serves, and take `contractId`.
2. One token. Read `instrumentId`, `instrumentAdmin`, `registryUrl`, the default flag, and `publicationUrls`.
3. Admin. `GET {registryUrl}/registry/metadata/v1/info` and confirm `adminId` is `instrumentAdmin`.
4. Package list. Read the name and package id of each package this token adds.
5. Package download. Download each `current` package and upload it on the client's own participant.
6. Registration. Take the disclosed `TokenDisclosure` contract and run the registration check.
7. Version and migrations. Read them before building against the token and before the registry calls below, and again before each later change. When `default` is false, read the migrations before assuming the argument maps.
8. CIP-0056 registry. For a transfer or an allocation, call the CIP-0056 routes on `registryUrl`, and submit on the client's own participant.

Peer offers are not on this path. The admin's tooling sends them. Holdings, holders, activities, and transaction history are further public reads under the same `{contractId}`. They are not steps in the order above.

## Conventions

- Bodies are JSON, `Content-Type: application/json`, except the package download, which is the DAR bytes.
- Every route is public. This API defines no access token, and sending one does not change a response.
- GET calls only read. A first `POST .../peers/offers` stores the offer and submits no ledger command. A return runs the registration check, including `TokenDisclosure_Ping`, before the server answers `active` or `400`.
- This API never prepares, executes, or submits the end user's transaction.
- Clients ignore unknown JSON fields, so fields can be added later.
- A missing required field is a failed response. Do not fill it in from a previous call.

### Errors

| Status | When | Body |
| --- | --- | --- |
| 200 | The call succeeded | The resource body, or the DAR bytes |
| 400 | The body is not JSON, a required field is missing or has the wrong JSON type, or a peer offer is refused | `{ "error": "<message>" }` |
| 404 | This publication does not serve `{contractId}`, or the package id is not a `current` package of that token | `{ "error": "<message>" }` |
| 409 | A peer offer names an admin this publication already lists with a different publication URL | `{ "error": "<message>" }` |
| 429 | The server is limiting requests from this caller. Retry later, after `Retry-After` when it is present | `{ "error": "<message>" }` |
| 500 | Unexpected failure on the server | `{ "error": "<message>" }` |

There is no `403`. A token the publication does not serve is absent.

`404` on a token route means the catalog does not list `{contractId}`. While the catalog lists it, the token route, the registration route, and the holdings, activities, holders, and updates routes return it, even after the contract is archived. The failure then shows up on the client's participant when the ping is exercised. After the admin replaces the contract, the old `{contractId}` is `404` and the catalog lists the new one with the same `instrumentId`.

## Catalog

`GET /registry/token-disclosure/v0/tokens`

The tokens this publication serves.

### Query

| Name | Required | Meaning |
| --- | --- | --- |
| `pageSize` | no | Maximum number of cards in this page. The server may return fewer. |
| `pageToken` | no | The `nextPageToken` from the previous page. Omit it on the first page. |

### Response

```json
{
  "tokens": [
    {
      "contractId": "00example-token-cid",
      "instrumentId": "EXAMPLE",
      "instrumentAdmin": "example-issuer::1220abcd",
      "registryUrl": "https://registry.example/api/token-standard/v0/registrars/example-issuer::1220abcd",
      "implementation": {
        "interfaceId": "ccc333:TokenDisclosure.ApiV0:TokenDisclosure",
        "interfacePackageId": "ccc333",
        "default": false
      },
      "publicationUrls": [
        {
          "adminId": "example-issuer::1220abcd",
          "publicationUrl": "https://example-issuer.example",
          "relation": "self"
        },
        {
          "adminId": "shop::1220eeee",
          "publicationUrl": "https://shop.example",
          "relation": "peer"
        }
      ]
    }
  ],
  "nextPageToken": null
}
```

| Field | Meaning |
| --- | --- |
| `tokens` | Cards on this page. May be empty. |
| `tokens[].contractId` | Id of the token's `TokenDisclosure` contract. This is `{contractId}` for every other route. |
| `tokens[].instrumentId` | From the contract's view. With `instrumentAdmin`, the CIP-0056 pair. |
| `tokens[].instrumentAdmin` | From the contract's view. The admin. |
| `tokens[].registryUrl` | Where the CIP-0056 registry routes for this instrument are served. Its metadata `adminId` is `instrumentAdmin`. |
| `tokens[].implementation.interfaceId` | Interface id of `TokenDisclosure`, as `<package-id>:<module>:<interface name>`. |
| `tokens[].implementation.interfacePackageId` | Package id of `token-disclosure-api-v0`. Equals the package-id segment of `interfaceId`, and appears on the package list. |
| `tokens[].implementation.default` | `true` when the token is the reference default token: a `DefaultTokenDisclosure` contract with the reference factories, which require no extra keys. `false` otherwise. |
| `tokens[].publicationUrls` | This publication and its active peers. |
| `tokens[].publicationUrls[].adminId` | The admin of that publication. |
| `tokens[].publicationUrls[].publicationUrl` | That publication's URL. |
| `tokens[].publicationUrls[].relation` | `self` for this publication, `peer` for an active peer link. |
| `nextPageToken` | Pass as `pageToken` for the next page. `null` on the last page. |

The order of cards is not significant. The catalog lists at most one card per `instrumentId`. A client that sees two MUST NOT pick one.

`publicationUrls` has exactly one `self` entry. Its `publicationUrl` is the URL that served this response and equals `publicationUrl` in the contract's view. Its `adminId` is `instrumentAdmin`. The `peer` entries are the same on every card of this publication and the same set as `GET /registry/token-disclosure/v0/peers`.

### One token

`GET /registry/token-disclosure/v0/tokens/{contractId}`

The same card without the `tokens` wrapper.

```json
{
  "contractId": "00example-token-cid",
  "instrumentId": "EXAMPLE",
  "instrumentAdmin": "example-issuer::1220abcd",
  "registryUrl": "https://registry.example/api/token-standard/v0/registrars/example-issuer::1220abcd",
  "implementation": {
    "interfaceId": "ccc333:TokenDisclosure.ApiV0:TokenDisclosure",
    "interfacePackageId": "ccc333",
    "default": false
  },
  "publicationUrls": [
    {
      "adminId": "example-issuer::1220abcd",
      "publicationUrl": "https://example-issuer.example",
      "relation": "self"
    }
  ]
}
```

This card has no peer yet. The catalog example is the same token after an exchange.

When `default` is `true`, a client written for CIP-0056 or CIP-0112 can call the registry routes as they are. When it is `false`, the client reads migrations before it assumes the argument maps.

## Registration

`GET /registry/token-disclosure/v0/tokens/{contractId}/registration`

The token's `TokenDisclosure` contract as a disclosed contract, and the package that defines its template.

```json
{
  "contractId": "00example-token-cid",
  "templateId": "bbb222:TokenDisclosure.Default:DefaultTokenDisclosure",
  "createdEventBlob": "<base64>",
  "synchronizerId": "global-domain::1220sync",
  "packageId": "bbb222"
}
```

| Field | Meaning |
| --- | --- |
| `contractId` | Same as on the card. |
| `templateId` | Template of the contract, as `<package-id>:<module>:<template name>`. The package-id segment equals `packageId`. |
| `createdEventBlob` | Base64 disclosed-contract blob. Pass it through on the exercise unchanged. |
| `synchronizerId` | Synchronizer the contract is assigned to. The client submits the exercise there. |
| `packageId` | Package that defines the template. It is a `current` row on the package list. |

The registration check is specified in the CIP. The exercise names the interface in the command and the template in the disclosed contract. `actor` is a party hosted on the client's participant. `instrumentAdmin` and `instrumentId` are the card's pair. `publicationUrl` is the `self` publication URL. The blob from this route goes through unchanged:

```json
{
  "commands": [
    {
      "ExerciseCommand": {
        "templateId": "ccc333:TokenDisclosure.ApiV0:TokenDisclosure",
        "contractId": "00example-token-cid",
        "choice": "TokenDisclosure_Ping",
        "choiceArgument": {
          "actor": "wallet-backend::1220ffff",
          "instrumentAdmin": "example-issuer::1220abcd",
          "instrumentId": "EXAMPLE",
          "publicationUrl": "https://example-issuer.example"
        }
      }
    }
  ],
  "disclosedContracts": [
    {
      "templateId": "bbb222:TokenDisclosure.Default:DefaultTokenDisclosure",
      "contractId": "00example-token-cid",
      "createdEventBlob": "<base64>",
      "synchronizerId": "global-domain::1220sync"
    }
  ]
}
```

## Holdings and history

These reads are public. They use the same `{contractId}` as the other token routes. They exist for every token this publication serves, whether or not that token implements CIP-0056. Sending an access token does not change the response. There is no `403`.

| Path | Read |
| --- | --- |
| `/registry/token-disclosure/v0/tokens/{contractId}/holdings` and any path under it | Holdings of the token |
| `/registry/token-disclosure/v0/tokens/{contractId}/activities` | Activity on the token |
| `/registry/token-disclosure/v0/tokens/{contractId}/holders` | Holders of the token |
| `/registry/token-disclosure/v0/tokens/{contractId}/updates` and any path under it | Transaction history |

The server MUST answer each route. A missing route means the server does not implement the read. `404` means this publication does not serve `{contractId}`.

When the token has values for that read, the body is those values. When it has none, the status is `200` and the body is only a message:

```json
{ "message": "no holdings" }
```

| Field | Meaning |
| --- | --- |
| `message` | Non-empty text. This token has no holdings, no holders, no activity, or no transaction history, for the route that returned it. |

That message is not an error. The sample text is not required. Clients ignore unknown fields.

CIP-0056 transfer and allocation stay on `registryUrl`. These routes do not prepare or submit them.

## Packages

These are the packages this token adds. Splice packages stay off the list.

### Package list

`GET /registry/token-disclosure/v0/tokens/{contractId}/packages`

```json
{
  "packages": [
    {
      "name": "token-disclosure-api-v0",
      "packageId": "ccc333",
      "status": "current",
      "dependsOn": []
    },
    {
      "name": "token-disclosure-default",
      "packageId": "bbb222",
      "status": "current",
      "dependsOn": ["ccc333"]
    },
    {
      "name": "example-token",
      "packageId": "eee555",
      "status": "current",
      "dependsOn": []
    },
    {
      "name": "example-token",
      "packageId": "fff666",
      "status": "planned",
      "dependsOn": [],
      "effectiveAt": "2026-11-01T00:00:00Z",
      "message": "served from this date"
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `name` | Daml package name from that package's `daml.yaml`. Required. Non-empty. Two rows may share a name. |
| `packageId` | Canton package id. Required. |
| `status` | `current`, `planned`, or `deprecated`. Required. A client ignores any other value and does not upload on the strength of that row. |
| `dependsOn` | Package ids from this list to upload first. Required. May be empty. Never contains `packageId` itself or an id absent from the list. |
| `effectiveAt` | RFC 3339 UTC. Required for `planned`, optional for `deprecated`, omitted for `current`. |
| `message` | Optional text for `planned` and `deprecated`. Omitted for `current`. |

`interfacePackageId` on the card equals the `packageId` of the `current` row named `token-disclosure-api-v0`. The registration route's `packageId` equals the `packageId` of a `current` row.

### Package download

`GET /registry/token-disclosure/v0/tokens/{contractId}/packages/{packageId}`

The DAR of that one package, `Content-Type: application/octet-stream`. The server MAY redirect, and the bytes after the redirect are the same DAR. `200` only for a `current` row; `404` for an id that is absent, `planned`, or `deprecated`. A `current` row whose download fails is a broken publication.

The bytes for a package id never change, so a server or CDN can cache them indefinitely. A client that has already vetted `{packageId}` MAY skip the download.

## Peers

### Active peers

`GET /registry/token-disclosure/v0/peers`

The peer links this publication currently shows. An empty array means none.

```json
{
  "peers": [
    {
      "adminId": "shop::1220eeee",
      "publicationUrl": "https://shop.example"
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `adminId` | The peer's admin. |
| `publicationUrl` | The peer's publication URL. |

The set matches the `peer` entries on this publication's cards. The order is not significant. This is the route a client reads to walk the graph of publications.

### Offer

`POST /registry/token-disclosure/v0/peers/offers`

The caller is the other admin's tooling. The body is the caller's own `adminId` and `publicationUrl`. The request goes to the publication being asked.

| Field | Meaning |
| --- | --- |
| `adminId` | Required. The caller's admin. |
| `publicationUrl` | Required. The caller's publication URL. |
| `nonce` | Required on a first offer. Non-empty string the initiator generated. The receiver stores it and never serves it back. |
| `inReplyTo` | Required on a return, omitted on a first offer. The `nonce` of the offer being accepted. |

First offer, from `example-issuer` to the shop:

```text
POST https://shop.example/registry/token-disclosure/v0/peers/offers
```

```json
{
  "adminId": "example-issuer::1220abcd",
  "publicationUrl": "https://example-issuer.example",
  "nonce": "n-8f3a"
}
```

```json
{
  "status": "pending"
}
```

After the shop's operator accepts and the shop's tooling has run the registration check on `EXAMPLE`, the return goes to the offered publication URL:

```text
POST https://example-issuer.example/registry/token-disclosure/v0/peers/offers
```

```json
{
  "adminId": "shop::1220eeee",
  "publicationUrl": "https://shop.example",
  "inReplyTo": "n-8f3a"
}
```

```json
{
  "status": "active"
}
```

| `status` | When |
| --- | --- |
| `pending` | A first offer was stored. The server did not call the offered URL. A repeated first offer with the same nonce returns `pending` again. |
| `active` | A return whose `inReplyTo` matches a nonce this server sent to that `publicationUrl`, and whose registration check succeeded. This server lists the link as it answers. The caller lists the link when it receives `active`. |

`400` when the body is malformed, when `inReplyTo` does not match a nonce this server sent to that `publicationUrl`, or when the check on a return fails. `409` when this server already lists a peer for `adminId` with a different `publicationUrl`. A return is `active` or an error, never `pending`.

The initiator keys the nonce by the publication URL it sent the first offer to, which is the `publicationUrl` in the return.

When the operator accepts a pending offer, the tooling, using the stored `adminId` and `publicationUrl`:

1. Reads `GET {publicationUrl}/registry/token-disclosure/v0/tokens` and takes a card whose `instrumentAdmin` is `adminId` and whose `self` entry is `publicationUrl`.
2. Runs the registration check on that card. The ping arguments are the card's `instrumentAdmin`, the card's `instrumentId`, and the offered `publicationUrl`. `instrumentAdmin` MUST be the stored `adminId`, and the card's `self` URL MUST be that `publicationUrl`. On failure the offer stays pending and nothing is sent.
3. POSTs the return to `{publicationUrl}/registry/token-disclosure/v0/peers/offers` with its own `adminId`, its own `publicationUrl`, and `inReplyTo`.
4. Lists the peer when that call returns `active`. The answering publication has already listed it.

Dropping a link is an operator action. There is no public withdraw route. The initiator keeps the listing it wrote with `active` until the caller has applied that response. After both publications list the peer, the other side drops the link when it next observes that it is gone from this publication's peers.

## Version

`GET /registry/token-disclosure/v0/tokens/{contractId}/version`

```json
{
  "version": "1.0.0",
  "description": "initial publication"
}
```

| Field | Meaning |
| --- | --- |
| `version` | Non-empty label. Text, not a number: clients MUST NOT parse it to order versions. |
| `description` | Non-empty text. What changed in this label, written for an integrator. |

Both fields are always present, including on a default token.

## Migrations

`GET /registry/token-disclosure/v0/tokens/{contractId}/migrations`

The announcements still in force, in one response. An empty array means nothing is outstanding. This example is `EXAMPLE`, a custom token:

```json
{
  "migrations": [
    {
      "requiresAction": true,
      "targetVersion": "1.1.0",
      "effectiveAt": "2026-11-01T00:00:00Z",
      "description": "settlementRef becomes mandatory; unset values will be rejected after this date"
    },
    {
      "requiresAction": false,
      "targetVersion": "1.2.0",
      "effectiveAt": "2026-12-01T00:00:00Z",
      "description": "transfer and allocation factories also implement the CIP-0112 V2 interfaces; V1 calls keep working"
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `requiresAction` | `true`: a client that keeps the old behavior will be rejected after `effectiveAt`. `false`: informational, the old call still works. |
| `targetVersion` | The label the publisher intends to serve from `effectiveAt`. Compare to `version` only as text. |
| `effectiveAt` | RFC 3339 UTC. When the announcement takes effect. |
| `description` | What the integrator changes. |

Every field is required. The array is not a history log: the publisher removes a row when it no longer needs to be read, and a client treats a row that disappeared as withdrawn. A client acts on a row whether or not `effectiveAt` has passed. The client polls; there is no push.
