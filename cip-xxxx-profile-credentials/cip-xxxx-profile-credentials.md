---
Author: PixelPlex Inc.
CIP: TBD
Created: 2026-01-27
License: CC0-1.0
Status: Draft
Title: Canton Network Party Profile Credentials
Type: Standards Track
---

# Abstract

This CIP standardizes a portable representation of **party profile
metadata** for user‑interface rendering on the Canton Network based on
the [**Canton Network Credentials Standard**](https://github.com/canton-foundation/cips/pull/204).

It defines:

-   A set of **standard claim keys** for common party metadata such as
    display name, avatar, website, and optional contact/social
    information.
-   A clear **application-side interpretation model** for rendering these
    claims consistently in user interfaces.

The profile claims defined by this CIP are **informational only** and
**MUST NOT** be interpreted as verified identity attributes or used for
name or recipient resolution.

# Motivation

Party IDs serve as the primary identity anchors on the Canton Network.
While suitable for infrastructure-level identification, they are
difficult for humans to distinguish and remember.

Applications interacting with Canton often need to display meaningful
information about the party behind a party ID, such as:

-   human-readable names
-   avatars
-   website references
-   communication or social links

Currently there is no standardized way to represent or resolve such
metadata across applications.

This CIP introduces a **standardized profile metadata model** that
allows:

-   party owners to publish profile information
-   applications to interpret profile claims consistently
-   users to distinguish parties in wallets, explorers, and applications

This improves **user experience and interoperability across Canton
ecosystem applications**.

# Specification

This CIP builds on the **Canton Network Credentials Standard** and uses
its claim encoding and lookup semantics.

Profile metadata is expressed as **credential claims** under a dedicated
namespace:

`cip-<nr>/`

Where `<nr>` will be replaced by the assigned CIP number.

# Party Profile Claim Keys

For social fields, this CIP uses grouped claim keys (for example,
`cip-<nr>/social:discord`) to align naming conventions with
[CPRP (CIP PR #171)](https://github.com/canton-foundation/cips/pull/171)-style
field organization while keeping this CIP namespace prefix.

## `cip-<nr>/displayName`

Human-readable name used for UI display.

Applications:

-   MUST treat the value as a display string
-   MUST NOT treat it as an identifier
-   SHOULD support up to **64 Unicode characters**
-   SHOULD render the value as-is after applying UI escaping
-   SHOULD gracefully truncate values longer than 64 characters

## `cip-<nr>/avatar`

Avatar reference for UI rendering.

Applications:

-   MUST treat the value as a reference to an avatar resource
-   MUST NOT interpret the value as identity verification
-   SHOULD be a URI conforming to RFC 3986
-   SHOULD support `https://` URLs and `ipfs://` URIs
-   MAY ignore values that are not valid or supported URIs

## `cip-<nr>/website`

Website reference associated with the party.

Applications:

-   MUST treat the value as informational metadata
-   MUST NOT treat it as an authoritative identifier
-   SHOULD be an absolute `https://` URL conforming to RFC 3986
-   MAY display invalid URLs as plain text
-   MUST NOT treat invalid values as trusted links

## `cip-<nr>/email`

Informational contact email.

Applications:

-   MUST treat this value as informational metadata
-   MUST NOT assume ownership or verification
-   SHOULD conform to RFC 5322 `addr-spec` syntax
-   MAY perform basic email validation
-   MAY render a `mailto:` link

## `cip-<nr>/social:telegram`

Telegram handle.

Applications:

-   MUST treat the value as a Telegram username
-   SHOULD conform to Telegram username format rules
-   SHOULD store the value **without `@` prefix**
-   MAY render the handle with a leading `@`

## `cip-<nr>/social:x`

X (Twitter) handle.

Applications:

-   MUST treat the value as an X username
-   SHOULD conform to X username format rules
-   SHOULD store it without a leading `@`
-   MAY render it with `@`

## `cip-<nr>/social:github`

GitHub username or organization.

Applications:

-   MUST treat the value as informational metadata
-   SHOULD conform to GitHub username or organization name format rules
-   MAY link to a GitHub profile URL

## `cip-<nr>/social:discord`

Discord handle or user ID.

Applications:

-   MUST treat the value as informational metadata
-   SHOULD conform to Discord username or user ID format rules
-   MAY display the value as provided

# Party Profile Resolution

This CIP does not standardize a full cross-registry/cross-issuer profile
composition algorithm.

Applications SHOULD rely on the resolution/composition flow defined in
[CPRP (CIP PR #171)](https://github.com/canton-foundation/cips/pull/171)
and apply this CIP only for:

-   profile claim key names under `cip-<nr>/...`
-   per-key interpretation semantics for UI rendering

# Rationale

## Why Party-Centric Profiles

Profiles are attached directly to the **party identity anchor**,
ensuring stability across applications and identity flows.

## Why Namespaced Claim Keys

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

## Why Application-Side Resolution

Different applications may have different trust policies, issuer
preferences, and registry priorities.

Therefore this CIP standardizes only:

-   claim namespace
-   claim interpretation semantics

but leaves configurable:

-   resolution/composition method
-   registry selection
-   issuer trust
-   source priority ordering

# Examples

## Example 1 --- Basic Profile Claims

A credential contains:

-   `cip-<nr>/displayName = "PixelPlex"`
-   `cip-<nr>/avatar = "https://cdn.example.com/profiles/pixelplex.png"`
-   `cip-<nr>/website = "https://pixelplex.io"`
-   `cip-<nr>/email = "info@pixelplex.io"`
-   `cip-<nr>/social:github = "pixelplex"`

Applications should render these values as profile metadata only and
must not treat them as authoritative identity identifiers.

## Example 2 --- Social Handle Rendering

A credential contains:

-   `cip-<nr>/social:telegram = "Pixelplex"`
-   `cip-<nr>/social:x = "pixelplexinc"`

Applications may render these in UI as `@Pixelplex` and
`@pixelplexinc`
while storing/interpreting the claim values without the leading `@`.

## Example 3 --- Invalid Website Value

A credential contains:

-   `cip-<nr>/website = "not-a-url"`

Applications may display this value as plain text but must not treat it
as a trusted link.

# Backwards Compatibility

This CIP is **fully additive**.

-   No changes to Canton protocol
-   No changes to Daml models
-   No changes to registry contracts

Applications not implementing this CIP will treat the claims as generic
key--value metadata.

# Reference Implementation

Not required.

This CIP specifies only claim keys and application-side interpretation
rules.


