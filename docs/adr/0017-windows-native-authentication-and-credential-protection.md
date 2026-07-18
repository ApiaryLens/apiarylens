# ADR 0017: Windows Native Authentication and Credential Protection

## Status

Accepted design; experimental implementation exists but is not an end-user release

## Date

2026-07-17

## Deciders

Kristopher Turner, ApiaryLens project owner. Implementation authorized 2026-07-17.

## Context

The PWA uses same-origin opaque sessions in hardened cookies. A packaged Windows
client adds two different security contexts:

1. standalone mode needs a private, process-supervised local-service relationship
   without exposing reusable authority to React; and
2. connected mode needs to authenticate to a remote family backend while remaining
   usable offline and without saving a password or remote session in browser storage.

The Windows renderer is not an acceptable credential owner. XSS, navigation, an
untrusted child window, DevTools-visible state, or an overbroad preload API must not
turn into a reusable local or remote credential. The client also cannot require a
proprietary identity provider, a separate family IdP, Windows domain enrollment, or
cloud-only credential vault.

ADR 0010 remains authoritative for built-in accounts, opaque sessions, recovery,
server-side organization authorization, and optional OIDC. ADR 0016 proposes
Electron and a per-user Windows package. This ADR defines the native authorization
and durable credential boundary that composes those decisions.

## Decision

### Standalone authority

The Electron main process owns the standalone service lifecycle and a per-launch,
cryptographically random control capability. It passes that capability directly to
the child process through a process-scoped startup boundary, retains it in memory,
and never serializes it to configuration, readiness metadata, renderer storage,
logs, diagnostics, command output, or evidence.

The local service binds only to `127.0.0.1` on an operating-system-assigned port.
Readiness metadata contains process and version identity but grants no authority.
The main process owns authenticated loopback transport. React invokes a narrow,
schema-validated preload contract and receives domain/session results rather than
the control capability or an arbitrary HTTP primitive.

If a user enables an application lock, the real API stores only its normal salted
password verifier. The host never stores the user's password. Password-optional
standalone use remains valid only while the service is genuinely device-only and
loopback-only.

### Connected authorization

Connected sign-in uses an external system browser and the OAuth 2.0 Authorization
Code pattern with PKCE S256 and an ephemeral loopback redirect:

1. The main process creates a high-entropy verifier, challenge, state, and one-time
   authorization transaction and opens the backend's HTTPS authorization URL in the
   system browser.
2. The browser uses the backend's built-in account experience or an optional
   configured OIDC provider. The Windows renderer never collects the password.
3. The backend redirects one short-lived, single-use code to an ephemeral
   `127.0.0.1` listener owned by the main process. The listener accepts only the
   expected state and transaction, returns a minimal browser completion page, and
   closes immediately.
4. The main process exchanges the code and verifier over the backend's publicly
   trusted HTTPS endpoint. The code is bound to the client, redirect URI,
   organization selection where applicable, and PKCE challenge.
5. The backend returns a versioned opaque native session plus rotation metadata.
   The value is random, stored server-side only as the accepted protected digest,
   scoped to the account/organization/client channel, revocable, idle/absolute
   expiring, and never a self-contained JWT.
6. The main-process HTTP transport supplies the native session to API calls. React
   receives only a sanitized session view and server-authorized results.

Native opaque sessions use an authorization header rather than a browser cookie.
This avoids pretending a renderer cookie jar is secret and avoids cookie-based CSRF
semantics for native API calls. Authorization middleware must preserve the same
server-side organization, role, revocation, throttling, audit, and negative-test
boundary as browser sessions. It must not accept a client-provided organization as
authority.

The native authorization endpoints are part of ApiaryLens itself. Optional OIDC is
an upstream sign-in choice behind the same authorization transaction; the Windows
client does not store provider client secrets or become dependent on one provider.

### Credential protection

Electron `safeStorage` is the initial Windows adapter. The main process encrypts one
versioned, purpose-scoped envelope per durable credential and writes its ciphertext
under the protected current-user ApiaryLens data directory. ApiaryLens owns:

- current-user-plus-SYSTEM ACL creation and verification;
- traversal, symlink, junction, and reparse-point rejection;
- installation, environment, organization, account, and purpose binding;
- atomic replacement and a secret-free rotation journal;
- corruption and cross-purpose substitution rejection;
- explicit deletion during sign-out or remove-all; and
- diagnostics and support-bundle redaction.

