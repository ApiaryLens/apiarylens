# MVP Threat Model and ASVS Verification Map

**Release scope:** ApiaryLens 0.1.0-rc.3

**Review date:** 2026-07-16

**Standard:** OWASP Application Security Verification Standard 5.0.0  
**Status:** Engineering verification complete; independent/manual release review pending

This document covers the installable PWA, Hono API, Node/SQLite Compose profile,
Cloudflare Worker/D1/R2 profile, deployment bundles, and Scout Bee. It is a
release-scope engineering assessment, not an OWASP certification or a substitute
for the remaining manual penetration and deployment review.

## Assets and Trust Boundaries

Protected assets are account credentials, opaque sessions, recovery codes, family
membership and authorization state, hive records, pending offline changes, original
photos, backups, exports, deployment secrets, release artifacts, and audit evidence.

The important boundaries are:

1. The browser and IndexedDB workspace are controlled by an authenticated user but
   remain exposed to loss, theft, extensions, and same-origin script compromise.
2. Every network request crosses the authenticated HTTPS API boundary. The server,
   not the browser, establishes organization and role scope.
3. D1/R2 and SQLite/filesystem storage are private implementation boundaries. Media
   is never addressed by a public storage URL.
4. Scout Bee accepts secrets only at execution time. Plans, diagnostics, and logs
   are untrusted for secret storage.
5. Release downloads cross the public distribution boundary and therefore require
   immutable names, digests, provenance, and an approved signature before release.

## Threat Assessment

| Threat | Principal control | Verification evidence | Residual release work |
|---|---|---|---|
| Credential guessing or account discovery | Generic failures, password hashing, throttling, no default credential | API and database authentication tests | Manual timing and rate-limit review |
| Session theft or request forgery | Opaque HttpOnly Secure SameSite cookies, expiration, CSRF token on mutations, recovery revocation | API session, CSRF, sign-out, and recovery tests | Browser/device session review |
| Cross-family data access | Organization ID comes only from the authenticated session; every query and media key is scoped server-side | Negative resource, change, member, media, export, and database tests; [route audit](../testing/authorization-and-exposure-audit-2026-07-16.md) | Re-smoke the next immutable candidate on both deployed profiles |
| Role escalation | Server-side permission map for membership, mutation, media, export, backup, and operator actions | Viewer and operator-boundary negative tests; [route audit](../testing/authorization-and-exposure-audit-2026-07-16.md) | Re-smoke the next immutable candidate after deployment |
| Offline loss, duplication, or unsafe merge | Durable IndexedDB outbox, client IDs, idempotency, explicit conflict states, retry | Database, sync, conflict, and relaunch tests | Required multi-device interruption UAT |
| Malicious or corrupt media | Allowlisted image types, size ceilings, SHA-256 integrity, private storage, sanitized download names | API media integrity and authorization tests | Browser format/quota matrix |
| Backup or restore tampering | Versioned archive identity, migration compatibility check, operator-only endpoint, session revocation | Local recovery test and operator negative tests | Isolated Cloudflare destructive restore UAT |
| Deployment-secret disclosure | Secret-free plan schema, runtime acquisition, redacted diagnostics, no URL credentials | Scout unit tests and source secret scan | Host-level log/diagnostic inspection |
| Supply-chain substitution | Content-addressed bundles, remote digest verification, SBOM, license report, clean provenance | Release verification scripts and live download verification | Approved artifact/provenance signatures |
| Unsafe public exposure | HTTPS requirement, no-auth refusal, hardened containers, internal backend network | Scout preflight tests and Compose configuration review | Hyper-V and cloud-VM exposure UAT |
| Denial of service or quota exhaustion | Bounded sync pages/batches, upload limits, sign-in throttling, documented quotas | Unit validation and contract limits | Cloudflare quota/failure UAT and resource measurements |

## OWASP ASVS 5.0.0 Mapping

`Implemented` means code and automated evidence exist. `Partial` means the release
still requires manual or deployed-environment evidence. `Not applicable` is limited
to technology that is intentionally absent from the MVP. Requirement identifiers
are version-qualified because OWASP notes that identifiers can change between ASVS
versions.

| ASVS chapter | Status | ApiaryLens evidence and disposition |
|---|---|---|
| v5.0.0-V1 Encoding and Sanitization | Implemented | Zod input schemas, parameterized SQLite/D1 statements, safe CSV and filename encoding; manual injection review remains part of the final security gate. |
| v5.0.0-V2 Validation and Business Logic | Partial | Versioned contracts, state validation, idempotency, conflicts, bounded operations; deployed abuse and quota cases remain open. |
| v5.0.0-V3 Web Frontend Security | Partial | Restrictive security headers, no telemetry, safe service-worker update handling, accessible controls; manual CSP/browser-storage review remains open. |
| v5.0.0-V4 API and Web Service | Partial | Versioned OpenAPI, authenticated scope, request IDs, bounded pagination and uploads; cross-profile deployed conformance remains open. |
| v5.0.0-V5 File Handling | Partial | Image allowlist, byte limits, digest checks, private media, safe names; device-format and malicious-file testing remains open. |
| v5.0.0-V6 Authentication | Implemented | Built-in password accounts, bootstrap closure, generic failure, throttling, invitation, recovery, no required third party. |
| v5.0.0-V7 Session Management | Implemented | Opaque server sessions, hardened cookies, idle/absolute expiry, CSRF rotation, sign-out and recovery revocation. |
| v5.0.0-V8 Authorization | Implemented | Server-side roles and organization scoping with negative tests for records, media, exports, membership, and operator routes. |
| v5.0.0-V9 Self-contained Tokens | Not applicable | Browser authentication does not use JWT or another self-contained bearer token. Enrollment and recovery values are one-time opaque tokens. |
| v5.0.0-V10 OAuth and OIDC | Not applicable | OAuth/OIDC federation is explicitly post-MVP. |
| v5.0.0-V11 Cryptography | Partial | Platform CSPRNG, SHA-256 integrity, password hashing, HTTPS; independent algorithm/configuration review remains open. |
| v5.0.0-V12 Secure Communication | Partial | Public properties use HTTPS and networked Compose terminates TLS with Caddy; LAN/public certificate and downgrade tests remain environment-dependent. |
| v5.0.0-V13 Configuration | Partial | No defaults or telemetry, read-only containers, dropped capabilities, private backend network, secret-free templates; deployed host review remains open. |
| v5.0.0-V14 Data Protection | Partial | Private storage, scoped exports/backups, no default egress, deletion paths; retention and device-loss UAT remains open. |
| v5.0.0-V15 Secure Coding and Architecture | Partial | Accepted ADRs, strict TypeScript, dependency audit, immutable migrations, recovery verification, a SHA-pinned CI verification workflow, local secret scan, clean Compose builds, and checksum-pinned Grype scans with no high or critical findings in either Compose runtime image. |
| v5.0.0-V16 Security Logging and Error Handling | Partial | Request IDs, generic client errors, audit-event foundation, sanitized Scout diagnostics; operator audit review and retention evidence remain open. |
| v5.0.0-V17 WebRTC | Not applicable | ApiaryLens MVP does not use WebRTC. |

The stable ASVS reference is maintained by the
[OWASP ASVS project](https://owasp.org/www-project-application-security-verification-standard/).
Any future verification record must preserve the `v5.0.0-` prefix when citing
individual requirements.

## Release Decision

No known automated dependency or container-image finding is currently high or
critical, and the documented negative authorization suite passes. The release
security gate remains open until the manual checks in the mapping and deployed
cross-profile conformance are completed, and any resulting critical or high findings
are resolved or explicitly dispositioned by the project owner.
