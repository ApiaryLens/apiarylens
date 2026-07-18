# Scout Bee Installer and Lifecycle Design

## Status and authority

This is the accepted design baseline for Scout Bee. The
repository split is accepted by [ADR 0014](../adr/0014-scout-bee-separate-repository-and-release.md).
The executor security boundary in [ADR 0011](../adr/0011-scout-bee-and-deployment-execution.md)
still applies. The repository transition is complete, but Scout Bee is not currently
offered as an end-user download. It will be versioned and released independently
when the deployment bootloader is ready.

Scout Bee is not an ApiaryLens product client. It is the separately installed and
released deployment application for acquiring, installing, updating, repairing,
diagnosing, backing up, restoring, rolling back, and removing ApiaryLens backend
and optional web deployments.

## Required outcomes

- A family Windows user can install Scout and manage ApiaryLens without installing
  Go, Node, WSL, Docker, or a Linux shell.
- Windows Scout can manage Cloudflare or a remote Linux target over SSH. The target
  may be a Hyper-V VM, home server, mini-PC, or cloud
  VM; the user is not expected to type Linux commands.
- Linux users receive a versioned archive containing one executable and a concise
  README.
- Scout and ApiaryLens use independent semantic versions and release channels with
  explicit compatibility metadata.
- Stable is the default channel. Preview and RC channels require an explicit
  advanced opt-in with a warning and a reversible channel-change path.
- Source clones and GitHub source ZIPs are contributor workflows, never the normal
  family installation path.
- The core repository publishes immutable product artifacts and automation inputs;
  it never deploys a personal environment.

## Repository and release ownership