The adapter surface is `store`, `load`, `replace`, and `delete` for a closed purpose
enum. It does not expose arbitrary targets, encryption, filesystem access, or raw
credentials to the renderer. Windows Credential Manager remains the measured
fallback if Electron, policy, storage, or host requirements reopen the adapter
decision. Tauri Stronghold is considered only if the host decision is superseded.
The product ships one credential adapter, not parallel stores with ambiguous
recovery behavior.

The following values remain memory-only:

- per-launch local control capability;
- PKCE verifier, state, authorization code, and redirect transaction;
- passwords, recovery codes, and CSRF values; and
- the active plaintext form of a protected session during an API operation.

Connection profiles may persist endpoint, organization, display, release, and
compatibility metadata. They contain no password, session, recovery code, control
capability, provider secret, or deployment credential.

### Rotation, revocation, and recovery

Session rotation is a two-phase host operation:

1. receive and protect the replacement;
2. atomically update the purpose journal and verify the replacement with the server;
3. retire the prior server session and protected value; and
4. commit the non-secret journal state.

Crash recovery resumes or safely abandons the journal without creating a plaintext
fallback. A revoked, expired, corrupt, unreadable, wrong-user, restored-on-another-
computer, or otherwise invalid credential preserves local hive data and pending
work, removes unusable session authority, and guides reauthentication or recovery.
Credential loss is never permission to delete data or weaken authorization.

Sign-out deletes the connected session and asks the server to revoke it. Account
recovery and password/security changes revoke applicable sessions. Keep-data
uninstall retains protected standalone/connection state only after clear consent;
remove-all deletes protected values, journals, database, media, and configuration.
A backup containing protected credentials is usable only under its documented
same-user/same-computer policy; portable data recovery must not depend on copying an
undecryptable Windows credential.

### Offline behavior

Loss of connectivity does not sign the user out or discard pending field work. The
client continues against its authorized local replica under the current Windows
account and records pending changes. On reconnection, the main process validates or
rotates the session before synchronization. An expired or revoked session pauses
remote sync, preserves pending work, and requests reauthentication. Offline state
never grants a server role or organization membership that the server has revoked.

## Options considered

### External browser, PKCE, opaque native session, and `safeStorage` — proposed

| Dimension | Assessment |
|---|---|
| Password exposure | Password stays in the external browser/backend experience |
| Renderer isolation | Renderer receives no reusable local or remote credential |
| Family deployment | Built-in accounts remain the default; OIDC stays optional |
| Offline use | Protected session and local replica survive normal restarts/outages |
| Recovery | Explicit rotation journal, revocation, and preserve-data failure path |
| Portability | Server contract and native credential port are framework-neutral |

This best matches the Windows host research, RFC 8252 direction, existing opaque
server-session model, and self-hosted-first requirement.

### Embedded renderer login with browser cookies

This reuses the PWA sign-in page but makes cookie/process separation ambiguous,
encourages privileged renderer transport, complicates OIDC external-user-agent
requirements, and expands the impact of XSS or navigation defects. Rejected for the
native connected client.

### Collect and submit account passwords through the native bridge

This avoids new authorization endpoints but puts passwords inside the application
renderer/bridge lifecycle, encourages password persistence, and cannot safely
generalize to OIDC or stronger future authentication. Rejected.

### Long-lived API key or self-contained JWT in configuration

This is simple to implement but weakens revocation, rotation, organization scope,
diagnostic redaction, and restore behavior. It conflicts with ADR 0010's opaque
session direction. Rejected.

### Windows Credential Manager as the initial store

The direct Windows API evidence is viable and remains a fallback. Under the proposed
Electron host it adds a native addon/ABI/signing/provenance boundary without a
measured security or family-experience advantage over main-process `safeStorage`.
Not selected initially.

## Scale, hosting, repository, and gallery impact

The native-session contract is organization-aware and uses the same indexed,
server-side session/authorization model for one family or a commercial apiary. It
does not assume one account, one organization, one Windows device, or a small hive
count. Session volume and throttling scale with authenticated clients rather than
domain records or media.

The built-in account path remains fully self-hosted and requires no external
identity, broker, email, SMS, vault, or analytics service. A future managed service
may implement the same public contract but receives no privileged client secret or
proprietary extension. Core owns the native authorization/session contracts and
Windows host adapter. Scout may install or connect the client but never receives or
persists the user's product session.

