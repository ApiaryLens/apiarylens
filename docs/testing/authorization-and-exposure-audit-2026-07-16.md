# Authorization and Exposure Audit — 2026-07-16

**Release line:** ApiaryLens 0.1.0 release candidate

**Profiles:** Node/SQLite/Filesystem Compose and Cloudflare Worker/D1/R2

**Result:** Engineering pass; no open critical or high finding

**Deployment status:** The next content-addressed candidate must repeat the deployed
smoke checks after these contract and conformance changes are packaged.

## Scope and Method

This review inventories every HTTP route in both API implementations, traces its
authentication, CSRF, role, organization, and storage boundary, and exercises the
boundaries through the public Hono request path. It also compares the published
OpenAPI document with the implemented portable routes and reviews the externally
reachable services in both deployment profiles.

The negative suites create a second family containing records and private media,
then use a valid session from the first family to attempt collection reads, direct
record lookup, change pull, record mutation, original and thumbnail media mutation,
media deletion, member listing, and full export. They verify both denial behavior
and that the foreign record and object remain unchanged. A separate case revokes an
active membership and verifies that its existing session is rejected.

## Route Inventory

| Route group | Access boundary | Organization or deployment scope | Mutation protection | Profile parity |
|---|---|---|---|---|
| `GET /health`, `GET /api/v1/openapi.json` | Public by design | No protected data | Read only | Yes |
| `GET /api/v1/bootstrap/status` | Public by design | Reports availability only | Read only | Yes |
| `POST /api/v1/bootstrap` | Public claim endpoint; optional deployment code; one atomic owner claim; throttled | Creates the first family only | Runtime validation and closed-after-claim invariant | Yes |
| `POST /api/v1/auth/sign-in` | Public credential endpoint; generic failure; throttled | Server selects an active membership | Password verification and opaque secure cookie | Yes |
| `POST /api/v1/invitations/accept` | Public one-time opaque token; throttled | Invitation supplies the server-stored family | Expiry and single-acceptance checks | Yes |
| `POST /api/v1/auth/recover` | Public identifier plus one-time recovery code; throttled | User account and its sessions | Code consumption, password replacement, session revocation | Yes |
| `GET /api/v1/session` | Valid active membership session | Family is derived from the session | Rotates opaque session and CSRF values | Yes |
| `POST /api/v1/auth/sign-out` | Valid session | Current session only | CSRF and server-side revocation | Yes |
| `GET /api/v1/members` | `members:read` | Query binds the session family | Read only | Yes |
| `POST /api/v1/invitations` | `members:manage` | Insert binds the session family and actor | CSRF | Yes |
| `POST /api/v1/sync/push` | Write-capable role | Idempotency, lookup, resource, change, and media keys bind the session family | CSRF, schema validation, version conflict, idempotency | Yes |
| `GET /api/v1/sync/pull` | Valid session | Change query binds the session family | Bounded cursor page | Yes |
| `GET /api/v1/resources/:type` | Valid session | Collection query binds the session family | Read only | Yes |
| `GET /api/v1/resources/:type/:id` | Valid session | Object lookup binds family, type, and ID | Deleted records return not found | Yes; Cloudflare parity added by this audit |
| `PUT /api/v1/media/:id/content` | `media:write` | Metadata lookup and object key bind the session family | CSRF, size/type/digest validation | Yes |
| `PUT /api/v1/media/:id/thumbnail` | `media:write` | Metadata lookup and object key bind the session family | CSRF, JPEG and size validation | Yes |
| `GET /api/v1/media/:id/content` | `media:read` | Metadata lookup and private object key bind the session family | Read only; no public R2/filesystem URL | Yes; explicit Cloudflare permission check added by this audit |
| `DELETE /api/v1/media/:id/content` | `media:write` | Metadata lookup and original/thumbnail keys bind the session family | CSRF | Yes |
| `GET /api/v1/export/full` | `export:complete` | Every record query and media key binds the session family | Private, no-store ZIP response | Yes |
| Worker `GET /api/v1/operator/backup` and `POST /api/v1/operator/restore` | Concealed unless a short-lived Scout operator bearer value is configured and exactly matches | Whole isolated deployment, not a browser family route | Returns 404 on absent/wrong token; restore validates archive before writes and revokes sessions | Cloudflare-only lifecycle boundary; Compose uses SSH-local Scout operations |

The OpenAPI document now includes bootstrap status, recovery, session rotation,
sign-out, members, direct record lookup, and thumbnail upload. Public identity
operations explicitly declare no browser-session requirement; protected mutations
declare both browser session and CSRF security.

## Exposure Review

| Profile | Intended public listeners | Private services and storage | Evidence |
|---|---|---|---|
| Compose | Caddy HTTP/HTTPS on configured ports; SSH is an operator-controlled host service | API port 3000 has no host publication and runs only on the internal backend network; SQLite, originals, secrets, and Caddy state are volumes | Approved Hyper-V target exposed only host ports 22, 80, and 443; API 3000 was not published and anonymous media was rejected |
| Cloudflare | One HTTPS Worker route for the family PWA/API | D1 and R2 are bindings with no public bucket URL; operator routes are normally concealed | Isolated UAT rejected anonymous media and invalid operator access; production disables `workers.dev` and preview URLs |
| Scout Bee | Random loopback-only Windows listener during an operator run | Plans are secret-free; credentials are acquired only at execution | Source binds `127.0.0.1:0`; 22 diagnostic bundles contained no exact runtime credential, private key, or user identifier match |

## Automated Evidence

- `apps/api/src/app.test.ts`: Node HTTP conformance, cross-family reads and writes,
  viewer denial, private media, export, session rotation, recovery, and revoked-member
  rejection.
- `apps/worker/src/index.test.ts`: in-memory D1/R2 HTTP conformance for the same
  cross-family boundaries, revoked-member rejection, generic error handling, and the
  concealed operator boundary.
- `packages/database/src/store.test.ts`: compound organization keys and negative
  list/direct lookup behavior.
- `packages/contracts/src/contracts.test.ts`: viewer permission denial and published
  route/security contract.
- `scout-bee-cloudflare-lifecycle-2026-07-15.json` and
  `scout-bee-hyperv-compose-lifecycle-2026-07-16.json`: deployed anonymous, viewer,
  operator, exposure, diagnostics, backup, and restore checks.

Targeted suites passed after the audit changes: contracts 9 tests, Node API 15 tests,
and Cloudflare Worker 10 tests. Complete workspace verification also passed on
2026-07-16: formatting, lint, type checks, all TypeScript tests, Go tests, production
builds, Worker dry-run bundle, and backup/restore verification.

## Findings and Disposition

1. **Closed — Cloudflare direct-record route parity.** Added the same
   family-scoped `GET /resources/:type/:id` behavior as the Node profile and covered
   foreign and deleted records.
2. **Closed — explicit Cloudflare media-read permission.** Added the same
   `media:read` role check used by Node before the organization-scoped metadata and R2
   lookup.
3. **Closed — incomplete OpenAPI route/security declaration.** Added the implemented
   identity, membership, direct-resource, and thumbnail routes; corrected public and
   CSRF security declarations.
4. **Closed — Cloudflare negative-test evidence gap.** Added an actual D1/R2-backed
   request test rather than relying on inspection of SQL predicates.
5. **Open release action — package and redeploy.** These fixes change application and
   contract bytes. Build, sign, publish, deploy, and smoke-test the next immutable
   candidate before final acceptance.

Manual keyboard, screen-reader, zoom, forced-colors, physical-device offline/update,
and project-owner acceptance remain separate release gates. They are not findings
from this route and exposure audit.
