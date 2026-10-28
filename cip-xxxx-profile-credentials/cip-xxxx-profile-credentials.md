<pre>
  CIP: TBD
  Title: Canton Network Party Profiles
  Author: PixelPlex Inc. (Vladislav Kokosh), Digital Asset (Simon Meier)
  Status: Draft
  Type: Standards Track
  Created: 2026-01-27
  License: CC0-1.0
  Requires: TBD
</pre>

## Abstract

This CIP standardizes a portable representation of **party profile
metadata** for user-interface rendering on the Canton Network based on
the [**Canton Network Credentials Standard**](https://github.com/canton-foundation/cips/pull/204).

It defines:

-   A set of **standard claim keys** for display, description, contact,
    location, and social metadata.
-   Rules for **self-published** credentials (`issuer` equals `holder`)
    and **issuer-published** credentials (`issuer` differs from
    `holder`), using the same keys.
-   An application-side display model: a full profile view is an ordered
    list of issuer sections; a compact view uses a single issuer slice.

The profile claims defined by this CIP are **informational only** and
**SHOULD NOT** be interpreted as verified identity attributes or used for
name or recipient resolution. They MAY be used for these purposes if extra
information about the issuer of the credential is known.

## Copyright

This CIP is licensed under CC0-1.0: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)

## Specification

This CIP builds on the **Canton Network Credentials Standard** and uses
its claim encoding and Credential Lookup API semantics.

Every claim defined by this CIP describes the credential holder. Claim
keys defined by this CIP MUST NOT contain an explicit `!subject` suffix,
and applications MUST ignore such a claim if the suffix is present.

A profile credential MAY be **self-published** (`issuer` equals `holder`)
or **issuer-published** (`issuer` differs from `holder`). Issuer-published
credentials let application providers attach profile metadata to parties
they interact with, using the same well-known keys.
Neither form verifies the claims' accuracy, establishes legal identity, or
proves ownership of an external account or resource.

This CIP does not define who may create a credential about a given
`holder`. Authorization to publish is defined by the Canton Network
Credentials Standard.

Profile metadata is expressed as **credential claims** under a dedicated
namespace:

`cip-<nr>/`

Where `<nr>` will be replaced by the assigned CIP number.

Claim keys in this CIP use kebab-case, following the naming convention of
the Canton Network Credentials Standard (for example, `display-name`).

### Party Profile Claim Keys

Publishers include self-publishers and other issuers. Claim values are
not validated at publication time. Publishers SHOULD encode values as
specified below. Applications MAY ignore values that do not conform to
this specification.

#### `cip-<nr>/display-name`

Human-readable name used for UI display.

Publishers:

-   SHOULD encode the value as a Unicode string of no more than **64 Unicode characters**

Applications:

-   MUST treat the value as a display string
-   MUST NOT treat it as an identifier
-   SHOULD render the value as-is after applying UI escaping
-   MAY gracefully truncate the rendered value

#### `cip-<nr>/description`

Short description of the party for UI display.

Publishers:

-   SHOULD encode the value as a Unicode string of no more than **280 Unicode characters**

Applications:

-   MUST treat the value as informational metadata
-   MUST NOT treat it as an identifier
-   SHOULD render the value as-is after applying UI escaping
-   MAY gracefully truncate the rendered value

#### `cip-<nr>/keywords`

Comma-separated keywords, most significant first.

Publishers:

-   SHOULD encode a comma-separated list of Unicode keywords, most
    significant first (for example, `defi,wallet` or `defi, wallet`)

Applications:

-   MUST treat the value as informational metadata
-   MUST NOT treat keywords as identifiers
-   MAY split on commas, trim surrounding whitespace from each keyword,
    and display a subset (for example, only the first few keywords)

#### `cip-<nr>/notice`

A short notice about the party (for example, a status or deprecation
warning).

Publishers:

-   SHOULD encode the value as a Unicode string of no more than **280 Unicode characters**

Applications:

-   MUST treat the value as informational metadata
-   MUST NOT treat it as an identifier
-   SHOULD render the value as-is after applying UI escaping
-   MAY highlight it as a notice in the UI
-   MAY gracefully truncate the rendered value

#### `cip-<nr>/avatar`

Avatar reference for UI rendering as a user profile image.

Publishers:

-   SHOULD encode a URI conforming to RFC 3986
-   SHOULD use an `https://` URL or `ipfs://` URI