No community gallery or registry applies. Credential adapters and native bridge
operations are privileged signed product code and cannot be installed from a
community catalog. A future adapter change requires a reviewed release, compatible
protected-payload migration, rollback/recovery design, and a superseding ADR rather
than dynamic plugin loading.

## Consequences

- The backend gains explicit native authorization, code exchange, opaque native
  session, rotation, revocation, and audit contracts while retaining built-in
  accounts and optional OIDC.
- Browser-cookie and native-session transports share one server authorization and
  organization-isolation core but have separate CSRF/transport semantics.
- The Electron main/preload boundary becomes security-critical and requires narrow
  APIs, sender validation, sandboxing, context isolation, CSP/navigation controls,
  and negative tests.
- A user normally signs in through their system browser, which is more secure and
  standards-aligned but introduces a visible browser round trip.
- Ephemeral loopback redirect handling must account for local port races, state/code
  injection, cancellation, timeouts, multiple windows, and restrictive endpoint
  security products.
- Same-user malware and local administrators remain outside the app-only protection
  boundary. Documentation must not claim otherwise.
- Cross-device restore can restore data but cannot promise that a Windows-protected
  session remains decryptable. Guided reauthentication is first-class.
- Native session support is a new public security contract and requires versioning,
  compatibility metadata, threat review, and both cookie/native negative matrices.

## Acceptance conditions

This ADR may move to Accepted only after:

1. The owner accepts ADR 0016's host/package decision or a superseding host decision
   updates this adapter analysis.
2. A threat-reviewed native authorization contract defines endpoint schemas, PKCE
   S256, state/code lifetime and single use, loopback redirect validation, session
   digest/rotation/revocation, audit events, and generic error behavior.
3. Exact packaged and clean-installed tests prove the main/preload path keeps every
   generated control/session value out of renderer globals, storage, messages,
   console, arguments, logs, readiness, diagnostics, plans, and evidence.
4. Built-in-account and optional-OIDC flows use the external browser without a
   client secret and pass cancellation, timeout, replay, wrong-state, wrong-verifier,
   redirect-race, revoked-session, and cross-organization negatives.
5. Signed-package tests pass protected store/read/replace/corruption/delete,
   interrupted rotation, sign-out, recovery revocation, keep-data/remove-all,
   backup/restore, same-user reinstall, different-user/computer denial, and guided
   credential-loss recovery.
6. Supported retail profiles cover normal password change, administrator reset,
   Windows Hello PIN, local-to-Microsoft-account transition, Remote Desktop,
   multiple sessions, locked workstation, and applicable roaming policy.
7. Cookie and native transports pass the same API authorization, role, media,
   export, member-management, audit, throttling, and organization-isolation suites.
8. The Windows security design, user recovery guidance, privacy/diagnostics guide,
   public API contract, compatibility metadata, and authoritative Lucidchart export
   are synchronized.

The owner subsequently authorized implementation and the accepted design is included
in experimental builds. This acceptance does not authorize a Preview, Stable, or GA claim;
production signing remains a separate GA gate.

## Revisit conditions

Reopen this decision if Electron is not selected, `safeStorage` cannot meet a
supported Windows policy/profile, the external-browser loopback flow is materially
blocked by supported endpoint security, native sessions cannot share the accepted
authorization core without weakening it, or a stronger platform mechanism improves
security without adding a proprietary requirement. Any replacement must include a
credential/data migration and rollback path.

## References

- [Windows credential-protection research](../research/2026-07-16-windows-native-credential-protection-spike.md)
- [Windows client threat review](../security/windows-client-threat-model.md)
- [Authentication, authorization, and sharing](../security/authentication-and-sharing.md)
- [ADR 0010: Built-in identity and security](0010-built-in-identity-and-security.md)
- [ADR 0016: Electron Windows host and current-user package](0016-electron-windows-host-and-package.md)
- [RFC 8252: OAuth 2.0 for Native Apps](https://www.rfc-editor.org/rfc/rfc8252.html)
- [OAuth 2.0 PKCE](https://www.rfc-editor.org/rfc/rfc7636.html)
- [WIN-005](https://github.com/ApiaryLens/apiarylens/issues/8)
