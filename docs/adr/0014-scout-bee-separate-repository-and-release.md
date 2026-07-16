# ADR 0014: Scout Bee Separate Repository and Release

## Status

Accepted

## Date

2026-07-16

## Acceptance

Accepted by the project owner as the successor to ADR 0011's monorepo placement.
ADR 0011 remains authoritative for executor security and deployment behavior.

## Context

Scout Bee is not an ApiaryLens client. It is a privileged lifecycle application
that discovers, verifies, installs, updates, backs up, restores, repairs, and
removes ApiaryLens deployments and clients. It needs its own release cadence,
platform packages, signing identity, diagnostics policy, and security review.

Keeping the executor under `apps/scout-bee` couples Scout releases to the product
version and encourages the core release process to build a deployment tool. That
conflicts with the accepted direction that the core repository publishes immutable
product artifacts but never deploys a user's environment directly.

## Decision

Create the public Apache-2.0 repository `ApiaryLens/scout-bee` and move the Scout
React UI, executor, packaging, tests, and release workflows there with preserved
history where practical.

The core `ApiaryLens/apiarylens` repository remains authoritative for:

- API, sync, export, local-store, and deployment-plan contracts;
- database migrations and compatibility metadata;
- Compose, Cloudflare, web, and client product artifacts;
- release manifests, checksums, SBOMs, and provenance; and
- portable deployment templates and operator documentation.

Scout consumes exact published product artifacts. Scout has an independent version
and release channel. A Scout release declares the range of product manifest,
deployment-plan, and client-connection contracts it supports; it does not borrow
the product version as its own version.

The migration removes product deployment from core workflows before deleting the
monorepo copy. Until the new repository publishes a verified replacement, the
existing source remains frozen compatibility input rather than receiving new
features.

## Options Considered

### Keep Scout in the product monorepo

Lower short-term migration effort, but couples unrelated release/signing lifecycles
and makes it too easy for product workflows to deploy environments.

### Separate Scout by platform

Separate Windows/Linux/mobile repositories would isolate toolchains but duplicate
the executor, plan validation, UI, security controls, and compatibility tests.

### One separate Scout repository — selected

Provides one lifecycle authority with platform packages and independent releases
while preserving shared behavior and review.

## Consequences

- Scout Bee becomes separately versioned, packaged, signed, and updated.
- The core repository only builds, tests, attests, and publishes product artifacts.
- Cross-repository compatibility tests become mandatory.
- Scout mobile is a later client of the same safe orchestration service/contracts;
  it is not a shortcut around App Store or Android distribution controls.
- Repository migration and release cutover require an explicit rollback plan.

## References

- [ADR 0011](0011-scout-bee-and-deployment-execution.md)
- [Scout Bee design](../deployment/scout-bee.md)
- [Windows-first client and deployment design](../deployment/windows-first-client-and-scout-bee.md)

