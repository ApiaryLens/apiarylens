# Identity, Offline, and Deployment Research Spike

## Status

Architecture decision evidence complete on 2026-07-15. Abuse, performance, and
recovery measurements remain release gates and are recorded by automated tests and
the MVP evidence report.

## Questions

- Can a family use secure accounts without an external identity service?
- How can the PWA retain useful offline work without storing reusable browser bearer
  tokens?
- What installer shape provides a friendly React experience and a safe local
  executor?

## Identity Findings

OWASP currently prefers Argon2id, then scrypt, and specifies PBKDF2-HMAC-SHA-256 at
600,000 iterations when PBKDF2 is used. Cloudflare Workers and current browsers
provide Web Crypto PBKDF2, giving both server profiles the same audited primitive.
The Worker CPU allowance makes a measured benchmark mandatory; security parameters
are not reduced merely to fit a free tier.

OWASP session guidance and browser security guidance support opaque server-side
sessions in Secure, HttpOnly, SameSite cookies rather than reusable authentication
tokens in local storage. Same-origin PWA/API hosting removes normal cross-origin
complexity. Offline writes continue in IndexedDB under the last authorized local
workspace, but reconnect requires a live session before push/pull. Local cached data
is protected primarily by the device account and storage controls; the UI warns
that signing out does not securely erase every OS/browser copy unless the user also
clears local data.

A mandatory Keycloak, authentik, ZITADEL, or commercial identity account would add
an entire service or third-party dependency for a family. OIDC remains valuable for
organizations and is kept as an optional relying-party adapter after MVP.

Primary sources checked 2026-07-15:

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [MDN secure cookie configuration](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies)
- [Cloudflare Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html)

## Offline Findings

An offline-capable app needs three distinct layers:

1. a cached, versioned application shell;
2. an IndexedDB replica and mutation/media outbox; and
3. an explicit sync protocol with idempotency, versions, cursors, tombstones, and
   conflicts.

Service-worker update activation must wait until in-progress UI work is durably in
IndexedDB. A client with pending operations can update only when its local schema
and sync contract remain compatible; otherwise it keeps the old worker and explains
the required recovery/export path.

## Scout Bee Findings

| Option | Result |
|---|---|
| Browser-only installer | Cannot safely perform local/SSH deployment; rejected |
| PowerShell-only scripts | Useful operator fallback but not the requested cross-platform React guide; retained as support tooling only |
| Electron/Tauri-style desktop shell | Good UI but larger runtime or extra toolchain/signing complexity for the MVP executor; deferred |
| Go loopback executor with embedded React UI | Single binary, explicit privilege boundary, easy SSH/process control, auditable deployment-plan contract; selected |

Scout does not become a new deployment engine. It applies the same versioned
release bundles, Wrangler configuration, Compose files, migrations, backup tools,
and health checks that operators can use directly.

## Security Abuse Cases

- Cross-organization identifiers must return no protected object or media.
- Replayed sync operations must return their prior result without a duplicate.
- Concurrent edits must not silently overwrite treatment or inspection data.
- Stolen database rows must not reveal passwords, session tokens, or recovery codes.
- Untrusted plan values must not become shell text or escape approved directories.
- Diagnostics and exported plans must never include credentials.
- No-auth configuration must fail on non-loopback bindings.
- Public HTTP, missing production secrets, weak/default secrets, and untrusted
  release artifacts must fail closed.

## Decision

Adopt ADR 0010 and ADR 0011. Optional OIDC, passkeys, native-client PKCE, public
links, and provider-specific VM provisioning remain compatible post-MVP work.

