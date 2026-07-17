# Windows Native Authentication and Credential Protection Spike

## Status

`WIN-005` is in progress. This record evaluates the durable credential boundary for
the standalone and connected Windows client. It does not select a host framework,
change the product authentication contract, or authorize a Windows scaffold.

Official-source review is complete for Windows Credential Manager, DPAPI, Electron
`safeStorage`, and Tauri Stronghold. The first exact Credential Manager and current-
user DPAPI lifecycle passed on a fresh hosted Windows profile, including denial and
cleanup for a disposable second Windows user. A second clean hosted Windows machine
also failed to decrypt a synthetic current-user DPAPI fixture while its local DPAPI
control succeeded. The selected Electron candidate now also passes a packaged and
clean-installed main-process `safeStorage` store/read/rotate/corruption/delete
lifecycle without exposing either generated credential through tested renderer or
diagnostic surfaces. Credential Manager integration, rotation-crash recovery,
retail-profile, restore, and uninstall-policy evidence remain required.

## Decision question

How can ApiaryLens keep a family user signed in across Windows application restarts
without storing passwords, remote session tokens, bootstrap secrets, or local
authentication roots in browser storage, SQLite, plaintext files, arguments, logs,
diagnostics, plans, or repositories?

## Credential inventory

| Value | Lifetime | Proposed owner | Persistence policy |
|---|---|---|---|
| Desktop loopback control token | One local-service launch | Native host process | Memory only; never persisted or exposed to ordinary renderer JavaScript |
| Standalone authentication root | Installation/data lifetime | Native host | Per-user OS-protected secret; recover through protected backup policy, not a plan |
| Standalone owner password | User input if local app lock is enabled | User / real API | Store only the API's salted password verifier; never store the password |
| Connected session token | Server session lifetime, rotated | Native host HTTP bridge | Per-user OS credential; replace atomically after rotation |
| Connected password | One sign-in or recovery operation | User / remote API | Memory only; never persist |
| CSRF token | Active authenticated session | Native host HTTP bridge | Memory only; reacquire during session rotation |
| Recovery code | One-time account recovery | User | Display/export only on explicit user action; do not retain automatically |
| Deployment/cloud/SSH secrets | Deployment operation or target secret-store lifetime | Scout Bee / target | Outside the Windows client and secret-free deployment plan |

Endpoint URLs, organization identifiers, product versions, and display names are not
credentials, but configuration and diagnostics must still avoid embedding query-
string tokens or user-entered secret material.

## Non-negotiable requirements

- Ordinary React code receives typed results, not reusable local-control or remote-
  session credentials.
- Passwords and recovery codes are never saved for convenience.
- Durable secrets use the current Windows user's protection boundary. Machine-wide
  DPAPI scope is forbidden because Microsoft documents that any user on the machine
  can decrypt machine-scoped data.
- Credential entries use stable, product-namespaced targets and local-machine
  persistence. They must not roam through enterprise profiles by default.
- A failed credential read, corrupt protected value, revoked session, changed
  Windows identity, or restored database without matching secrets produces guided
  recovery rather than data deletion or an authentication bypass.
- Rotation writes the replacement credential before retiring the prior in-memory
  value, then verifies the new session. Crash recovery must never leave both a
  plaintext fallback and a protected value.
- Sign-out deletes the connected credential. **Remove all data** deletes standalone
  secrets; **keep data** preserves the recovery contract explicitly chosen by the
  user.
- Logs, crash reports, diagnostics, exports, backups, release evidence, and
  `apiarylens-deployment.json` are scanned for known secret values and credential-
  target payloads.

## Windows platform findings

### Windows Credential Manager

`CredWriteW` creates or replaces a credential in the credential set associated with
the current token's logon session. `CredReadW` reads from that same user-associated
set. `CRED_TYPE_GENERIC` is application-defined secure data rather than a credential
automatically consumed by Windows authentication packages.

The proposed ApiaryLens adapter uses:

- `CRED_TYPE_GENERIC`;
- a namespaced target such as `ApiaryLens/<installation-id>/<purpose>`;
- `CRED_PERSIST_LOCAL_MACHINE`, which persists across this user's future logons on
  the same computer without requesting enterprise roaming;
- a small versioned binary envelope containing exactly one purpose-scoped secret;
  and
- `CredDeleteW` during sign-out, remove-all-data, or abandoned-rotation cleanup.

