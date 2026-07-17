# Windows Local Service Security Spike

## Status

`WIN-004` is in progress. The owner authorized research on 2026-07-16. This record
does not authorize a Windows product scaffold or select Electron or Tauri.

The first disposable lifecycle and security prototype passed on a fresh GitHub-
hosted Windows runner. Credential protection, host-to-renderer secret delivery,
real server integration, file ACLs, migration failure recovery, and threat review
remain before the research gate can close.

## Decision question

How can a signed per-user Windows host supervise the portable ApiaryLens Node and
SQLite server without exposing an unauthenticated LAN service, leaking credentials,
allowing duplicate writers, or losing local data during crashes and updates?

## Requirements and constraints

The boundary must:

- run without administrator rights, a firewall exception, or a machine service;
- bind only to loopback on an operating-system-assigned port;
- authenticate every request with an unguessable, process-scoped credential;
- keep that credential out of command lines, files, browser storage, logs,
  diagnostics, crash reports, and exported plans;
- reject web origins other than the packaged application origin as defense in depth;
- permit multiple trusted application windows without starting duplicate database
  writers;
- use one data/media tree per Windows user and organization-aware application data;
- supervise startup, readiness, crash recovery, clean shutdown, and parent death;
- preserve SQLite durability and migration/update recovery contracts; and
- behave the same whether the UI host is Electron or Tauri/WebView2.

## Prototype boundary

The research fixture intentionally stayed outside product applications. A
PowerShell supervisor generated a 256-bit random token, delivered it only through
the child process environment, and immediately cleared the supervisor's environment
copy. The Node 24 fixture:

- acquired a deterministic per-user named-pipe listener as an operating-system-
  owned single-instance guard;
- opened HTTP on `127.0.0.1` port `0` and wrote only non-secret readiness metadata;
- required both `Authorization: Bearer <token>` and the packaged-app origin;
- used constant-time token comparison;
- ran a versioned SQLite migration with WAL and foreign keys enabled;
- watched the supervising process and stopped when that parent disappeared; and
- removed its readiness file and closed HTTP, the instance guard, and SQLite during
  authenticated graceful shutdown.

The named pipe is an ownership guard in this prototype, not yet the application
transport. A private pipe transport could reduce loopback exposure, but it would
require a host bridge and would make direct reuse of the existing HTTP client and
server contracts more complex.

## Evidence