[`ApiaryLens/scout-bee`](https://github.com/ApiaryLens/scout-bee) owns:

- the embedded React guide;
- the local executor and loopback API;
- Windows and Linux packaging;
- target adapters and prerequisite checks;
- lifecycle state machines, recovery, redacted diagnostics, and plan export;
- Scout signing, SBOM, provenance, checksums, release notes, and self-update; and
- cross-version compatibility tests against published ApiaryLens manifests.

`ApiaryLens/apiarylens` remains authoritative for:

- API, sync, export, connection-profile, and deployment-plan contracts;
- database migrations and compatibility declarations;
- backend, web, Windows/client, Compose, and Cloudflare product artifacts;
- product release manifests, checksums, SBOMs, attestations, and provenance; and
- portable templates and versioned user/operator/developer documentation.

`my-apiarylens` and similar personal repositories may store secret-free plans,
artifact locks, verification records, and CI instructions. They do not receive a
copy of product source or deployment credentials.

## Packaged application architecture

| Component | Responsibility |
|---|---|
| Embedded guide | Family-language questions, recommendations, cost/ownership explanation, confirmation, progress, recovery, and diagnostics |
| Local executor | Loopback API, plan validation, release verification, process/SSH execution, target adapters, operation journal, and redacted logs |
| Release resolver | Channel discovery, compatibility selection, immutable manifest acquisition, verification, and cache management |
| Plan engine | Generates and validates the versioned secret-free `apiarylens-deployment.json` contract |
| Lifecycle engine | Install, update, repair, backup, restore, rollback, uninstall, resume, and health verification state machines |
| Adapter boundary | Cloudflare, remote Compose over SSH, and advanced export implementations |
| Exporter | Plan, artifact lock, verification record, redacted summary, and provider-neutral CI instructions |

The packaged executable serves the embedded UI on a random loopback port. It binds
only to loopback and requires a per-launch random authorization value delivered in
the URL fragment. The value remains in memory, is never logged, and is required on
every mutating request. Responses use a restrictive CSP and bundled assets. Scout
has no telemetry or external analytics.

The browser-facing process never assembles shell strings. It submits typed actions
to the executor. The executor uses allow-listed commands, argument arrays, bounded
timeouts, cancellation, output limits, and structured redaction.

## Local data directories

Windows uses `%LOCALAPPDATA%\ApiaryLens\ScoutBee`; Linux uses the applicable XDG
data/cache/state directories. The logical layout is:

```text
config/                non-secret preferences and selected channels
cache/releases/        verified immutable artifacts grouped by product/version
operations/<id>/       resumable state, checkpoints, and redacted results
backups/               operator-selected local backups and verification metadata
diagnostics/           explicitly generated redacted support bundles
exports/               secret-free plans, locks, verification, and CI instructions
```

Temporary storage is used only for download staging and safe extraction. A staged
artifact becomes cache-eligible only after every verification step passes. Verified
versions needed by the active install, pending operation, and supported rollback
window are retained. Cache cleanup is explicit and cannot remove the only rollback
artifact for an unfinished operation.

Secrets, passwords, session cookies, provider tokens, SSH private keys, and recovery
codes never enter these directories. Scout requests them only when required and
keeps them in memory or delegates storage to the operating system or target secret
store.

## Release discovery and artifact acquisition

1. Resolve the configured Scout and product channel. Stable is assumed when no
   channel is stored.
2. Fetch the signed release index and exact product manifest from GitHub Releases.
3. Verify repository/release identity, manifest schema, supported contract ranges,
   signing/attestation policy, checksum, declared size, and actual size.
4. Reject floating tags, mutable source archives, unknown artifacts, downgrade
   attempts outside policy, incompatible plans/schemas, and untrusted manifests.
5. Download into an operation-specific partial file with bounded retry and resume.
6. Verify the completed bytes before safe extraction; reject path traversal,
   links escaping the extraction root, unexpected executables, or size expansion
   beyond policy.
7. Atomically promote the verified artifact into the version cache and write a
   secret-free verification record.

Scout never builds ApiaryLens from a clone during an end-user operation. Contributor
source builds use separate documented commands and cannot be silently selected by
the family flow.

## Guided plan generation

The user chooses one of three outcomes:

1. **Family Cloud** — deploy a connected backend and optionally deploy the web
   frontend.
2. **Own hardware or cloud VM** — manage a compatible Linux target over SSH.
3. **Advanced export** — validate and export an immutable plan/lock without applying
   it locally.

Scout explains availability, ownership, likely cost, prerequisites, backup
responsibility, portability, and what data leaves the computer before requesting
inputs. It gathers non-secret configuration, validates the plan, previews exact
actions and destructive consequences, runs a non-mutating preflight, and requires
explicit confirmation before apply.

The plan schema rejects unknown properties, embedded secret-like fields, floating
versions, relative remote target paths, public HTTP, no-auth network exposure, and
unsupported contract combinations. A plan identity is deterministic across
equivalent non-secret inputs.

## Remote Linux over SSH adapter

- Uses the operating system SSH implementation with argument arrays and strict host
  key verification.
- Supports password, agent, key, or platform-approved authentication without
  serializing credentials into a plan.
- Verifies architecture, operating system, time, disk, ports, Docker Engine,
  Compose v2, target permissions, and release requirements.
- Presents guided Windows prerequisite remediation and target-side actions; users
  are not sent to a Linux shell to finish a normal supported operation.
- Transfers the exact verified bundle, verifies it again on the target, creates
  restrictive secret files through the target secret boundary, runs migrations
  once, health-checks, and performs an authenticated smoke test.
- Treats any changed SSH host key as a blocking security event requiring explicit
  operator reconciliation; it never auto-accepts the replacement.

The adapter remains provider-neutral. Hyper-V, Azure, AWS, GCP, home servers, and
hosted Linux differ only in provisioning and connection guidance.

## Cloudflare adapter

The adapter uses a user-owned minimum-permission API token held in memory. It lists
the intended D1, R2, Worker, route, DNS, and secret changes before apply; reuses
resources only when exact plan identity matches; applies migrations idempotently;
uploads secrets through the provider API; deploys pinned Worker/static assets; and
verifies readiness, authenticated access, D1/R2 operation, DNS, and TLS.

Backup and restore use short-lived maintenance authorization. The authorization is
removed when the operation ends, and maintenance endpoints otherwise behave as
missing. Pricing/free-allowance statements are dated and linked; Scout never
promises permanent-free service.

## Lifecycle state machine

Every mutating operation journals these phases:

```text
Requested → Validated → Preflighted → Confirmed → Acquiring → Verified →
Backed up → Applying → Migrating → Activating → Health checking → Completed
```

An operation may move to `Paused`, `Cancelled`, `Recovery required`, `Rolling back`,
`Restoring`, or `Failed safely`. Resume begins from the last verified idempotent
checkpoint. A failed health check never reports success. Code rollback is allowed
only when schema/data compatibility permits it; otherwise Scout restores the
verified pre-operation backup or leaves the previous installation active.

Update checks run when Scout opens and before lifecycle operations. Scout may also
check product releases for managed installations. It must explain available
versions and compatibility before download. Scout self-update uses Scout's own
signed channel and rollback policy and is never coupled to the selected product
channel.

## Backup, restore, repair, and uninstall

- Backup includes relational data, private media, release/contract identity,
  configuration references, and verification metadata but excludes secrets.
- Restore validates format, version compatibility, available space, and checksums;
  creates a pre-restore recovery point; restores into staging; verifies counts and
  media; then activates atomically.
- Repair compares the installation against the artifact lock, restores missing or
  corrupted product files, rechecks permissions/prerequisites, and never overwrites
  user data as a shortcut.
- Rollback selects only a verified compatible cached version and records why it was
  chosen.
- Uninstall distinguishes application removal, keep-data removal, target teardown,
  and permanent deletion. Provider resources and backups are enumerated before any
  destructive confirmation.

## Diagnostics, privacy, and support

Logs are structured, bounded, and redacted at creation. Diagnostics include Scout
and product versions, manifest/lock hashes, operation states, prerequisite results,
health results, safe environment facts, and recent redacted errors. They exclude
credentials, cookies, tokens, private keys, secret values, hive records, media, and
unrequested personal paths. The user previews a bundle before saving or sharing it.

Scout performs no telemetry by default. Network access is limited to the selected
release source, provider APIs, and deployment target required by the requested
operation.

## Advanced export and CI/CD handoff

Advanced export produces:

- `apiarylens-deployment.json`;
- an artifact lock with immutable identities and hashes;
- a verification record describing the trust policy and checked attestations;
- provider-neutral environment/secret-name requirements;
- CI instructions for GitHub Actions, Azure DevOps, or another supported runner;
  and
- a redacted human-readable action summary and recovery plan.

The exported automation consumes released artifacts. It does not invoke a deploy
workflow from the core source repository, copy product source into
`my-apiarylens`, or persist secret values.

## Failure and negative-test requirements

The released packages must prove safe behavior for interrupted downloads, invalid
checksums, wrong artifact sizes, untrusted or expired attestations, incompatible
manifest/plan/schema versions, unsafe archives, missing prerequisites, changed SSH
host keys, insufficient provider permissions, failed migrations, failed health
checks, unavailable rollback, corrupt backup, full disk, process termination, and
network loss during every resumable phase.

Plans, caches, logs, exported bundles, diagnostics, CI repositories, and release
artifacts must pass credential/secret scanning. Organization-isolation and negative
authorization tests remain server requirements even when Scout performed the
deployment.

## Documentation and diagram deliverables

The public guide must cover five-minute Windows/Linux setup, target selection,
Windows-to-Linux, Cloudflare, install/update/backup/restore/repair/rollback/uninstall,
plan export, release channels and verification, data/log locations, diagnostics,
privacy, and troubleshooting. Contributor source-build instructions are linked but
kept out of the normal installation path.

The authoritative Lucidchart set must show repository/artifact ownership, loopback
trust, release acquisition and cache, Windows-to-Linux SSH, Cloudflare execution,
operation/update state machines, backup/recovery, and CI handoff. Accessible exports
and adjacent explanatory text are required before implementation completion.

## Decisions still requiring research or follow-on ADRs

- Windows package/bootstrap technology and signing service.
- Final executor language and UI host after clean-profile size, startup,
  accessibility, supervision, licensing, and update measurements. The current Go
  prototype is evidence, not permission to require Go on an end-user computer.
- Operating-system credential-store integrations.
- Supported SSH authentication methods and prerequisite remediation boundaries.
- Cache retention/support window and emergency trust-root rotation.
- Mobile Scout feasibility and secure provider authorization, only after the
  Windows lifecycle is proven.

## Acceptance gate

Scout's repository transition and update mechanism are not complete until exact
signed Windows and Linux release artifacts pass fresh install, update, backup,
restore, repair, rollback, keep-data uninstall, reinstall, diagnostics, and negative
tests; Windows successfully manages clean Cloudflare and Linux targets without
typed Linux commands; `my-apiarylens` CI consumes immutable artifacts without copied
source; all secret scans pass; and sanitized evidence is recorded on the live PMO
dashboard.
