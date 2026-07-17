# Windows Local Service Security Spike

## Status

`WIN-004` is in progress. The owner authorized research on 2026-07-16. This record
does not authorize a Windows product scaffold or select Electron or Tauri.

The first disposable lifecycle and security prototype passed on a fresh GitHub-
hosted Windows runner. Exact portable-server process integration and its 15 API
tests also passed persistence and organization-isolation checks, but exposed a
release-blocking listener defect: the current server binds to the wildcard interface
while logging a loopback URL. Credential protection and migration failure recovery
now have separate measured evidence, and Windows path-security evidence proves a
current-user-plus-SYSTEM ACL, cross-user access denial, traversal rejection, and
junction/reparse rejection. Exact packaged and installed Electron evidence now also
proves that two trusted windows share one service process, IPv6 loopback cannot reach
the IPv4-only listener, and a black-hole `HTTP_PROXY`/`HTTPS_PROXY` environment does
not intercept the host-owned loopback fetch. A black-hole Windows per-user proxy
policy now leaves that bridge operational, prior proxy state is restored, and the
installed host creates no Windows Firewall application rule. Managed PAC,
restrictive firewall/VPN/filter-driver and IPv6-only policies, retail lifecycle
behavior, physical-volume-full behavior, the remaining failure matrix, and final
independent/manual security review remain before the research gate can close. The
engineering threat review now defines the accepted local adversary boundary and
residual risks. A disposable wrapper around the real API proves the generic
loopback, authentication, ownership, and parent-supervision shape.

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

## SQLite recovery evidence

