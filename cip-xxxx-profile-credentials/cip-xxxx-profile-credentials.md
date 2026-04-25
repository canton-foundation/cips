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
the **Canton Network Credentials Standard**.

It defines:

-   A set of **standard claim keys** for common party metadata such as
    display name, avatar, website, and optional contact/social
    information.
-   An **application-side resolution method** for deriving a single
    effective party profile from credentials issued across multiple
    registries and issuers.

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
-   applications to resolve party profiles consistently
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
-   SHOULD support `https://` URLs
-   SHOULD support `ipfs://` URIs
-   MAY ignore values that are not valid or supported URIs

## `cip-<nr>/website`

Website reference associated with the party.

Applications:

-   MUST treat the value as informational metadata
-   MUST NOT treat it as an authoritative identifier
-   SHOULD expect an `https://` URL
-   MAY display invalid URLs as plain text
-   MUST NOT treat invalid values as trusted links

## `cip-<nr>/email`

Informational contact email.

Applications:

-   MUST treat this value as informational metadata
-   MUST NOT assume ownership or verification
-   MAY perform basic email validation
-   MAY render a `mailto:` link

## `cip-<nr>/telegram`

Telegram handle.

Applications:

-   MUST treat the value as a Telegram username
-   SHOULD store the value **without `@` prefix**
-   MAY render the handle with a leading `@`

## `cip-<nr>/x`

X (Twitter) handle.

Applications:

-   MUST treat the value as an X username
-   SHOULD store it without a leading `@`
-   MAY render it with `@`

## `cip-<nr>/github`

GitHub username or organization.

Applications:

-   MUST treat the value as informational metadata
-   MAY link to a GitHub profile URL

## `cip-<nr>/discord`

Discord handle or user ID.

Applications:

-   MUST treat the value as informational metadata
-   MAY display the value as provided

# Party Profile Resolution

Applications may obtain profile credentials for a party **P** from
multiple registries and issuers.

To compute a single **effective profile**, applications use a configured
**ordered list of sources**.

A source is defined as:

`(registry, issuer)`

Issuer may be:

-   a specific issuer party ID
-   `self` (meaning issuer = holder party)

## Resolution Algorithm

### Step 1 --- Fetch credentials per source

For each source in priority order:

Fetch active credentials where:

`holder = P` `issuer = resolved issuer`

Only claims within the namespace `cip-<nr>/` are considered.

### Step 2 --- Resolve duplicates within a source

If multiple credentials from the same source define the same claim key:

-   Apply **last-write-wins semantics**
-   Use the registry record timestamp to determine ordering

### Step 3 --- Merge sources

Construct the final profile **claim-by-claim**.

For each claim key:

1.  Select the value from the **highest-priority source** that provides
    it
2.  Use lower-priority sources only when higher-priority ones do not
    define the key

### Output

The result is an **effective profile map**:

`profileClaimKey → (value, registry, issuer)`

Applications MAY expose `(registry, issuer)` metadata in UI to show
claim provenance.

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

Future profile attributes can be added under the same namespace.

## Why Application-Side Resolution

Different applications may have different trust policies, issuer
preferences, and registry priorities.

This CIP standardizes:

-   claim namespace
-   resolution semantics

but leaves configurable:

-   registry selection
-   issuer trust
-   source priority ordering

## Self-Published Profiles

Self-published profiles provide a universal baseline.

Applications may support the issuer alias:

`self`

which resolves to:

`issuer = holder party`

A common default configuration is:

`[(dsoRegistry, self)]`

# Examples

## Example 1 --- Self-Published Profile

Holder party:

`P`

Source list:

`[(dsoRegistry, self)]`

Profile is derived entirely from credentials where:

`holder = P` `issuer = P`

## Example 2 --- Preferred Issuer with Fallback

Sources:

`[(dsoRegistry, Ipreferred), (dsoRegistry, self)]`

Preferred issuer values are used when available, otherwise fallback to
self-published values.

## Example 3 --- Multiple Registries

Sources:

`[(registryA, Ipreferred), (registryB, Ipreferred), (registryA, self)]`

Resolution priority:

1.  registryA preferred issuer
2.  registryB preferred issuer
3.  registryA self

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