Applications:

-   MUST treat the value as a reference to an avatar resource
-   MUST NOT interpret the value as identity verification
-   MUST validate the URI before using it
-   MAY ignore values that are not valid or supported URIs

#### `cip-<nr>/website`

Website reference associated with the party.

Publishers:

-   SHOULD encode an absolute `https://` URL conforming to RFC 3986

Applications:

-   MUST treat the value as informational metadata
-   MUST NOT treat it as an authoritative identifier
-   MUST validate the URL before presenting it as a link
-   MAY display invalid URLs as plain text
-   MUST NOT treat invalid values as trusted links

#### `cip-<nr>/email`

Informational contact email.

Publishers:

-   SHOULD encode a value conforming to RFC 5322 `addr-spec` syntax

Applications:

-   MUST treat this value as informational metadata
-   MUST NOT assume ownership or verification
-   MUST validate the value before rendering a `mailto:` link
-   MAY render a valid value as a `mailto:` link

#### `cip-<nr>/phone`

Informational contact phone number.

Publishers:

-   SHOULD encode an E.164 string (for example, `+15551234567`)

Applications:

-   MUST treat this value as informational metadata
-   MUST NOT assume ownership or verification
-   MUST validate the value before rendering a `tel:` link
-   MAY render a valid value as a `tel:` link

#### `cip-<nr>/location`

Generic location string (for example, `New York, USA`).

Publishers:

-   SHOULD encode the value as a Unicode string of no more than **128 Unicode characters**

Applications:

-   MUST treat the value as informational metadata
-   MUST NOT treat it as a verified address
-   SHOULD render the value as-is after applying UI escaping

#### `cip-<nr>/mail`

Physical mailing address.

Publishers:

-   SHOULD encode the value as a Unicode string of no more than **256 Unicode characters**

Applications:

-   MUST treat the value as informational metadata
-   MUST NOT treat it as a verified postal address
-   SHOULD render the value as-is after applying UI escaping

#### `cip-<nr>/social:telegram`

Telegram handle.

Publishers:

-   SHOULD encode a value conforming to Telegram username format rules
-   SHOULD encode the value **without an `@` prefix**

Applications:

-   MUST treat the value as a Telegram username
-   MUST validate the value before constructing a link
-   MAY render the handle with a leading `@`

#### `cip-<nr>/social:x`

X (Twitter) handle.

Publishers:

-   SHOULD encode a value conforming to X username format rules
-   SHOULD encode the value without a leading `@`

Applications:

-   MUST treat the value as an X username
-   MUST validate the value before constructing a link
-   MAY render it with `@`

#### `cip-<nr>/social:github`

GitHub username or organization.

Publishers:

-   SHOULD encode a value conforming to GitHub username or organization name format rules

Applications:

-   MUST treat the value as informational metadata
-   MUST validate the value before constructing a link
-   MAY link to a GitHub profile URL

#### `cip-<nr>/social:linkedin`

LinkedIn username or company handle.

Publishers:

-   SHOULD encode a value conforming to LinkedIn username or company vanity-name format rules
-   SHOULD encode the value **without** a leading `@` or a full profile URL

Applications:

-   MUST treat the value as informational metadata
-   MUST validate the value before constructing a link
-   MAY link to a LinkedIn profile URL

#### `cip-<nr>/social:discord`

Discord handle or user ID.

Publishers:

-   SHOULD encode a value conforming to Discord username or user ID format rules

Applications:

-   MUST treat the value as informational metadata
-   MAY display the value as provided

### Party Profile Resolution

Applications MUST retrieve party-profile credentials through the
Credential Lookup API defined by the Canton Network Credentials Standard.
A lookup MUST constrain `holder` to the party whose profile is requested.
Applications SHOULD constrain `keyPrefix` to `cip-<nr>/` when only profile
properties are required.

Applications MUST use only active credential records. A credential MUST
be ignored when the lookup time is before `validFrom`, after `validUntil`,
or after the registry record's `expiresAt`, when the respective field is
present. Archived credentials MUST be ignored. The precise time-boundary
semantics MUST follow the Canton Network Credentials Standard.

Applications SHOULD query the DSO Credential Registry by default and MAY
query additional registries according to an explicit application-specific
policy. When multiple registries are queried, applications MUST apply a
deterministic registry-priority order.

