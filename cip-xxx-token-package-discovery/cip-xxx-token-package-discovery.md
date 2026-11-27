<pre>
  CIP: TBD
  Layer: Applications
  Title: Token Package Discovery
  Author: PixelPlex Inc. (Nikita Gerasimenok, Uladzislaŭ Dzemidovich, Eugene Birski)
  Status: Draft
  Type: Standards Track
  Created: 2026-10-09
  License: CC0-1.0
  Requires: 0056, 0112, Canton Network Credentials (https://github.com/canton-foundation/cips/pull/204)
</pre>

## Abstract

This CIP defines claim properties that list the Daml packages of a token in the Canton Credential Registry. The instrument admin publishes them in a self-published credential. The credential also gives a download URL for each DAR that contains those packages, and may link to upgrade notes. Clients look the claims up by instrument, check each download against its package id, and leave each vetting decision to the node operator. This CIP adds no new Daml interface and no new API.

## Copyright

This CIP is licensed under CC0-1.0: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)

## Specification

This CIP uses credential, claim, subject, Credential Lookup API, and Canton Credential Registry as defined in the [Canton Network Credentials CIP](https://github.com/canton-foundation/cips/pull/204). It is final only once that CIP is published in a Splice release. The first Splice release that contains the Canton Credential Registry is the minimum version for publishers and clients.

An instrument is a token on CIP-0056, CIP-0112, or both. It is identified by its admin party `instrumentAdmin` and its instrument id text `instrumentId`, which CIP-0056 and CIP-0112 hold in `InstrumentId.id`. Token packages are the packages a node needs to use the instrument's active contracts, including older versions that those contracts still use. Packages of a Daml SDK or Splice release are not token packages.

A client is any wallet, exchange, custody backend, explorer, or application backend that integrates the instrument.

### Claims

The admin publishes the claims using a self-published credential (issuer = holder = `instrumentAdmin`) in the Canton Credential Registry. The Canton Credential Registry creates a credential only with the authorization of its issuer and its holder, so only `instrumentAdmin` can publish these claims. A client MUST ignore claims whose issuer or holder is not `instrumentAdmin`. `cip-xxxx` stands for the number this CIP receives.

| Property | Value | Required |
| --- | --- | --- |
| `cip-xxxx/token-packages` | Comma-separated package ids of the token packages | MUST |
| `cip-xxxx/dar-<mainPackageId>` | `https` URL of the DAR whose main package is `<mainPackageId>` | MUST, one per DAR. The DARs together contain all listed packages |
| `cip-xxxx/upgrade-notes-url` | `https` URL of notes for integrators about the changes this credential introduces | MAY |

The package list follows the comma-separated form of `cip-tbd/credential-registry-urls` in the Credentials CIP, without spaces. A package id is the 64-character lowercase hexadecimal Canton package id. A DAR contains its main package and that package's dependencies, so there is one `cip-xxxx/dar-<mainPackageId>` claim per DAR, not per package. The main package of each DAR MUST be a listed package. DARs with the same main package id are interchangeable, so the admin publishes one of them.

A DAR URL MUST be served to every caller without an access token and MAY redirect. DARs MAY be hosted on different hosts, including the `https` download of a package registry.

The Credentials CIP limits a claim value to 2047 characters and a credential to 32 claims. One subject therefore lists at most 31 token packages in at most 30 DARs, or 31 DARs without `cip-xxxx/upgrade-notes-url`. The list holds only the packages that active contracts of the instrument use and the packages that the credential introduces. The admin SHOULD remove a package once no active contract uses it. An instrument that needs more than 31 token packages cannot use this version of the CIP.

### Subject

The claim subject is `instrumentId`. Each UTF-8 byte outside the subject character set of the Credentials CIP, and every `%`, is written as `%` followed by two uppercase hexadecimal digits. The encoded subject MUST be at most 255 characters. An `instrumentId` equal to the admin party id is published with the subject unset.

An admin whose instruments all need the same token packages MAY publish the claims once with the subject unset. At any point in time, an effective credential with subject `instrumentId` takes precedence over an effective credential with the subject unset. A client never combines claims from both.

### Publication rules

1. The admin publishes all claims of one subject in one credential per validity period. A credential carries claims of one subject only.
2. Each time, the admin replaces all credentials of a subject in one `CredentialFactory_UpdateCredentials` call, which lists every active credential of the subject in `oldCredentials`. Validity periods do not overlap. Renewal before `expiresAt` follows the same rule or uses the expiration extension of the Credentials CIP.
3. To announce a change, the admin publishes the current credential with `validUntil` set to the time of the change. It publishes the next credential with `validFrom` set to the same time. It SHOULD do so at least 14 days before the change. To cancel an announced change, the admin replaces the credentials again without the next credential.
4. A replacement for a token package with the same package name MUST be an upgrade that is compatible under Daml smart contract upgrades. Any other change SHOULD be described at the `cip-xxxx/upgrade-notes-url` of the next credential.
5. To withdraw a package, the admin publishes a new list without it. Archiving all credentials of a subject ends publication.

A registry operator that hosts the admin party publishes with that party's authorization, as for any self-published credential.

### Client behavior

A client that integrates an instrument:

1. Obtains `instrumentAdmin` and `instrumentId` from its counterparty, the instrument's CIP-0056 metadata API, or an explorer.
2. Queries the Credential Lookup API for property `cip-xxxx/token-packages`, with issuer and holder `instrumentAdmin`, the encoded `instrumentId` as subject, and `effectiveOnly = true`. It uses the BFT read described in the Credentials CIP.
3. If that query returns no effective record, it repeats the query with subject `instrumentAdmin` and `effectiveOnly = true`. In the Credentials CIP, a subject equal to the holder matches claims with the subject unset. The effective record that step 2 or, failing that, this query returns defines the current package set. A record that is not yet effective never hides an effective one.
4. Takes the first returned record on the Global Synchronizer and ignores all other records. From it, the client reads the `cip-xxxx/dar-<mainPackageId>` and `cip-xxxx/upgrade-notes-url` claims that have the same subject as the `cip-xxxx/token-packages` claim. The record carries all claims of the credential, so the client needs no package id in advance. It ignores `cip-xxxx/dar-` claims whose suffix is not a 64-character lowercase hexadecimal id.
5. Downloads each DAR it has not verified before, decodes it, and recomputes every package id from the archive bytes. The main package id of each DAR MUST match its claim, and every listed package id MUST be present in at least one DAR. Only listed packages and their dependencies are candidates for vetting.
6. Checks every unlisted dependency. It SHOULD reject the instrument unless each one is in `daml/dars.lock` of a Splice release, test packages excluded, or defines no templates and no interfaces.
7. Vets nothing on its own. It reports the result of its checks, and the node operator approves each vetting change, case by case or through an allowlist of admin parties. A client MUST NOT vet packages only because a holding of the instrument arrived.
8. Queries both subjects with `effectiveOnly = false` at least daily and applies last-write-wins as in the Credentials CIP. A record whose `validFrom` is later than the record time that the lookup reports in `synchronizerTimes` is an announced change, kept apart from the current package set. From its `validFrom`, it applies under the rule of step 3. The client completes steps 4 to 7 for the announced record before that time.

A package that leaves the list is not an instruction to unvet it. Missing claims mean the instrument publishes nothing under this CIP, not that it needs no packages. A client keeps its last verified state when claims disappear, expire without renewal, or fail the checks of steps 5 and 6, and when the BFT read fails. It reports each of these conditions to the node operator. It discards an announced change that is no longer returned. A client that first reads a change less than 14 days before its `validFrom`, or after it, applies steps 4 to 7 to it without delay.

### Non-goals

- Public data about holdings, holders, and activity is out of scope.
- Package hosting, version resolution, and audit attestations are left to package registries, such as [Dev Fund #533](https://github.com/canton-foundation/canton-dev-fund/pull/533).

## Motivation

A node can use a CIP-0056 or CIP-0112 token only after it has vetted the token's packages. Today issuers send DARs to each integrator by direct message and announce upgrades the same way. Every integration and every upgrade repeats this manual work.

The Credentials CIP uses self-published credentials for discovery, including the CIP-0056 registry URLs. Token packages follow the same pattern.

## Rationale

The DAR URLs are a stopgap. If DARs become available on-ledger, the `cip-xxxx/dar-<mainPackageId>` claims are dropped and the package list stays.

The main package id is part of the property so that the registry's uniqueness per subject and property gives one URL per DAR. Clients never look these properties up directly. A client sees which DARs it has already verified and downloads only new ones.

An earlier draft used a separate `TokenDisclosure` contract and a registration check. The credential needs neither, and the client ends up trusting less than it may seem.

The client trusts the instrument admin. It already does so under CIP-0056, since the admin party issues the token in the first place. The registry adds no new party to trust: it creates the credential only with the admin's authorization, so nobody else can publish a package list for the token.

The client trusts the Super Validators as a group, not one by one. It accepts a record only when more than a third of the Super Validator nodes return it, so a single faulty or dishonest node can neither forge a credential nor hide one.

The client does not trust the DAR hosts. It downloads each DAR, recomputes its package id and drops any file that does not match the claim. A broken or hostile host can delay an update, but it cannot slip in different code.

What the standard does not protect against is a compromised admin key. Whoever holds it can publish any package list, as they could already issue the token itself. In that case the operator's approval before vetting is the last check.

Values are plain text because the DAR carries package name and version. The package id is the hash that the client recomputes.

## Examples

The admin `example-issuer::1220abcd` runs the token `EXUSD`. One DAR with main package `2222…` contains both token packages, `2222…` and its dependency `1111…`. On 2026-12-15 at 12:00 UTC a new DAR with main package `3333…` upgrades `2222…`. Active contracts still use `2222…`, so it stays listed.

The admin publishes a credential with subject `EXUSD`:

| Property | Value |
| --- | --- |
| `cip-xxxx/token-packages` | `1111…,2222…` |
| `cip-xxxx/dar-2222…` | `https://example-issuer.example/dars/exusd-2.1.0.dar` |
| `cip-xxxx/upgrade-notes-url` | `https://example-issuer.example/exusd/upgrades` |

To announce the change, the admin publishes this credential with `validUntil` 2026-12-15T12:00:00Z and a second one in one call. The second has the same subject, `validFrom` 2026-12-15T12:00:00Z, the list `1111…,2222…,3333…`, the claims `cip-xxxx/dar-2222…` and `cip-xxxx/dar-3333…`, and its own upgrade notes.

A wallet operator approves `1111…` and `2222…` now and `3333…` before the change.

## Backwards compatibility

This CIP is additive and opt-in per instrument. It changes no CIP-0056 or CIP-0112 interface, route, or registry.

## Reference implementation

TBD: a publisher tool, a client library with test vectors, and a conformance checker, proposed in [Dev Fund #1116](https://github.com/canton-foundation/canton-dev-fund/pull/1116).
