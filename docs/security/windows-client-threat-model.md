# Windows Client Security Boundary and Threat Review

**Scope:** Proposed Windows standalone and connected client

**Review date:** 2026-07-17

**Status:** Engineering threat review complete; implementation, retail-profile, and
independent/manual release verification remain open

## Purpose

This review defines the security boundary for the proposed Electron-based Windows
client before product implementation begins. It consolidates the measured WIN-003,
WIN-004, and WIN-005 research without treating research packaging as a released
product or authorizing implementation.

The authoritative visual is the Lucidchart
[Standalone Windows runtime and trust boundaries](../diagrams/windows-scout-architecture.md#page-2--standalone-windows-runtime-and-trust-boundaries).
This document is its accessible threat and control description.

## Security outcome

A normal Windows user can run ApiaryLens standalone without exposing its service or
data to the network, without placing reusable credentials in renderer-accessible
storage, and without requiring administrator access or development tools. Connected
mode changes the remote transport and authentication boundary but must not weaken
the protected local data, credential, update, or renderer boundaries.

The following are non-negotiable:

1. The standalone service binds explicitly to IPv4 loopback on an operating-system-
   assigned port and refuses wildcard, LAN, VPN, tunnel, or public binding.
2. Ordinary renderer JavaScript receives neither a reusable local-service control
   capability nor a connected-session credential.
3. The native bridge exposes only narrow, versioned, schema-validated operations and
   validates the calling window and frame.
4. One current-user host owns one local service and one writable database/media root.
5. Data, protected credential files, journals, and readiness metadata live under a
   current-user directory protected from other ordinary Windows users; traversal and
   reparse-point escapes are refused.
6. Migration, integrity, credential, and release verification fail closed. Failure
   never silently deletes hive data, weakens authentication, or activates an
   unverified version.
7. The application creates no inbound Windows Firewall rule and does not rely on a
   system or environment proxy for host-owned loopback traffic.
8. Logs and diagnostics contain no credential, control capability, ciphertext,
   session value, private media, hive data, or unredacted user path.

## Protected assets

- standalone SQLite records, organization membership, audit state, and migrations;
- original media, derivatives, exports, and backups;
- connected backend sessions and connection-profile metadata;
- local-service control capability and native bridge authority;
- protected credential files and their purpose/version journal;
- update manifests, checksums, attestations, signatures, and rollback state;
- readiness, crash-budget, migration, recovery, and diagnostic evidence; and
- the user's expectation that standalone data remains local and available offline.

## Actors and assumptions

| Actor | Capability | Security treatment |
|---|---|---|
| Remote network peer | Can scan or send network traffic but has no local Windows session | Must have no route to the standalone service; connected traffic requires trusted HTTPS and normal server authentication |
| Untrusted web content or compromised renderer | Can execute renderer JavaScript and attempt bridge or navigation abuse | Treated as untrusted; sandbox, context isolation, strict navigation, sender validation, CSP, and narrow preload surface are mandatory |
| Different ordinary Windows user | Can sign in to the same computer and copy files they are permitted to read | Must be denied access to another user's data and protected credentials |
| Malicious process under the same Windows user | Can inspect that user's files/processes and automate their UI | Inside the accepted operating-system account boundary; cannot be fully defeated by an app-only design and must be stated in user/security guidance |
| Local administrator or kernel-level malware | Can take ownership, debug processes, or replace trusted software | Outside the application security boundary; code signing, Windows protection, and recovery reduce but cannot remove this authority |
| Malicious or compromised release source | Can substitute or replay artifacts or metadata | Exact identity, checksum, signature, attestation, compatibility, and downgrade verification must fail closed before activation |
| Crash, power loss, disk exhaustion, or partial update | Can interrupt writes or leave stale state | Treated as an adversarial failure; transactions, journals, backups, bounded retry, integrity checks, and explicit recovery are required |

Device-only password-optional operation accepts the current Windows user account as
the primary identity boundary. If data or service access becomes reachable from any
other device, built-in authentication and encrypted transport become mandatory.

## Trust boundaries

### Renderer to Electron host

The renderer is not a trusted native principal. It has no Node integration, no
filesystem or process primitive, no arbitrary HTTP bridge, and no credential API.
The isolated preload validates schemas and sender identity for a fixed operation
allowlist. The main process owns lifecycle, transport, credentials, updates, and
diagnostics. A navigation, popup, child frame, or untrusted window receives no
privileged bridge.

### Host to local service

The host starts the exact bundled portable service on `127.0.0.1` port `0`, supplies
process-scoped startup authority without exposing it to ordinary page JavaScript,
and waits for authenticated readiness. Readiness metadata is non-secret and cannot
by itself authorize requests. IPv6 loopback does not become an accidental second
listener. Host-owned loopback requests bypass environment and WinINET proxy routing
without weakening connected HTTPS proxy policy.

### Process and data ownership

A current-user single-instance owner and data-directory lock are acquired before
opening SQLite. Trusted windows share that owner. Stale readiness is replaced only
after proving the recorded owner is dead. SQLite uses transactional/WAL behavior;
startup rejects corruption, incompatible or invalid migration state, and unavailable
writable storage before readiness. Originals and database state share the defined
backup/restore consistency boundary.

### Windows user and filesystem

Data roots and protected credential files permit the current user and SYSTEM, deny
other ordinary users, and reject traversal, symlink, junction, and reparse escapes.
The design does not claim protection against the same-user adversary or local
administrator. Keep-data uninstall retains data and protected credentials only after
clear consent; remove-all deletes both and leaves no decryptable credential residue.

### Credential protection

Electron `safeStorage` is the proposed initial adapter. The main process protects a
versioned, purpose-scoped credential value and stores only non-secret state needed
to recover interrupted rotation. Credential loss or decryption failure preserves
hive data and enters guided reauthentication/recovery. It never downgrades to
plaintext, silently creates a weaker account, or treats credential loss as authority
to delete data.

### Connected backend

Connected mode uses publicly trusted HTTPS and a public-client authentication flow
accepted by the native-authentication design. Organization scope remains a server-
side authorization decision. Local replicas and outbox data remain subject to the
same device/account boundary; they are not a server backup and do not grant remote
operator privileges.

### Update and recovery

The application and Scout Bee have independent identities and release channels.
Before activation, the lifecycle coordinator verifies product identity, exact
version, compatibility ranges, size, checksum, signature, and attestation, then
creates or verifies a recoverable backup. Migration and health evidence determine
commit versus rollback. An unavailable safe rollback stops activation and directs
restore/recovery; it does not run an incompatible prior binary against migrated data.

## Threat and risk register

| Threat | Likelihood | Impact | Level | Required control and current evidence | Residual gate | Status |
|---|---|---|---|---|---|---|
| Wildcard or non-loopback service exposure | Medium | High | High | Explicit IPv4 loopback assertion; IPv6 loopback rejection; no installer firewall rule; packaged/installed probes pass | Production composition must retain release-failing bind assertion | Mitigated in research; implementation open |
| Renderer steals service or connected credential | Medium | High | High | Sandbox/context isolation, narrow preload, untrusted-window rejection, main-process `safeStorage`; tested renderer/diagnostic surfaces contain no generated credential | Production CSP/navigation/DevTools/message review and manual penetration test | Partially mitigated |
| Renderer invokes an overbroad native primitive | Medium | High | High | Fixed schema-validated bridge and sender validation are required; research bridge rejects untrusted windows | Production operation-by-operation authorization and negative tests | Open |
| Different Windows user reads data or credentials | Low | High | Medium | Current-user-plus-SYSTEM ACL, cross-user denial, and copied-fixture decryption denial pass | Retail-profile and Remote Desktop/session matrix | Partially mitigated |
| Same-user malware reads or manipulates state | Medium | High | High | Explicitly accepted OS-account boundary; minimize secrets, use protected storage, signed updates, integrity/recovery | User guidance, optional future stronger device protection, no misleading claim | Accepted boundary |
| Local process races or replaces service ownership | Medium | High | High | Single owner, directory lock, PID/identity readiness, rapid-launch and stale-owner tests | Production host integration and hostile local-process review | Partially mitigated |
| Loopback request is diverted by proxy or filter | Low | High | Medium | Environment and black-hole WinINET proxy probes pass; prior registry restored | PAC, VPN/filter-driver, restrictive firewall, and IPv6-only policy profiles | Partially mitigated |
| Database corruption or partial write loses hive data | Medium | High | High | WAL rollback, committed-state retention, integrity check, corrupt-startup refusal, deterministic `SQLITE_FULL`, ACL-denied startup, backup/restore probes | Physical-volume-full and power-loss testing on candidate | Partially mitigated |
| Invalid migration ledger activates silently | Medium | High | High | Exact package test reproduces checksum/unknown/skipped/out-of-order weakness as WIN-026 | Production fix plus negative exact-artifact replay | Open — release blocking |
| Credential rotation crash signs user out or weakens auth | Medium | Medium | Medium | Versioned rotation journal, crash replay, revocation, sign-out, reinstall, reset-denial evidence pass | Account transitions and guided recovery UX | Partially mitigated |
| Untrusted update or downgrade executes | Medium | High | High | Immutable artifact/verification design, SBOM and notice reconciliation, package transition research | Production signing, attestation, downgrade and interrupted-update UAT | Open — release blocking |
| Diagnostics or plan leaks private material | Medium | High | High | Secret-free plan contract and aggregate-only research evidence; tested diagnostics exclude generated values | Production support-bundle field audit and secret scan | Partially mitigated |
| Theft of an unlocked device exposes local hive data | Medium | Medium | Medium | Windows account/device boundary and session revocation guidance | Retail device-lock, at-rest encryption guidance, and owner acceptance | Open residual risk |

## Measured evidence

The threat disposition relies on the following public research records, which retain
sanitized commands, exact run identities, limitations, and exit gates:

- [Windows host and package research](../research/2026-07-16-windows-host-and-package-spike.md)
- [Windows local-service security research](../research/2026-07-16-windows-local-service-security-spike.md)
- [Windows credential-protection research](../research/2026-07-16-windows-native-credential-protection-spike.md)
- [Standalone-to-connected migration research](../research/2026-07-16-standalone-to-connected-migration-spike.md)
- [ADR 0016 proposed host/package decision](../adr/0016-electron-windows-host-and-package.md)

Key exact research runs include packaged/installed shared-window, IPv6, and
environment-proxy run `29571215352`; WinINET proxy/firewall run `29571914796`; and
packaged-host accessibility/zoom diagnostic run `29573274135`. These are candidate
research artifacts, not released-product UAT.

## WIN-004 threat-review disposition

The engineering threat-review subgate is complete: assets, actors, trust boundaries,
required controls, accepted same-user/local-administrator boundary, measured
evidence, and residual risks are now explicit. WIN-004 remains open because its exit
gate also requires production-host integration, managed network-policy and Windows
lifecycle profiles, physical-volume-full behavior, and release/manual review.

No risk in this document authorizes a weaker fallback. A failed control either stops
startup/activation, enters bounded recovery, or reopens the host decision. Final
acceptance requires the implementation and exact-artifact gates in ADR 0016 plus an
owner-reviewed security disposition.