#### Claim deduplication

Within a single issuer, each claim key MUST have at most one selected
value. After the filtering above, a value from a higher-priority
registry takes precedence. Within one registry, the credential with the
latest registry record time takes precedence. If record times are equal,
the contract ID MUST be used as the deterministic tie-breaker in the order
defined by the Canton Network Credentials Standard.

Applications MUST NOT collapse claims from different issuers into a single
flat key/value map for display. The same key MAY therefore appear once in
each issuer section.

#### Profile display sections

A **full profile view** (for example a profile page) MUST present the
party profile as an ordered list of **issuer sections**. Each section
contains the selected claims for one issuer about the requested holder.

Section order MUST be:

1.  The **self-published** section, if present (`issuer` equals `holder`).
2.  One section per **known issuer**: an issuer that the displaying
    application has explicitly whitelisted. Known-issuer sections MUST
    follow the application's whitelist order.
3.  One section per remaining **unknown issuer**. Unknown-issuer sections
    MUST follow a deterministic order; applications SHOULD order them by
    issuer party ID.

An issuer MUST appear in at most one section. Empty sections MUST be
omitted.

Within each section, applications MUST render **well-known keys** defined
by this CIP first, in the order specified in this CIP, for every such key
that has a selected value. Unrecognized keys in that issuer's selected
claims, if shown, MUST appear after the well-known keys. Applications MAY
omit unrecognized keys they do not wish to display.

Non-conforming **values** of well-known keys are handled separately:
applications MAY ignore them, as specified under Party Profile Claim Keys.

Applications SHOULD make the issuer of each section visible in the UI.
Applications MAY hide unknown-issuer sections by default.

A **compact view** (for example a list row, chip, or send dialog) MUST NOT
merge claims from different issuers. It MAY show a single issuer slice:
the self-published section if present, otherwise the first known issuer in
whitelist order. If neither is present, the compact view MUST omit profile
fields. Compact views MUST NOT use an unknown-issuer section.

## Motivation

Party IDs serve as the primary identity anchors on the Canton Network.
While suitable for infrastructure-level identification, they are
difficult for humans to distinguish and remember.

Applications interacting with Canton often need to display meaningful
information about the party behind a party ID, such as:

- a human-readable display name and description
- an avatar
- website, email, phone, and mailing address
- location, keywords, and notices
- social handles

Currently there is no standardized way to represent or resolve such
metadata across applications, including metadata published by the party
itself and metadata published by application providers.

This CIP introduces a **standardized profile metadata model** that
allows:

-   party owners to publish profile information
-   application providers to publish profile metadata about parties they
    interact with
-   applications to interpret profile claims consistently
-   users to distinguish parties in wallets, explorers, and applications

This improves **user experience and interoperability across Canton
ecosystem applications**.

## Rationale

### Why Party-Centric Profiles

Profiles are attached directly to the **party identity anchor**,
ensuring stability across applications and identity flows.

A self-published profile (`issuer` equals `holder`) is still unverified
informational metadata. Whether the holder authorized that publication is
determined by the Canton Network Credentials Standard, not by this CIP.
Issuer-published credentials use the same keys so application providers
can attach profile metadata without waiting for a separate schema.
Applications SHOULD distinguish self-published profile metadata from
issuer-published metadata and from independently verified identity
credentials.

Displaying issuers as separate sections, rather than merging them, keeps
provenance visible and lets applications adopt third-party publishers at
their own pace via an issuer whitelist.

### Why Namespaced Claim Keys

Using namespaced keys `cip-<nr>/*`:

-   minimizes protocol changes
-   preserves compatibility with existing credential infrastructure
-   enables efficient querying
-   allows extensibility

Future well-known profile attributes may be standardized via amendments
to this CIP (or a separate CIP where appropriate) while continuing to
use the `cip-<nr>/` namespace.

This namespace design is primarily for forward compatibility:
applications may ignore unrecognized keys without breaking.

### Relation to ENS