Microsoft limits `CredentialBlob` to 2,560 bytes. That is sufficient for opaque
session and root secrets but is not a general configuration store. Usernames,
endpoints, compatibility metadata, and non-secret state remain in the application's
normal configuration.

### DPAPI

`CryptProtectData` normally limits decryption to the same Windows logon credential
on the same computer and provides integrity checking. Optional entropy can domain-
separate ApiaryLens protected values, but entropy embedded beside ciphertext is not
an independent secret. Current-user DPAPI is a viable fallback for encrypted files
or Electron `safeStorage` output when Credential Manager is unavailable or a value
does not fit its constrained record model.

`CRYPTPROTECT_LOCAL_MACHINE` is rejected for family-client secrets: Microsoft states
that any user on that computer can decrypt machine-scoped protected data. DPAPI and
Credential Manager also do not defend against an already-compromised native process
running as the same Windows user; the product must state that adversary boundary.

Primary sources checked 2026-07-16:

- [CredWriteW](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credwritew)
- [CredReadW](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credreadw)
- [CREDENTIALW and persistence limits](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentialw)
- [CryptProtectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)

## Exact Windows API evidence

GitHub Actions run
[`29550138483`](https://github.com/ApiaryLens/apiarylens/actions/runs/29550138483)
called the Unicode Windows Credential Manager APIs through disposable PowerShell
P/Invoke and exercised current-user DPAPI on a fresh hosted Windows profile. The
P/Invoke compiler is a research mechanism, not a proposed product runtime dependency.

| Credential-protection check | Result |
|---|---:|
| Generic credential write/read | Passed |
| Replacement at the same namespaced target | Passed |
| 2,561-byte oversized credential blob | Rejected |
| Prior credential after rejected oversized write | Retained unchanged |
| Credential delete | Passed |
| Read after delete | Missing, as required |
| Current-user DPAPI protect/unprotect | Passed |
| Wrong optional entropy | Rejected |
| Missing optional entropy | Rejected |
| Corrupt ciphertext | Rejected |
| Ciphertext contains plaintext sequence | No |
| Second process under the same Windows user | Decrypted successfully |
| Disposable second Windows user | Decryption denied |
| Disposable account and public test directory | Removed |
| Secret in arguments or evidence | No |
| Credential cleanup after the run | Deleted |

The same-user cross-process result is expected and load-bearing: DPAPI and Credential
Manager protect against other Windows identities and offline disclosure, not native
malware already executing as the same user. ApiaryLens still needs renderer
sandboxing, a narrow host bridge, process-scoped loopback tokens, and honest threat-
model language.

The evidence artifact deliberately records only `current-runner-user`; it does not
retain either user's name or SID, the credential target, password, ciphertext,
entropy, hashes of secrets, or generated values.

## Different-computer DPAPI evidence

GitHub Actions run
[`29553196968`](https://github.com/ApiaryLens/apiarylens/actions/runs/29553196968)
executed commit `3a966f00bf07b474b01d7c2dd86dfdc85439303c` in separate fresh
Windows jobs. The source job created a random synthetic secret, protected it with
current-user DPAPI and random optional entropy, verified a same-machine round-trip,
and transferred only the protected synthetic fixture with one-day retention. The
destination job could not decrypt that value, then successfully protected and
unprotected a new local control value to prove DPAPI itself was working.

| Cross-computer check | Result |
|---|---:|
| Separate fresh hosted Windows job | Yes |
| Source same-machine control | Passed |
| Destination decryption of source fixture | Denied |
| Destination local DPAPI control | Passed |
| Synthetic plaintext sequence in protected fixture | No |
| Username or SID in sanitized evidence | No |
| Plaintext, ciphertext, entropy, or hash in sanitized evidence | No |

This is the direct hosted-Windows baseline for the documented same-user/same-
computer scope. It does not replace validation on two supported retail Windows
computers or backup/restore UX for a user who legitimately moves devices.

## Host-option findings

### Electron

Electron exposes `safeStorage` only from the main process. On Windows its encryption
keys are protected with DPAPI. This is compatible with keeping encryption and
decryption outside a sandboxed renderer, but ApiaryLens would still own ciphertext
file location, ACLs, atomic replacement, deletion, versioning, and diagnostics
redaction.

`safeStorage` is now the proposed initial Electron adapter. It is supported by the
selected host, keeps encryption and decryption in the main process, uses the required
current-user DPAPI boundary on Windows, and avoids adding a native addon with a
separate ABI, signing, licensing, and update-provenance lifecycle. ApiaryLens still
owns ciphertext location, current-user ACLs, versioned purpose envelopes, atomic
journaling, deletion, diagnostics redaction, and recovery UX.

Windows Credential Manager remains the documented fallback and revisit candidate.
The direct API baseline proves it is viable, but an initial Electron implementation
would require either a custom native addon or a shell/runtime bridge. The latter is
rejected, and the former adds privileged code without a demonstrated security or
family-experience advantage over the exact-artifact `safeStorage` results. Revisit
if Windows policy, roaming behavior, protected-file limits, or a future non-Electron
host makes the supported adapter unsuitable.

Exact-artifact run
[`29557388536`](https://github.com/ApiaryLens/apiarylens/actions/runs/29557388536)
at commit `73c6ad118292df5f8f6f7ed0de2d53313f33206d` exercised that
baseline inside both the packaged and clean-installed Electron main process. The
exact setup SHA-256 was
`F438862EB10D2597B44F497E4C250727467395DA0889039B8899F9D9F4F81166`.

| Electron main-process credential check | Packaged | Clean installed |
|---|---:|---:|
| Windows encryption available | Passed | Passed |
| Initial protected store/read | Passed | Passed |
| Ciphertext excluded initial plaintext | Passed | Passed |
| Replacement protected store/read | Passed | Passed |
| Replacement excluded old and new plaintext | Passed | Passed |
| Corrupt ciphertext rejected | Passed | Passed |
| Protected credential deleted | Passed | Passed |
| Raw generated values in renderer/storage/console/arguments/readiness/service output | No | No |
| Existing API assertions | 50 / 50 | 50 / 50 |
| Existing host crash/recovery matrix | Passed | Passed |

Only booleans were serialized; the initial and replacement values, ciphertext, and
hashes were not retained. This proves Electron's supported current-user DPAPI-backed
adapter can satisfy the basic main-process boundary. It does not yet decide whether
the final Windows adapter is `safeStorage` or Credential Manager, nor prove a crash
between server-side token rotation and local replacement, revocation, restore,
Windows-account changes, or keep-data/remove-all-data behavior.

Interrupted-rotation follow-on run
[`29557772561`](https://github.com/ApiaryLens/apiarylens/actions/runs/29557772561)
at commit `ca0554b90e14af593b87741a5441541e21f876be` exercised a
versioned, purpose-scoped protected-credential journal from both packaged and
clean-installed artifacts. The exact setup SHA-256 was
`3EDE260B52F136213743C62077578DB5ACBAFFFF4612C0F56CCDC935B4241B59`.

| Interrupted credential lifecycle | Packaged | Clean installed |
|---|---:|---:|
| Host terminated after protecting replacement but before commit | Exercised | Exercised |
| Secret-free journal detected on next launch | Passed | Passed |
| Current version 1 and pending version 2 validated by purpose | Passed | Passed |
| Protected replacement atomically promoted | Passed | Passed |
| Pending file and journal removed | Passed | Passed |
| Revoked connected session deleted | Passed | Passed |
| Sign-out retained non-secret hive data | Passed | Passed |
| Keep-data preserved protected standalone root and hive data | Passed | Passed |
| Remove-all deleted protected credential and hive data | Passed | Passed |
| Existing credential, API, and host-crash suites | Passed | Passed |

The crash handoff retained only a temporary directory reference and a journal with
schema, purpose, state, and version numbers. It contained no credential, ciphertext,
entropy, or secret hash. This closes the selected-host synthetic rotation-crash,
revocation, sign-out, keep-data, and remove-all state-machine subgate. A real remote
server rotation transaction, same-user backup/restore, different-user/computer
guided failure, Windows account changes, actual installer UI choices, and final
ADR acceptance remain open.

Real-session follow-on run
[`29558246781`](https://github.com/ApiaryLens/apiarylens/actions/runs/29558246781)
at commit `3f2d061841bb45723891cac2643d6baecbafb7c1` connected the
protected adapter to the existing real API acceptance lifecycle. The exact setup
SHA-256 was
`5563D20B07B95C451F5AA8A1FC7FABFA18438BBE0E3D4F685D9C66469635C893`.

| Real server-session transition | Packaged | Clean installed |
|---|---:|---:|
| Bootstrap HttpOnly session protected by main process | Passed | Passed |
| Real `/api/v1/session` refresh replaced protected value | Passed | Passed |
| Old server session rejected after replacement | Passed | Passed |
| Account recovery revoked and deleted protected session | Passed | Passed |
| Restart sign-in protected the new server session | Passed | Passed |
| Local sign-out removed protected session state | Passed | Passed |
| Raw session in renderer/storage/console/arguments/readiness/service output/evidence | No | No |
| Existing API assertions | 50 / 50 | 50 / 50 |
| Interrupted credential and host recovery suites | Passed | Passed |

This closes the selected-host real server issue/refresh/revocation/restart/sign-out
subgate. The cookie necessarily travels between the main-process HTTP client and the
authenticated local service, but it never enters ordinary renderer JavaScript or
sanitized evidence. Backup/restore UX, Windows-account changes, actual installer
choices, supported retail profiles, production signing, and ADR acceptance remain.

Primary source:

- [Electron `safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage)

### Tauri

Tauri's official Stronghold plugin provides an encrypted secret database and denies
potentially dangerous commands until capabilities permit them. Its documented flow
still requires a password-derived 32-byte key and exposes permitted operations
through JavaScript bindings. Hard-coding or silently persisting that vault password
would move, not solve, the protection problem.

Stronghold remains useful when a user intentionally unlocks a portable vault or for
future cross-platform policy. It is not the default transparent Windows-family
credential store unless its unlock key is itself protected by Windows and its
capabilities prevent ordinary renderer code from reading raw credentials. A narrow
Rust command over Windows Credential Manager is the simpler Windows-native
challenger and must be prototype-tested.

Primary sources:

- [Tauri Stronghold plugin](https://v2.tauri.app/plugin/stronghold/)
- [Tauri plugin support and architecture](https://v2.tauri.app/plugin/)

## Proposed direction to challenge

1. Define one framework-neutral native credential interface: `store`, `load`,
   `replace`, and `delete`, with a purpose enum rather than arbitrary target names.
2. Use Electron `safeStorage` with versioned, purpose-scoped protected files and an
   atomic rotation journal as the initial Windows Preview implementation for the
   standalone authentication root and connected session.
3. Keep the loopback control token, CSRF token, passwords, and recovery codes in
   memory only.
4. Let the native HTTP bridge own the connected cookie jar and session rotation.
   React receives the resulting session view, never the opaque cookie value.
5. Retain Windows Credential Manager as a measured fallback and Tauri Stronghold
   only as part of a reopened host decision; do not ship parallel credential stores.
6. Version every protected payload and bind its target to installation, environment,
   organization where applicable, and purpose. Reject cross-purpose substitution.
7. Treat credential loss separately from hive-data loss. Preserve local data and
   guide reauthentication, recovery-code use, or backup restore without weakening
   server authorization.

## Remaining experiments and exit gate

`WIN-005` closes only after:

1. Replaying the selected `safeStorage` store/read/replace/corruption/delete and
   interrupted-rotation lifecycle in the selected signed host package. Packaged and
   clean-installed unsigned research artifacts now pass; production signing remains.
   The direct Credential Manager API baseline is complete but no selected-host
   native integration is required unless the adapter decision is reopened.
2. Repeating the passing current-user DPAPI, wrong/missing entropy, corruption,
   cross-process same-user, different-user, and separate-computer denial baselines on
   supported retail Windows profiles. The hosted baselines are complete.
3. Proving the Electron main/preload path can store, rotate, use, and delete a
   credential while the raw value remains absent from renderer globals, storage,
   DevTools-visible messages, arguments, logs, and diagnostics. The packaged and
   installed `safeStorage` path now passes the tested surfaces. Credential Manager
   or Tauri evidence is required only if the selected adapter or host is reopened.
4. Testing app crash between server token rotation and local credential replacement,
   revoked sessions, Windows password/account changes, backup/restore on the same
   user, restore on another user/computer, and keep-data/remove-all uninstall. The
   packaged and installed synthetic rotation-crash, revocation, sign-out,
   keep-data, and remove-all state machine now passes. The real API
   issue/refresh/revocation/restart/sign-out lifecycle also passes. Restore,
   account-change, and actual installer-choice evidence remain.
5. Recording ACL, roaming-profile, Remote Desktop, multiple Windows session, and
   locked-workstation behavior on supported retail Windows profiles.
6. Completing the supported Electron API, protected-file, dependency, license, and
   provenance review and accepting the authentication and credential-protection
   section of the Windows security ADR.

## Gallery or registry impact

No gallery or registry is required. Credential adapters are privileged native code
owned by the signed Windows host and cannot be installed from a community gallery.
