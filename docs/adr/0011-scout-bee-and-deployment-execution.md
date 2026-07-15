# ADR 0011: Scout Bee and Deployment Execution

## Status

Accepted

## Date

2026-07-15

## Acceptance

Accepted under the project owner's delegated MVP implementation authority.

## Context

Scout Bee must make deployment understandable to a beekeeper while remaining useful
to an advanced operator. Its MVP must deploy the Cloudflare family profile and a
Compose release to a Linux VM used for Hyper-V UAT. An Azure VM Compose deployment
is a conditional first-checkpoint target, and the same SSH adapter must remain
provider-neutral for AWS and Google Cloud.

A browser-only installer cannot safely manipulate local tools or remote hosts. A
large desktop framework would add signing, runtime, and update weight. A script-only
experience would not meet the requested guided React interface.

## Decision

Scout Bee is a small local application with:

- a React user interface shared with the product design system;
- a Go executor distributed as a single platform binary with the UI embedded;
- a loopback-only HTTP control plane using a random one-time launch token;
- a versioned JSON deployment plan as the contract between UI, dry-run, executor,
  CI automation, and diagnostics;
- explicit preflight, plan, apply, verify, resume, rollback/recovery, and export
  phases; and
- structured redacted logs and an opt-in diagnostics bundle.

The executor runs without elevation unless a selected local operation requires it.
It uses argument arrays, allow-listed executables/actions, bounded paths, verified
artifacts, and no shell interpolation of user input. It never writes secret values
to the deployment plan. Secret inputs stay in memory long enough to configure the
target and are stored only by the target's supported secret mechanism.

MVP adapters are:

1. **Cloudflare family cloud:** preflight account access and free-tier capacity,
   create or reuse named D1/R2 resources, set Worker secrets, apply migrations,
   deploy the exact Worker/static-assets release through a pinned Wrangler tool,
   verify health and versions, and record resource references without credentials.
2. **Remote Compose over SSH:** preflight a supported Linux host, Docker Engine,
   Compose v2, disk, ports, and TLS inputs; transfer a pinned release bundle; create
   secret files with restrictive permissions; start, migrate, verify, back up,
   update, and recover. The same adapter serves Hyper-V, Azure, AWS, GCP, and other
   ordinary Linux VMs.
3. **Advanced plan export:** validate and write the secret-free plan without
   applying it.

Scout Bee may invoke a pinned, checksum-verified Wrangler distribution for the
Cloudflare adapter and `ssh`/`scp` for the remote Compose adapter. Missing
prerequisites produce exact guided remediation; Scout does not silently install
system-wide tools. Release builds package the required UI and schema and publish
checksums, SBOMs, and provenance.

The update journey follows the accepted release manifest: discover an explicit
version, verify compatibility and artifacts, preflight, create and verify a backup,
stage, migrate, activate, verify, then commit or recover. Operator scripts and plain
Compose/Workers documentation remain supported so Scout Bee is never a lock-in.

## Consequences

- End users receive a guided installer while operators retain an auditable plan and
  ordinary deployment artifacts.
- Go is used only for Scout's local executor; product domain/API code remains
  TypeScript.
- Windows is the first packaged Scout platform for the MVP UAT. Linux and macOS
  packages follow from the same source and release workflow.
- Azure-specific VM creation is not required for MVP; an existing Azure VM can use
  the provider-neutral SSH adapter. One-click provider provisioning remains later.
- HCS, private Key Vaults, Hyper-V host automation, and maintainer credentials are
  test harnesses, not Scout or product dependencies.

## References

- [Scout Bee design](../deployment/scout-bee.md)
- [Deployment strategy](../deployment/deployment-strategy.md)
- [Versioning, release, and update lifecycle](../architecture/versioning-release-and-update-lifecycle.md)
- [ADR 0007](0007-deployment-profile-priority.md)
