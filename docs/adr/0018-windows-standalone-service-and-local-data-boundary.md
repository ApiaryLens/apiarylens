# ADR 0018: Windows Standalone Service and Local Data Boundary

## Status

Accepted design; experimental implementation exists but is not an end-user release

## Date

2026-07-17

## Deciders

Kristopher Turner, ApiaryLens project owner. Implementation authorized 2026-07-17.

## Context

The Windows client must run a complete standalone ApiaryLens on a normal user's
computer with no cloud, Linux, Docker, administrator, or development-tool
requirement. It must reuse the portable Node/SQLite/filesystem backend without
making that backend network-reachable, exposing native authority to the renderer,
opening the same data from competing processes, or losing data during crashes and
updates.

Research proves the core shape on packaged and clean-installed Electron candidates:
explicit loopback, one shared service for multiple trusted windows, untrusted-window
rejection, per-user ACL and reparse denial, single ownership, stale-readiness
recovery, parent-death cleanup, WAL/integrity behavior, bounded crash recovery,
environment/WinINET proxy isolation, IPv6 rejection, and no installer-created
firewall rule. Physical/retail profiles and production integration remain open.

## Decision

Use an Electron-main-process lifecycle coordinator to supervise one exact bundled
portable ApiaryLens service per Windows user and standalone profile.

### Process and network boundary

- The main process is the only service creator and lifecycle owner.
- The exact bundled Node runtime and server bind explicitly to `127.0.0.1` port `0`.
- Startup fails before readiness if the actual listener is wildcard, non-loopback,
  incompatible, unauthenticated outside the accepted device-only contract, or
  otherwise different from the verified endpoint.
- A per-launch random control capability crosses a process-scoped startup boundary
  and remains memory-only. Readiness metadata is non-secret and cannot authorize a
  request.
- Host-owned loopback transport bypasses environment and user proxy routing only for
  the verified local endpoint. Connected HTTPS requests retain their normal proxy
  and certificate policy.
- The package creates no inbound firewall rule, LAN listener, Windows service, or
  machine-wide background daemon.

The main process exposes domain-oriented, schema-validated preload operations.
There is no arbitrary fetch, filesystem, shell, process, registry, credential, or
database primitive. Sender, frame, navigation, and lifecycle state are validated
before each privileged operation.

### Ownership and multi-window behavior

The host acquires the per-user application instance and data-profile lock before
SQLite or media is opened. Additional trusted windows attach to the same main
process/service. A competing process cannot start a second writer. Stale readiness
is replaced only after proving the recorded owner identity is dead and the data lock
can be acquired safely.

The initial Preview policy uses the measured parent-polling and stale-owner recovery
mechanism rather than adding an unproven native Job Object binding. Reopen that
policy if a supported profile reproduces an orphan, nested-job behavior defeats the
controls, or a maintained package-native containment primitive is adopted.

### Local directories and permissions

Install binaries and mutable data are separate. Mutable standalone state resides
beneath the current user's ApiaryLens application-data directory and is partitioned
by profile/installation identity:

```text
ApiaryLens/
  profiles/<profile-id>/
    database/
    media/originals/
    media/derivatives/
    credentials/
    backups/
    recovery/
    logs/
    diagnostics/
    lifecycle/
```

The platform adapter resolves the operating-system root; application code does not
embed a maintainer path or username. Directories containing data, credentials,
journals, backups, or readiness state use an explicit current-user-plus-SYSTEM ACL.
Traversal, symlink, junction, mount, and reparse escapes are rejected before use.
Logs and diagnostics use bounded retention and redaction. Temporary extraction is
not durable data or rollback storage.

### Database, media, and readiness

The service is the sole database/media writer. It enables the accepted SQLite
settings and shared migrations, validates the migration ledger and compatibility,
performs integrity and writable-storage checks, and reconciles required media roots
before advertising readiness. Unknown, skipped, out-of-order, failed, or checksum-
mismatched migrations fail closed under WIN-026.

Database records and originals form one backup/restore consistency boundary.
Transactions and WAL preserve committed state and roll back incomplete writes.
Health/readiness never hides a corrupt database, unavailable directory, exhausted
storage, incompatible schema, or incomplete recovery.

### Lifecycle and failure states

The coordinator uses explicit states: `stopped`, `starting`, `ready`, `degraded`,
`recovering`, `blocked`, and `stopping`. Every operation is idempotent or carries a
versioned journal/checkpoint. Startup timeout and crash retries are bounded; after
the crash budget is exhausted, automatic restart stops and the user receives a
specific retry, repair, restore, or diagnostic action. Production timeout/backoff
values are set only after retail measurements.

