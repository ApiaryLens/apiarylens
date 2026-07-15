# ADR 0010: Built-in Identity, Sessions, and Authorization

## Status

Accepted

## Date

2026-07-15

## Acceptance

Accepted under the project owner's delegated MVP implementation authority.

## Context

A family must be able to secure an internet-reachable deployment without buying or
operating an identity provider, email service, SMS service, or secrets platform.
The offline PWA must not place reusable bearer credentials in browser storage, and
the API must enforce organization isolation even when the client is compromised.

## Decision

The MVP provides local ApiaryLens accounts as the default identity system.

- The first-run endpoint permits exactly one initial owner bootstrap when no active
  owner exists. It has no default credentials, is rate limited, and closes
  atomically after success.
- Passwords are hashed with PBKDF2-HMAC-SHA-256 through Web Crypto, using a unique
  random salt, a server-side pepper derived with domain-separated HMAC from an
  operator-generated authentication root secret, and a stored work-factor/version
  record. Session identifiers use a separate HMAC domain derived from the same root;
  the root itself is never stored in the database. The
  preferred target is 600,000 iterations, but Cloudflare's deployed Web Crypto
  runtime rejects a single PBKDF2 request above 100,000 iterations. The portable MVP
  parameter is therefore 100,000 iterations, recorded in every hash, with long
  passwords, generic errors, throttling, and recovery controls as compensating
  defenses. A stronger portable memory-hard construction remains a post-MVP security
  upgrade and requires a new measured compatibility decision.
- Recovery uses one-time high-entropy recovery codes shown to the owner once and
  stored only as hashes. It does not depend on email. Regeneration revokes the
  previous set and creates an audit event.
- The browser receives an opaque, rotating session identifier only in an `HttpOnly`,
  `Secure`, `SameSite=Strict` cookie. The database stores a keyed hash, never the
  bearer value. Sessions have idle and absolute expiry and can be revoked per
  device or account.
- Same-origin deployment is the default. State-changing requests validate origin,
  content type, and an anti-CSRF token bound to the session. CORS is denied unless a
  specifically documented native or integration profile enables it.
- Sign-in, bootstrap, invitation, recovery, and expensive endpoints have generic
  errors, account/IP-aware throttling, bounded request bodies, and audit events.
- Authorization is evaluated on every protected API and media request from the
  authenticated user, active membership, organization ID, role, action, and target.
  Client-provided organization IDs never establish access.

The MVP roles are Owner, Beekeeper, and Viewer. Permissions are explicit
capabilities rather than scattered role-name checks. Admin, Apiary Manager,
Inspector, Mentor, club, research, and commercial role templates remain later
extensions over the same capability model.
Owner-only actions include ownership transfer, recovery-code rotation, complete
export, organization deletion, and security-policy changes.

No-auth mode remains limited to a later loopback-only device profile. Scout Bee and
server startup reject no-auth network exposure, plaintext credential exchange,
missing production secrets, and default values. Internet profiles require publicly
trusted HTTPS. LAN deployments require authentication and encrypted transport.

Optional OIDC federation, passkeys, public links, and native-app Authorization Code
with PKCE are post-MVP extensions. Their absence does not weaken or disable local
accounts. Any later federation adapter maps into the same users, memberships,
sessions, and authorization checks.

## Secret Boundaries

Product configuration consumes provider-neutral environment or mounted-file
secret references. Cloudflare Worker secrets and Compose secret files are supported
adapters. HCS Key Vault, an ApiaryLens-specific maintainer Key Vault, Azure test
subscriptions, and maintainer Cloudflare credentials are test operations only and
are never required by a user deployment.

## Consequences

- A secure family deployment has no identity-service dependency or identity bill.
- The authentication root secret becomes a critical backup/rotation input. Scout Bee
  creates it with operating-system randomness on first install, Cloudflare stores it
  as a Worker secret, and Compose mounts it as a mode-600 Docker secret. Its loss has
  documented recovery behavior and its value never enters export, logs, diagnostics,
  or deployment-plan JSON. Existing release-candidate password and session hashes
  remain readable during upgrade, while all newly written values use the keyed format.
- Password work factor is a measured release parameter. If Cloudflare cannot meet
  the security and latency gates, the family profile fails its acceptance gate
  rather than silently weakening password storage.
- Every repository method and API conformance test includes cross-organization
  negative cases.

## References

- [Authentication and sharing design](../security/authentication-and-sharing.md)
- [Security architecture](../security/security-architecture.md)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html)
