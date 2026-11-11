<pre>
  CIP: TBD
  Title: Canton Network Party Profiles
  Author:
    Uladzislaŭ Kokosh (PixelPlex)
    Simon Meier (Digital Asset)
  License: CC0-1.0
  Status: Draft
  Type: Standards Track
  Created: 2026-01-27
  Requires: Canton Network Credentials Standard (https://github.com/canton-foundation/cips/pull/204)
</pre>

FIXME:
- relation to CPRP (#171): describe how the two CIPs split the work, or state that the split changed.
- examples: profiles for realistic parties, e.g., the Console Wallet party, an explorer, a treasury, and a Console Wallet user.

## Abstract

Define a standard set of party profile properties for credentials on the Canton Network,
and rules for how apps display profile information published by parties themselves and by other issuers.
The profiles build on the [Canton Network Credentials Standard](https://github.com/canton-foundation/cips/pull/204)
and are informational, not verified identity information.

## Specification

A party profile consists of the claims with the properties defined in this CIP that are part of credentials held by the party.
The claims are published using the [Canton Network Credentials Standard](https://github.com/canton-foundation/cips/pull/204), either:

- **self-published** by the party itself (issuer = holder), or
- **issuer-published** by another party (issuer ≠ holder), e.g., an app provider publishing metadata about a party it interacts with.

Every claim with a property defined by this CIP describes the holder of the credential.
Such claims MUST leave `subject` unset, and apps MUST ignore a claim with a property defined by this CIP if its `subject` is set.

Note that the Canton Credential Registry requires the authorization of both the issuer and the holder,
so an issuer-published profile in that registry is always one that the holder agreed to.
It also expires records at the end of their free period,
so publishers keep a profile by extending it, which the holder or the issuer can do on their own and without burning CC.

Profile claims are informational.
They neither establish legal identity nor prove ownership of an external account or resource.
Apps SHOULD NOT interpret them as verified identity attributes or use them for name or recipient resolution.
They MAY do so if they have additional information about the issuer of the credential.

### Party Profile Properties

This CIP defines the following properties in its `cip-<nr>` namespace, where `<nr>` is the number assigned to this CIP.
Properties use kebab-case, e.g., `display-name`, like the properties defined in the Canton Network Credentials Standard.
Publishers, i.e., self-publishers and other issuers, SHOULD encode the values as specified for each property.
Registries are not required to validate claim values, so apps MAY ignore values that do not conform to this specification.

For all properties, apps:

- MUST escape the value when rendering it;
- MUST check that the value conforms to its property's encoding before using it as a URI or a link, e.g., to load an avatar image,
  or to render a website, `mailto:`, `tel:`, or social profile link,
  and MUST NOT present a non-conforming value as a link.

#### `cip-<nr>/display-name`

Human-readable name used for UI display.

- Publishers SHOULD encode the value as a Unicode string of at most **64 Unicode characters**.
- Apps MAY gracefully truncate the rendered value.

#### `cip-<nr>/description`

Short description of the party for UI display.

- Publishers SHOULD encode the value as a Unicode string of at most **280 Unicode characters**.
- Apps MAY gracefully truncate the rendered value.

#### `cip-<nr>/keywords`

Comma-separated keywords, most significant first.

- Publishers SHOULD encode a comma-separated list of Unicode keywords, most significant first, e.g., `defi,wallet` or `defi, wallet`.
- Apps MAY split the value on commas, trim surrounding whitespace from each keyword, and display only a subset, e.g., the first few keywords.

#### `cip-<nr>/notice`

Short notice about the party, e.g., a status or deprecation warning.

- Publishers SHOULD encode the value as a Unicode string of at most **280 Unicode characters**.
- Apps MAY highlight the value as a notice, and MAY gracefully truncate it.

#### `cip-<nr>/avatar`

Avatar reference for UI rendering as a user profile image.

- Publishers SHOULD encode an `https://` URL or an `ipfs://` URI conforming to RFC 3986.
- Apps MAY ignore values that are invalid or unsupported URIs.

#### `cip-<nr>/website`

Website associated with the party.

- Publishers SHOULD encode an absolute `https://` URL conforming to RFC 3986.
- Apps MAY display a non-conforming value as plain text.

#### `cip-<nr>/email`

Contact email address.

- Publishers SHOULD encode a value conforming to the RFC 5322 `addr-spec` syntax.
- Apps MAY render a conforming value as a `mailto:` link.

#### `cip-<nr>/phone`

Contact phone number.

- Publishers SHOULD encode an E.164 string, e.g., `+15551234567`.
- Apps MAY render a conforming value as a `tel:` link.

#### `cip-<nr>/location`

Generic location, e.g., `New York, USA`.

- Publishers SHOULD encode the value as a Unicode string of at most **128 Unicode characters**.

#### `cip-<nr>/mail`

Physical mailing address.

- Publishers SHOULD encode the value as a Unicode string of at most **256 Unicode characters**.

#### `cip-<nr>/social:telegram`

Telegram username.

- Publishers SHOULD encode a value conforming to the Telegram username format, without a leading `@`.
- Apps MAY render the value with a leading `@`.

#### `cip-<nr>/social:x`

X (formerly Twitter) username.

- Publishers SHOULD encode a value conforming to the X username format, without a leading `@`.
- Apps MAY render the value with a leading `@`.

#### `cip-<nr>/social:github`

GitHub user or organization name.

- Publishers SHOULD encode a value conforming to the GitHub user or organization name format.
- Apps MAY link to the corresponding GitHub profile.

#### `cip-<nr>/social:linkedin`

LinkedIn user or company name.

- Publishers SHOULD encode a value conforming to the LinkedIn vanity name format, without a leading `@` and not as a URL.
- Apps MAY link to the corresponding LinkedIn profile.

#### `cip-<nr>/social:discord`

Discord username or user ID.

- Publishers SHOULD encode a value conforming to the Discord username or user ID format.

### Party Profile Resolution

Apps retrieve the profile claims of a party `p` from the following sources:

- **Ledger API**: wallets SHOULD read the profile of their own user from the credentials held by that user, as listed by the user's validator node via the Ledger API.
  This covers all issuers and all registries.
- **Credential Lookup API**: for any party, apps MAY query `(property, issuer, p, p)` with `effectiveOnly = true`
  for each property defined by this CIP and each issuer whose section they show:
  `p` itself for the self-published section, and each known issuer.
  The first returned record is that registry's selected one for that property and issuer.
- **Network explorers**: the Credential Lookup API can only filter by holder if the issuer is specified, so it cannot efficiently find unknown issuers.
  Apps MAY use network explorers that offer lookups by holder to find the sections of unknown issuers.

Apps MUST ignore claims of credentials whose validity period is not effective, as defined by the Canton Network Credentials Standard.

Apps SHOULD query the Canton Credential Registry by default,
and MAY query additional registries according to an explicit application-specific policy.
When using records from multiple registries, including those listed via the Ledger API, apps MUST apply a deterministic registry priority order.

#### Claim Deduplication

For each issuer, each property MUST have at most one selected value.
A value from a higher-priority registry takes precedence.
Within one registry, apps MUST apply the last-write-wins semantics for duplicates defined by the Canton Network Credentials Standard.

Claims from different issuers are not deduplicated against each other,
so the same property can appear once in each issuer's section.

### Party Profile Display

Apps MUST NOT merge claims from different issuers.
Instead, they display them per issuer as follows.

A **full profile view**, e.g., a profile page, MUST present the profile as an ordered list of **issuer sections**.
Each section contains the selected claims of one issuer about the party.
The sections MUST be ordered as follows:

1. The **self-published** section, if present.
2. One section per other **known issuer**, i.e., an issuer that the displaying app has explicitly whitelisted,
   in the app's whitelist order.
3. One section per remaining **unknown issuer** that the app found, if any, in a deterministic order, which SHOULD be by issuer party ID.

An issuer MUST appear in at most one section, and empty sections MUST be omitted.

Within each section, apps MUST render well-known properties before unrecognized ones, and in the order in which this CIP defines them.
Apps SHOULD make the issuer of each section visible, and MAY hide unknown-issuer sections by default.

A **compact view**, e.g., a list row, a chip, or a send dialog, MAY show the claims of a single issuer:
the self-published section if present, otherwise the first known-issuer section in whitelist order.
Compact views MUST NOT use the section of an unknown issuer.

## Motivation

Party IDs are the identity anchors on the Canton Network,
but they are hard for humans to tell apart and remember.
There is no standardized way to attach human-readable metadata to a party, such as a display name, an avatar, or contact details,
either by the party itself or by the app providers that interact with it.

This CIP defines such metadata on top of the Canton Network Credentials Standard,
so that apps, e.g., wallets and explorers, can display parties consistently,
and app providers can start publishing metadata about the parties they interact with at their own pace.

## Rationale

### Issuer Sections Instead of a Merged Profile

Profiles are displayed as one section per issuer rather than as a single merged profile.
This keeps the provenance of every claim visible, so that a claim made by an unknown issuer cannot pass for one made by the party itself or by a known issuer.
It also lets app providers start publishing metadata under the well-known properties at their own pace,
and lets apps adopt such issuers one by one via their whitelist.

Which issuers to trust differs between apps.
This CIP therefore leaves it to apps to decide which issuers they treat as known, which additional registries they query and how they prioritize them,
and whether they show the sections of unknown issuers by default.

### Namespaced Properties

All properties use the `cip-<nr>` namespace of this CIP,
so that profile data observed on the network can easily be traced back to its specification.
New well-known properties can be added by amendments to this CIP, or by a separate CIP where appropriate.
Apps do not need to recognize new properties, so such additions do not break them.

### Relation to ENS

The properties are based on the [ENSIP-5](https://docs.ens.domains/ensip/5#global-keys) text records of ENS.
This CIP does not reuse the ENS key strings as-is.
The differences are:

- All properties use this CIP's `cip-<nr>` namespace, see [Namespaced Properties](#namespaced-properties).
- Properties use kebab-case, like the properties defined in the Canton Network Credentials Standard,
  e.g., `display-name` rather than `display`.
  ENS `display` also has name-matching rules that do not apply to Canton party IDs.
- A website is `website` rather than `url`.
- Social handles are grouped as `social:*` rather than as reverse-DNS service keys such as `com.github`,
  and X is `social:x` rather than `com.twitter`.
- Avatars do not support `data:` URIs, see [No Inline Avatar Images](#no-inline-avatar-images).

The covered ENSIP-5 global keys, under this CIP's names, are
`display-name` (`display`), `avatar`, `description`, `keywords`, `notice`, `email`, `phone`, `location`, `mail`, and `website` (`url`).
The covered service keys are `social:github` (`com.github`), `social:x` (`com.twitter`), `social:telegram` (`org.telegram`), and `social:linkedin` (`com.linkedin`).
This CIP additionally defines `social:discord`, which has no ENSIP-5 counterpart.

The following ENSIP-5 service keys are not defined here:

- the legacy `vnd.*` aliases (`vnd.github`, `vnd.twitter`, `vnd.peepeth`), which ENSIP-5 replaced by `com.*` keys;
- `com.peepeth`, as it refers to a defunct service;
- `io.keybase`, which can be added by an amendment if there is a concrete need.

### One Value per Property and Issuer

Each issuer's section shows at most one value per property,
following the last-write-wins semantics of the Canton Network Credentials Standard.
An app therefore never has to choose between, e.g., two display names from the same issuer.

Multiple values for the same property are still visible if they come from different issuers, as each issuer has its own section.
A second value from the same issuer, e.g., a second email address, can be supported later by an additional well-known property,
rather than by making every property multi-valued.

### No Inline Avatar Images

ENS avatars also accept `data:` URIs with inline images.
This CIP does not.
Claim values are stored on-ledger, and the Canton Credential Registry limits them to at most 2047 characters,
which is too small for most images.
Inline images would also make profile credentials large.
An `https://` URL or an `ipfs://` URI keeps the image bytes off-ledger.

## Examples

### Example 1: Self-Published Profile

A self-published credential, for which issuer = holder = `<pixelplex-party>`, contains the following claims:

| Property | Value |
|---|---|
| `cip-<nr>/display-name` | `PixelPlex` |
| `cip-<nr>/avatar` | `https://cdn.example.com/profiles/pixelplex.png` |
| `cip-<nr>/website` | `https://pixelplex.io` |
| `cip-<nr>/email` | `info@pixelplex.io` |
| `cip-<nr>/social:github` | `pixelplex` |

### Example 2: Social Handles

A credential contains the claims `cip-<nr>/social:telegram` = `Pixelplex` and `cip-<nr>/social:x` = `pixelplexinc`.
Publishers encode the handles without the leading `@`, and apps may render them as `@Pixelplex` and `@pixelplexinc`.

### Example 3: Non-Conforming Website

A credential contains the claim `cip-<nr>/website` = `not-a-url`.
The value does not conform to this CIP, so apps may display it as plain text but not as a link.

## Backwards Compatibility

This CIP is backwards compatible: it only defines properties and how apps interpret them.

## Reference Implementation

This CIP requires no changes to the Canton Network Credentials Standard or to its registries.
The display of party profiles is expected to be implemented in CC View and Console Wallet.

## Changelog

- 2026-11-11: Aligned with the current Canton Network Credentials Standard
- 2026-01-27: Initial draft

## Copyright

This CIP is licensed under CC0-1.0: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