GitHub Actions run
[`29547423940`](https://github.com/ApiaryLens/apiarylens/actions/runs/29547423940)
exercised the Windows SQLite recovery contract in a disposable database. It proved
that an interrupted uncommitted write is absent after restart, a committed record is
retained, a verified backup restores successfully, a corrupt backup is rejected,
transactional migration succeeds, an incompatible schema is rejected, a failed
migration rolls back, and an injected post-update health failure restores the prior
database. The run does not replace replay against the exact packaged real service,
schema migrations, and update coordinator.

## Exact portable-server process evidence

GitHub Actions run
[`29549078096`](https://github.com/ApiaryLens/apiarylens/actions/runs/29549078096)
built `apps/api/dist/server.js` and its exact workspace dependencies on a fresh
Windows runner. The adjacent Vitest step passed all 15 API/password tests, including
negative organization isolation for resources, changes, media, memberships, and
exports. A separate process probe then launched the built entry point with an
operating-system-assigned port and real filesystem SQLite/media paths.

| Exact-server process check | Result |
|---|---:|
| Actual listener address | `::` wildcard |
| Desktop loopback-only requirement | **Failed** |
| Console-advertised address | `127.0.0.1` |
| Console address matches listener | **No** |
| Health | 200 |
| Wrong protected-bootstrap token | 403 |
| Owner bootstrap / authenticated session | 201 / 200 |
| Forced termination and restart | Completed |
| Owner available after restart | No; correct retained state |
| Sign-in / session after restart | 200 / 200 |
| Organization identity retained | Yes |
| Credential values in evidence | None |

The cause is deterministic: the entry point passes a port but no `hostname` to
`@hono/node-server`; Node therefore listens on the unspecified address. Its log line
is hard-coded to `127.0.0.1` and does not describe the actual socket. This may be an
intentional server-deployment shape behind Compose port publishing, but it is unsafe
for the standalone Windows process and cannot be reused unchanged.

The selected desktop design must create the real API with an explicit
`127.0.0.1` listener (and an intentional separately tested `::1` policy if desired),
then place the ephemeral control-token/origin boundary and parent supervision in
front of every request. The process probe remains as a regression test: a desktop
artifact fails release if any listener is wildcard or non-loopback, even when its
console output claims otherwise. No product entry-point change is made by this
research record; that belongs behind the accepted Windows service/host ADR.

## Protected real-API wrapper evidence

Follow-up run
[`29549430232`](https://github.com/ApiaryLens/apiarylens/actions/runs/29549430232)
repeated the exact unwrapped-server finding and all 15 API tests, then placed the
real `createApi`, `SqliteStore`, and `FilesystemMediaStore` implementation behind a
disposable desktop wrapper. The wrapper acquired a per-user named-pipe ownership
guard before opening SQLite, bound HTTP explicitly to `127.0.0.1` on an assigned
port, required a per-launch 256-bit token and exact packaged origin on every request,
and monitored its supervising parent.

Expanded run
[`29553015915`](https://github.com/ApiaryLens/apiarylens/actions/runs/29553015915)
repeated the clean install, exact build, 15-test organization-isolation suite,
unwrapped listener failure, and protected wrapper checks at commit
`ca5b02c959d6dc98dcb49f92df7e2f7f04f3dc7e`. It also exercised stale
readiness replacement, four rapid competing launches, readiness protocol identity,
and corrupt-database startup failure.

| Protected real-API wrapper check | Result |
|---|---:|
| Listener addresses | `127.0.0.1` only |
| Missing / wrong control authentication | 401 / 401 |
| Correct control token from untrusted origin | 403 |
| Authorized real API health | 200 |
| Wrong product bootstrap token | 403 |
| Owner bootstrap / session | 201 / 200 |
| Duplicate wrapper/database owner | Rejected; exit 73 |
| Four rapid competing launches | All rejected; exit 73 |
| Stale readiness metadata | Replaced with current PID, port, and protocol 1 |
| Sign-in / session after forced termination and restart | 200 / 200 |
| Organization identity after restart | Retained |
| Restarted on a newly assigned port | Yes |
| Authenticated graceful shutdown | Exit 0; readiness removed |
| Child after supervising parent disappeared | Exited; readiness removed |
| Matching Windows Firewall rules | 0 |
| Token in arguments, readiness, logs, or evidence | No |
| SQLite database after shutdown | Present |
| Corrupt SQLite database at startup | Failed closed before readiness |

This proves that the existing portable API and stores can sit behind the proposed
desktop boundary without exposing a wildcard listener or requiring a new backend.
It also improves the ownership ordering over the first toy fixture: the named-pipe
guard is acquired before SQLite is opened, so a duplicate process never becomes a
second database owner.

The wrapper is deliberately framework-neutral research code. It does not prove that
an Electron preload bridge or Tauri command keeps the token outside ordinary
renderer JavaScript, that Windows Credential Manager protects durable connected-mode
credentials, or that a Job Object provides stronger termination semantics. Separate
research now proves the Windows filesystem boundary, but the selected host must
integrate and repeat that contract. Those host-specific controls remain required
before the host/service ADR can be accepted.

Selected-host run
[`29557057421`](https://github.com/ApiaryLens/apiarylens/actions/runs/29557057421)
subsequently integrated the ownership and parent-death portions into the actual
packaged and clean-installed Electron host. Both artifacts rejected a second host,
terminated the embedded service after forced host death, detected the resulting
dead-PID readiness record on the next launch, removed and replaced it only after a
same-directory restart, and removed readiness on clean shutdown. Both also retained
the 50-check installed API and organization-isolation matrix. At that point Job
Object policy, forced-write/WAL faults, disk-full and read-only paths,
sleep/sign-out/shutdown, and retail Windows behavior remained open.

Actual-storage-fault run
[`29559517037`](https://github.com/ApiaryLens/apiarylens/actions/runs/29559517037)
subsequently committed one marker in the real API database, opened an uncommitted
second transaction, forcibly terminated the packaged/installed embedded service,
and restarted the same data directory. Both artifacts passed integrity checking,
retained the committed marker, rolled back the interrupted marker, and rejected a
separate corrupt database before readiness. Disk-full, read-only directory, startup
timeout/crash-loop policy, and broader Windows lifecycle behavior remain open.

Database-capacity and ACL-denial run
[`29560309984`](https://github.com/ApiaryLens/apiarylens/actions/runs/29560309984)
subsequently exercised both exact forms again. A deterministic `SQLITE_FULL`
simulation capped `PRAGMA max_page_count` at the current database page count, rejected
a 1 MiB transactional insert, retained the prior row count, and passed
`PRAGMA integrity_check`. Separately, the Windows runner applied an actual
current-user deny-write ACE to a disposable data directory; the packaged and
clean-installed hosts both rejected that directory before readiness. The exact setup
SHA-256 was
`0755D1E87DE681CC0C25AF2ABA79578062DABB90BD5DCBD15B1614E38208B294`.
This closes deterministic database-full and ACL-denied-startup mechanics, but not a
physical-volume-full replay, startup-timeout/crash-loop policy, Job Object policy, or
the broader retail Windows lifecycle.

Startup-failure run
[`29560930136`](https://github.com/ApiaryLens/apiarylens/actions/runs/29560930136)
then proved bounded pre-readiness failure handling in the exact packaged and
clean-installed hosts. An injected three-second startup delay exceeded a 400 ms
research deadline; the host terminated the child without readiness or an orphan.
Three injected exit-75 crashes consumed a three-attempt retry budget without
publishing readiness, after which an explicit retry recovered and cleanly stopped the
same directory. The exact setup SHA-256 was
`DA49B28C6327141D1B2380A06D6851048F20B890E4D95B250E3FBE6FE37C4413`.
The short deadline is a deterministic test control, not the selected production
value. Production timeout/backoff values, recovery UX, Job Object policy, and retail
Windows lifecycle behavior remain open.

## Windows path-security evidence

GitHub Actions run
[`29552828360`](https://github.com/ApiaryLens/apiarylens/actions/runs/29552828360)
executed commit `c8182ef38b5bfa6be4d2825fccd8ec665fe664c3` on a fresh hosted
Windows runner. The probe created disposable directories beneath Public Documents
so a disposable second local Windows account could reach the parent path, then
protected the ApiaryLens-like data directory with an explicit ACL. It retained only
sanitized runner-temporary evidence for 14 days and removed the disposable account
and filesystem lab.

| Windows path-security check | Result |
|---|---:|
| ACL inheritance | Disabled |
| Explicit allow principals | Current user and SYSTEM only |
| Normal child path | Accepted |
| `..` traversal path | Rejected |
| Junction/reparse path to an outside directory | Rejected |
| Outside sentinel after hostile-path tests | Unchanged |
| Different local user read | Denied |
| Different local user write | Denied |
| Disposable account cleanup | Passed |
| Username, SID, or password in evidence | None |

This proves the required filesystem primitive and safe path-resolution behavior on
Windows. It does not prove that an Electron or Tauri retail package applies the ACL
before writing data, that every media/database operation uses the safe resolver, or
that roaming profiles, Remote Desktop, locked workstations, sign-out, and shutdown
preserve the intended behavior. Those are integration and lifecycle gates.

### Shared-window and loopback-network evidence

Core commit `60cd0ea` added packaged and clean-installed assertions for the remaining
multi-window and basic loopback-network questions. Exact workflow
[29571215352](https://github.com/ApiaryLens/apiarylens/actions/runs/29571215352)
passed both the installer build and clean-install lifecycle jobs on a fresh hosted
Windows runner.

The downloaded `win003-electron-clean-install-evidence/lifecycle.json` identifies
source commit `60cd0eabfee586a05b4aaf12a2f400a801b5bd84` and records all of the
following as `true`:

- `installedRealServiceBridgeProbePassed`;
- `installedBridgeTrustedWindowsShareOneService`;
- `installedBridgeIpv6LoopbackRejected`;
- `installedBridgeEnvironmentProxyDoesNotInterceptLoopbackFetch`;
- `installedSingleInstancePassed`; and
- `installedApiAcceptancePassed`.

The host opened two separately sandboxed, context-isolated trusted windows. Both
received a typed health result through the narrow preload bridge while the service
PID remained unchanged; the separate untrusted document remained rejected. A direct
request to `[::1]` on the assigned service port failed while the service continued to
report an explicit `127.0.0.1` readiness address. Setting black-hole `HTTP_PROXY` and
`HTTPS_PROXY` values after startup did not divert the host-owned Node fetch from the
authenticated loopback endpoint.

This is evidence for the selected host transport, not a claim about every Windows
network policy. Follow-up clean-install replay
[29571914796](https://github.com/ApiaryLens/apiarylens/actions/runs/29571914796)
at source commit `3073929620376bdce7530f8b92830a53faa61e1d` then enabled the
current user's Windows Internet Settings proxy with a black-hole `127.0.0.1:1`
server and an empty bypass list during the packaged bridge probe. The full bridge
and API acceptance remained green, the prior registry values were restored, and
the installed executable had zero associated Windows Firewall application rules.
The downloaded evidence records
`installedWinInetProxyPolicyConfiguredForBridgeProbe: true`,
`installedWinInetProxyPolicyRestored: true`, and
`installedFirewallRuleCount: 0`.

A managed PAC script, explicit restrictive firewall rule, IPv6-only device policy,
VPN/filter driver, Remote Desktop, and retail-device matrix remain physical-profile
work.

## Threat analysis

| Threat | Required control | Current evidence / gap |
|---|---|---|
| Website or browser process probes loopback | Random per-launch bearer credential on every endpoint | Missing/wrong credential rejected |
| Cross-site request from an untrusted page | Exact packaged-origin check plus no permissive CORS | Untrusted origin rejected; origin alone is not authentication |
| Token exposed in process discovery or diagnostics | Never put token in arguments/files/logs; redact structured diagnostics | Arguments and evidence clean; production redaction not yet exercised |
| Compromised packaged renderer steals full authority | Local-only content, strict CSP, sandbox/isolation, narrow host bridge, no token in ordinary page JavaScript | Not yet proven; highest remaining design risk |
| Two hosts write one SQLite database | Per-user operating-system ownership guard | Duplicate prototype rejected |
| Child outlives host | Parent liveness watch plus explicit host shutdown; add native containment only if it reduces measured risk | Packaged and installed Electron service exited after forced host death; Preview policy does not add a native Job Object binding |
| Crash corrupts or loses data | WAL, transactions, backup-before-update, integrity/health checks | Packaged and installed host retained committed state, rolled back an open transaction, passed integrity, rejected corruption before readiness, rejected deterministic `SQLITE_FULL` without partial state, and rejected an ACL-denied directory before readiness; physical-volume-full remains |
| Local non-loopback exposure | Explicit IPv4/IPv6 loopback bind and listener assertion | Disposable wrapper passed IPv4; exact portable server failed with `::` wildcard |
| Another Windows account or hostile filesystem redirect reaches local data | Protected current-user/SYSTEM ACL plus canonical child paths that reject traversal and reparse points | Hosted probe denied a second account and rejected traversal/junction paths; retail-host integration remains |
| Same-user malicious native process | Windows user boundary, protected credentials, least privilege | Such a process may inspect another same-user process; not solved by bearer token alone |
| Stale update starts incompatible service | Version handshake, schema range, atomic update, rollback | Not yet exercised |

## Proposed direction to challenge

The resulting decision is now captured as proposed
[ADR 0018](../adr/0018-windows-standalone-service-and-local-data-boundary.md).

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

## Windows Job Object policy

Do **not** add a native Job Object binding or a separate launcher to the initial
Electron Preview solely for child cleanup. Keep the service non-detached, retain
host-owned stdio and explicit graceful shutdown, require the child to poll its parent
PID, and retain dead-PID readiness recovery plus the bounded startup/crash policy.

Windows Job Objects can manage a process tree as a unit, and
`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` terminates associated processes when the last
handle closes. Child processes normally inherit membership, while Windows 8 and later
support nested jobs. These are useful defense-in-depth properties, but they are Win32
APIs rather than a documented Electron or Node child-process capability. Electron's
public `utilityProcess` API exposes spawn, exit, and kill behavior but not Job Object
assignment; Node documents that a Windows child may deliberately outlive its parent
when spawned detached. See the official
[Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects),
[Electron utility process](https://www.electronjs.org/docs/latest/api/utility-process),
and [Node child process](https://nodejs.org/api/child_process.html) references.

Adding this control now therefore requires a native binding, bootstrap executable, or
another privileged process boundary. That expands signing, architecture, installer,
antivirus, supply-chain, crash, and update surface without replacing the readiness,
database, or credential controls. Job Objects are also not the data/credential
security boundary; Microsoft requires modern process security restrictions to be set
per process.

Reopen the decision if a supported Windows profile reproduces an orphan under the
required non-detached configuration, parent polling fails a shutdown/sign-out test,
or the selected packaging tool supplies a maintained signed containment primitive
without a new runtime. Any later integration must test nested-job environments,
forced host death, graceful shutdown, update handoff, and recovery before becoming a
release gate.

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

1. Repeating the measured real portable server, shared SQLite, organization-
   authorization negatives, and release-failing loopback assertion inside each
   finalist's actual host bridge. The framework-neutral safe-wrapper shape is proven.
2. Proving Electron preload and Tauri command bridges can keep the token outside
   renderer-accessible storage and global JavaScript.
3. Testing process startup timeout, crash loops, forced termination during writes,
   WAL recovery, `integrity_check`, disk-full, and read-only directories in the real
   wrapper. Corrupt-database startup now fails before readiness; the separate SQLite
   recovery probe covers migration failure, backup restore, incompatible versions,
   and health-triggered rollback. Actual Electron parent death, stale-readiness
   rejection, same-directory restart, and clean shutdown now pass; the remaining
   storage-fault cases still require real-host replay. Forced termination during a
   real database write, WAL rollback, integrity, committed-state retention, corrupt
   startup, deterministic `SQLITE_FULL`, and ACL-denied startup now pass in packaged
   and installed Electron artifacts. Bounded readiness timeout, a three-attempt crash
   budget, and explicit-retry recovery now pass as well. Production timing/backoff
   values, recovery UX, and physical-volume-full behavior remain.
4. Integrating the proven current-user/SYSTEM directory ACL and traversal/reparse
   rejection into each finalist, then measuring sleep/resume, sign-out, shutdown,
   roaming profiles, Remote Desktop, and locked-workstation behavior. The Preview Job
   Object policy is now explicit: retain the exact-artifact-proven parent polling and
   recovery controls; do not add a native binding absent a reproduced orphan or a
   maintained package-native containment primitive.
5. Testing multiple windows, IPv6 loopback, local proxy settings, and firewall policy
   restrictions. Two trusted windows sharing one service, untrusted-window rejection,
   IPv6-loopback rejection, environment-proxy non-interception, rapid competing
   launch, stale-readiness replacement, a black-hole Windows per-user proxy policy,
   registry restoration, and absence of installer-created firewall rules are proven.
   Managed PAC, restrictive firewall, VPN/filter-driver, and IPv6-only policy
   profiles remain; the operating-system-assigned port design avoids selecting a
   colliding fixed port.
6. Threat-reviewing the selected host bridge and documenting the accepted local
   adversary boundary in the Windows security design and follow-on ADR. The
   [engineering threat review](../security/windows-client-threat-model.md) now
   defines the actors, boundaries, controls, risk register, same-user/administrator
   boundary, and residual gates. Production-host integration and independent/manual
   release review remain.

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