ENS text records, in particular
[ENSIP-5](https://docs.ens.domains/ensip/5#global-keys), are the
inspiration for this profile key set. This CIP does not reuse ENS key
strings as-is.

The intentional differences are:

-   Canton keys live under this CIP's `cip-<nr>/` namespace, so observed
    data can be traced back to this specification.
-   Keys use kebab-case to match the Canton Network Credentials Standard
    (`display-name` rather than ENS `display`). ENS `display` also has
    name-matching rules that do not apply to Canton party IDs.
-   A website is `website` rather than ENS `url`.
-   Social handles are grouped as `social:*` rather than reverse-DNS
    service keys such as `com.github` or `com.twitter`. X is `social:x`
    rather than `com.twitter`.
-   Avatar `data:` URIs are omitted; see Why Avatar URIs Omit `data:`.

Covered ENSIP-5 global keys, under this CIP's names, are `display-name`
(`display`), `avatar`, `description`, `keywords`, `notice`, `email`,
`phone`, `location`, `mail`, and `website` (`url`). Covered service keys
are `social:github` (`com.github`), `social:x` (`com.twitter`),
`social:telegram` (`org.telegram`), and `social:linkedin`
(`com.linkedin`). This CIP additionally defines `social:discord`, which
has no ENSIP-5 counterpart.

ENSIP-5 service keys not defined here:

-   `vnd.*` legacy aliases (`vnd.github`, `vnd.twitter`, `vnd.peepeth`)
    were replaced in ENSIP-5 by `com.*` keys; this CIP does not revive
    them.
-   `com.peepeth` refers to a defunct service.
-   `io.keybase` is omitted as a niche service key; it MAY be added later
    via amendment if there is a concrete need.

### Why Application-Side Resolution

Different applications may have different trust policies, issuer
preferences, and registry priorities.

Therefore this CIP standardizes:

-   claim namespace
-   claim interpretation semantics
-   credential filtering
-   deterministic per-issuer claim selection
-   sectioned display order for a full profile view (self-published, then
    known issuers, then unknown issuers)

but leaves configurable:

-   selection of additional registries
-   registry priority ordering
-   which issuers are treated as known / whitelisted
-   whether unknown-issuer sections are shown by default in a full
    profile view
-   which compact surfaces show a self-published or known-issuer slice

### Claim Deduplication

Credential claims are a map from key to value. Collapsing to one value per
key inside an issuer section keeps that section predictable: at most one
`display-name`, one `email`, one `website`, and so on, including
unrecognized keys.

Multiple values for the same key are still visible when they come from
different issuers, because each issuer is a separate section. Two `email`
claims from the same issuer are not: last-write-wins applies. A second
address under the same issuer can be added later via an additional
well-known key or an amendment, rather than making every field
multi-value.

### Why Avatar URIs Omit `data:`

ENS avatar records also accept `data:` URIs (inline images). This CIP does
not. Claim values live on the ledger and are returned by credential lookup.
A typical photo encoded as `data:image/...;base64,...` is a large payload;
even when a small identicon would technically fit, supporting `data:`
without a size cap makes on-ledger image blobs the easy default.

`https://` and `ipfs://` keep the image bytes off-ledger.

## Examples

### Example 1 --- Basic Profile Claims

A self-published credential, for which `issuer = holder`, contains:

-   `cip-<nr>/display-name = "PixelPlex"`
-   `cip-<nr>/avatar = "https://cdn.example.com/profiles/pixelplex.png"`
-   `cip-<nr>/website = "https://pixelplex.io"`
-   `cip-<nr>/email = "info@pixelplex.io"`
-   `cip-<nr>/social:github = "pixelplex"`

Applications should render these values as profile metadata only and
must not treat them as authoritative identity identifiers.

### Example 2 --- Social Handle Rendering

A credential contains:

-   `cip-<nr>/social:telegram = "Pixelplex"`
-   `cip-<nr>/social:x = "pixelplexinc"`

Applications may render these in UI as `@Pixelplex` and
`@pixelplexinc`
while publishers encode the claim values without the leading `@`.

### Example 3 --- Invalid Website Value

A credential contains:

-   `cip-<nr>/website = "not-a-url"`

This value does not conform to the publisher guidance. Applications
may display it as plain text but must not treat it as a trusted link.

## Backwards compatibility

This CIP is **fully additive** relative to the Canton Network Credentials
Standard.

-   No changes to Canton protocol
-   No changes to Daml models beyond those introduced by the Canton Network Credentials Standard
-   No changes to registry contracts beyond those introduced by the Canton Network Credentials Standard

Applications not implementing this CIP will treat the claims as generic
key--value metadata.

## Reference implementation

Not required.

This CIP specifies only claim keys and application-side interpretation
rules.