GitHub Actions run
[`29543499494`](https://github.com/ApiaryLens/apiarylens/actions/runs/29543499494)
executed commit `5bcf330d76943fbedb1f5b14810f98414edaace5` with Node 24.18.0.
The workflow retained only sanitized runner-temporary evidence for 14 days.

| Check | Result |
|---|---:|
| Listener addresses | `127.0.0.1` only |
| Missing / wrong authentication | 401 / 401 |
| Correct token from untrusted origin | 403 |
| Correct token and origin | 200 |
| Token in child command line | No |
| Token in readiness metadata | No |
| Token in uploaded logs/evidence | No |
| Duplicate service/database owner | Rejected; exit 73 |
| Schema migration | Version 1 applied |
| Record after forced process termination and restart | Preserved |
| Port after restart | Changed; client rediscovery required |
| Concurrent authorized clients | 8 of 8 passed |
| Authenticated graceful shutdown | Exit 0; readiness removed |
| Service after supervising parent exited | Exited; readiness removed |
| Matching Windows Firewall rules | 0 |
| Database after service shutdown | Preserved |

The result proves a workable loopback and lifecycle shape; it does not prove the
production server is safe merely by adopting the same mechanics.

## Threat analysis

| Threat | Required control | Current evidence / gap |
|---|---|---|
| Website or browser process probes loopback | Random per-launch bearer credential on every endpoint | Missing/wrong credential rejected |
| Cross-site request from an untrusted page | Exact packaged-origin check plus no permissive CORS | Untrusted origin rejected; origin alone is not authentication |
| Token exposed in process discovery or diagnostics | Never put token in arguments/files/logs; redact structured diagnostics | Arguments and evidence clean; production redaction not yet exercised |
| Compromised packaged renderer steals full authority | Local-only content, strict CSP, sandbox/isolation, narrow host bridge, no token in ordinary page JavaScript | Not yet proven; highest remaining design risk |
| Two hosts write one SQLite database | Per-user operating-system ownership guard | Duplicate prototype rejected |
| Child outlives host | Parent liveness watch plus host job/process ownership where available | Parent-death prototype passed; Windows Job Object option remains to compare |
| Crash corrupts or loses data | WAL, transactions, backup-before-update, integrity/health checks | One forced crash preserved a committed record; fault matrix remains |
| Local non-loopback exposure | Explicit IPv4/IPv6 loopback bind and listener assertion | IPv4 loopback passed; IPv6 behavior still to define |
| Same-user malicious native process | Windows user boundary, protected credentials, least privilege | Such a process may inspect another same-user process; not solved by bearer token alone |
| Stale update starts incompatible service | Version handshake, schema range, atomic update, rollback | Not yet exercised |

## Proposed direction to challenge

1. The signed host owns the service lifecycle and starts exactly one packaged Node
   service per Windows user.
2. The host generates a new 256-bit token and random port on every service start.
   The token is never persisted.
3. The host and service use a non-secret readiness channel with an authenticated
   version handshake. A named pipe or inherited handle is preferable to a broadly
   writable readiness file once framework support is known.
4. Ordinary renderer JavaScript must not receive a reusable bearer token. Electron
   should use a sandboxed, context-isolated preload bridge; Tauri should use narrow
   capability-scoped commands. The host bridge performs authenticated requests or
   attaches the token outside application page code.
5. The service binds only to explicit loopback and does not create a firewall rule.
6. A per-user operating-system ownership primitive prevents a second service. The
   host connects to the existing healthy owner or reports recoverable stale state.
7. Local data lives beneath the user's ApiaryLens application-data directory with
   inherited user-only ACLs. Credentials belong in Windows credential protection;
   SQLite and media never contain backend passwords or session secrets.
8. Host, service, schema, and desktop-bridge versions participate in the same
   compatibility, backup-before-update, health, and rollback transaction.

## Trade-offs

- Loopback HTTP maximizes reuse and debuggability but creates a local network attack
  surface. The token, packaged-origin check, strict binding, and host-owned request
  bridge are mandatory, not optional hardening.
- A private named pipe reduces browser-origin exposure but adds a framework bridge,
  platform-specific transport, and another API contract. It remains a challenger
  until the Electron and Tauri host prototypes prove the cost.
- Passing a launch token through the environment avoids command-line and file
  disclosure, but same-user native malware may inspect process state. ApiaryLens can
  defend against web content and accidental disclosure; it cannot claim isolation
  from already-compromised same-user native code.
- One service shared by multiple windows avoids duplicate SQLite writers, but the
  host needs explicit connection brokering, window authorization, and shutdown
  reference counting.

## Remaining experiments and exit gate

`WIN-004` closes only after:

1. Integrating the real portable server and shared SQLite migrations in a disposable
   host lab, including existing organization-authorization negative tests.
2. Proving Electron preload and Tauri command bridges can keep the token outside
   renderer-accessible storage and global JavaScript.
3. Testing process startup timeout, crash loops, forced termination during writes,
   WAL recovery, `integrity_check`, disk-full, read-only directory, corrupt database,
   migration failure, backup restore, and incompatible versions.
4. Measuring per-user directory ACLs, symlink/reparse-point handling, path traversal,
   Windows Job Object versus parent polling, sleep/resume, sign-out, and shutdown.
5. Testing multiple windows, rapid double launch, stale readiness state, port
   collision, IPv6 loopback, local proxy settings, and firewall policy restrictions.
6. Threat-reviewing the selected host bridge and documenting the accepted local
   adversary boundary in the Windows security design and follow-on ADR.

## Scale and revisit conditions

The standalone service is deliberately one-user/local-device. Organization and hive
scale remains inside the portable server and SQLite contracts. Revisit the process
model if a future Windows deployment must serve multiple operating-system users,
accept LAN clients, run unattended without a signed-in user, or coordinate databases
larger than the supported SQLite profile; those are server-deployment concerns, not
reasons to weaken the family desktop boundary.

## Gallery or registry impact

No gallery or registry is needed. The host/service protocol and compatibility
metadata belong in signed immutable product releases. Native plug-ins are not loaded
through a community registry.