Update, repair, restore, migration, and remove-all obtain exclusive lifecycle/data
ownership. A data-changing update verifies a backup/restore point before mutation,
activates only after health and compatibility pass, and rolls back or restores only
when the target data state permits it. Keep-data uninstall preserves the profile by
explicit user choice; remove-all deletes data, media, credentials, and journals.

## Options considered

### Supervised per-user child service — proposed

Reuses the portable backend and shared SQLite/media contracts while retaining a
narrow host boundary, normal-user install, explicit lifecycle, and independent
server conformance testing.

### Run the server as a Windows service

Adds administrator/service-account installation, machine-wide ACL and multi-user
complexity, unattended exposure, and a second lifecycle/update model. Rejected for
the default family client; Compose/VM remains the multi-user server path.

### Put database and domain logic in the renderer

Removes the child process but exposes storage/native authority to untrusted web
content, splits backend behavior, and weakens organization/media/migration parity.
Rejected.

### Let each window start its own local server

Creates competing writers, port/token proliferation, inconsistent lifecycle, and
unreliable cleanup. Rejected.

### Bind a fixed local port or LAN address

Creates collisions, discoverability, firewall/proxy complexity, and accidental
network exposure. Rejected.

## Consequences

- Windows bundles and patches an exact Node/server runtime instead of requiring one
  from the user.
- The Electron main process and lifecycle coordinator are security/reliability-
  critical and require negative, crash, storage-fault, and multi-window tests.
- A family gets one-click local operation, while unattended/multi-user/network
  serving remains the portable Compose/backend product rather than a weakened
  desktop mode.
- Mutable data survives binary update/uninstall according to explicit policy and can
  be backed up independently of the install directory.
- Same-user malware and administrators remain inside the accepted Windows account
  boundary; ACLs do not imply protection from them.
- Multiple profiles are possible without assuming a single hive or organization,
  but each writable profile has one local service owner.

## Repository and gallery impact

Core owns the portable service, schema/migrations, local adapter contracts, and
initial Windows composition. Scout may install, update, repair, back up, restore, or
remove the profile through versioned lifecycle operations but does not own or bypass
the data/service contract. No gallery or dynamic plugin boundary applies to process,
filesystem, database, or lifecycle adapters; they are privileged signed product
code.

## Acceptance conditions

This ADR may move to Accepted only after:

1. The owner accepts the compatible host/package decision in ADR 0016.
2. WIN-026 migration-ledger validation and all exact database/media/API/
   organization-isolation negatives pass in the production composition.
3. Packaged and clean-installed candidates prove loopback-only bind, authenticated
   readiness, token non-exposure, sender validation, one owner across multiple
   windows, duplicate/stale-owner refusal, parent death, clean shutdown, and no
   firewall rule or proxy interception.
4. Corruption, forced-write termination, WAL recovery, integrity, read-only/ACL
   denial, deterministic and physical disk-full, startup timeout, crash budget,
   explicit retry, backup, restore, rollback, repair, and unavailable-rollback cases
   pass without partial state or secret leakage.
5. Supported retail profiles cover sleep/resume, sign-out/shutdown, locked
   workstation, Remote Desktop/multiple sessions, roaming/account transitions,
   restrictive firewall/VPN/filter/PAC, and IPv6-only policy.
6. Keep-data/remove-all, reinstall, path/ACL/reparse, log retention, diagnostics
   redaction, and device-loss guidance pass owner-reviewed UAT.
7. The Windows threat review, support guide, backup/restore guide, data-location
   guide, compatibility manifest, and Lucidchart trust-boundary export are current.

## Revisit conditions

Reopen if the selected host cannot supervise the exact portable service safely, a
supported Windows profile leaves orphans/cannot protect directories, a multi-user
desktop server becomes a requirement, the SQLite workload exceeds the supported
profile, or a maintained containment primitive materially improves the boundary.
Any replacement requires compatible data/lifecycle migration and rollback.

## References

- [Windows local-service security research](../research/2026-07-16-windows-local-service-security-spike.md)
- [Windows client threat review](../security/windows-client-threat-model.md)
- [ADR 0016: Electron Windows host and current-user package](0016-electron-windows-host-and-package.md)
- [ADR 0017: Windows native authentication and credential protection](0017-windows-native-authentication-and-credential-protection.md)
- [Windows-first client and Scout Bee design](../deployment/windows-first-client-and-scout-bee.md)
- [WIN-004](https://github.com/ApiaryLens/apiarylens/issues/4)
