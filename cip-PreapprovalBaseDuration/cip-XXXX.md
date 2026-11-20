## Title

<pre>
  CIP: ?
  Title: Free Canton Coin Transfer-Preapproval Base Duration
  Author: Moritz Kiefer, Simon Meier
  Status: Draft
  Type: Tokenomics
  Created: 2026-05-22
  License: CC0-1.0
</pre>

## Abstract

[CIP-0096](https://github.com/canton-foundation/cips/blob/main/cip-0096/cip-0096.md) removed validator liveness rewards. This introduced a
bootstrapping problem: Most exchanges only support sending Canton Coin
to parties that have preapprovals enabled. But enabling preapprovals
requires paying a CC fee for their expiry duration.
This CIP solves this bootstrapping problem by introducing a free base duration for preapprovals
(defaulting to 90 days), which allows creating and renewing a
preapproval using just traffic costs including using the free base traffic rate.

## Copyright

This CIP is licensed under CC0-1.0: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)

## Specification

- Introduce a new `transferPreapprovalBaseDuration` configuration parameter in `AmuletConfig` defaulting to 90 days.
- Change transfer preapproval creation and renewal to charge for `transfer preapproval expiry extension - transferPreapprovalBaseDuration`.
  In particular creating a transfer preapproval with an `expiry <= transferPreapprovalBaseDuration` and renewing it to extend 
  expiry by a `duration <= transferPreapprovalBaseDuration` is free.

## Motivation

Allowing the creation of transfer preapprovals just through free
traffic cost solves the bootstrapping problem and allows validators to
purchase CC through exchanges. Keeping the option to create
preapprovals with longer expiry in exchange for burning CC fees keeps
backwards compatibility with usecases that prefer to set up a
preapproval with longer durations over automation that renews
periodically.

## Rationale

The fees were originally added to guard against overloading the
Supervalidator nodes with very long-lived transfer preapprovals. This
problem still exists, which is why we cannot fully remove the fees. However, for
preapprovals with a lifetime of <= 90 days traffic costs provide
sufficient protection and allow us to not charge additional CC fees.

## Backwards compatibility

This CIP does require a Daml change. However, as long as the new
config field is not set explicitly (meaning the default of 90 days is
used), this change allows downgrades of all Daml contracts and is fully
backwards compatible.

Validator nodes will continue to pay transfer preapproval fees for the whole duration until they upgrade to a version that includes the new Daml
code.

## Reference implementation

A draft PR of the Daml changes can be found on the [splice repository](https://github.com/canton-network/splice/pull/5645).
