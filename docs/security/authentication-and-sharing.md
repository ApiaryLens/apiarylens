# Authentication, Authorization, and Sharing

## Status

Current MVP architecture. ADR 0010 accepts the built-in account, session,
organization-authorization, and recovery design. Optional OIDC, passkeys, public
links, and native-client authorization remain later decisions.

## Security Boundary

Authentication requirements are determined by who can reach the installation, not
by whether it is described as local, self-hosted, or cloud-hosted.

| Exposure mode | Reachability | Authentication rule |
|---|---|---|
| Device-only | Browser-local storage or a service bound only to loopback on one device | A password may be omitted; the device and operating-system account are the security boundary |
| Networked | Reachable from a LAN, VPN, private tunnel, or another device | Authentication and encrypted transport are mandatory |
| Internet-facing | Reachable from the public internet, including a cloud deployment | Authentication and trusted HTTPS are mandatory |

An installation must never silently change from device-only to network-reachable
while authentication is disabled. Binding a no-auth service to `0.0.0.0`, a LAN
address, a tunnel, or a public interface is an invalid configuration.
Credentials and session material must never cross a network over plaintext.

## Identity Model

ApiaryLens should support two server identity paths without making a separate
identity server part of the family installation.

### Built-in accounts

Built-in local accounts are the accepted default for family and small self-hosted
deployments. They provide multiple users, invitations, recovery, sessions, and
roles within ApiaryLens. This is application authentication, not an attempt to
build a general-purpose identity provider.

The first-run flow creates the first owner securely. There are no default
credentials. The default recovery path must work without an email provider or any
other required external account. Passkeys may be added after browser, device,
recovery, and self-hosting behavior is researched.

### Optional OIDC federation

Organizations may connect an OpenID Connect provider for centralized identity,
single sign-on, and stronger enterprise policy. OIDC remains optional: a family
must not need to install or administer Keycloak, authentik, ZITADEL, or a managed
identity service to use ApiaryLens.

The identity-provider comparison is research input, not a product selection. The
core must remain standards-based and portable, and disabling an external provider
must not make the installation or its data unrecoverable.

## Sessions and Credentials

The accepted session and credential design includes:

- PBKDF2-HMAC-SHA-256 through Web Crypto with a unique salt, an HMAC-domain-separated
  server pepper derived from the deployment authentication root, versioned
  parameters, and a portable MVP work factor of 100,000 iterations. Opaque session
  identifiers use a separate keyed HMAC domain rather than a plain database digest. The
  value is the deployed Cloudflare Web Crypto maximum observed in UAT; it is lower
  than the preferred target and is paired with throttling, long-password support,
  generic errors, and a planned memory-hard upgrade.
- Current password guidance, breached-password checks that preserve privacy, and
  no arbitrary composition rules
- Same-origin PWA sessions using `HttpOnly`, `Secure`, and appropriate `SameSite`
  cookies rather than long-lived bearer tokens in browser storage
- CSRF protection, session rotation, revocation, idle and absolute expiration, and
  reauthentication for sensitive operations
- Generic authentication errors, throttling, audit events, and protection from
  automated attacks without creating an easy denial of service
- Recovery codes or an operator recovery workflow that does not depend on a paid
  email or SMS service
- No credentials, reset tokens, session tokens, or secrets in logs, URLs,
  diagnostics bundles, deployment plans, or source control

Offline use must have an explicit policy for an expired or revoked session and for
protecting locally cached data. Pending field work must not be discarded merely
because the server cannot be reached.

The proposed native client authorization flow uses OAuth 2.0 Authorization Code with
PKCE through an external user-agent, an ephemeral loopback redirect, and an opaque
native session owned by the host rather than the renderer. The built-in account path
and optional OIDC path converge on that ApiaryLens authorization transaction. See
ADR 0017 in the ApiaryLens design record (private, see
[docs/RELOCATED.md](../RELOCATED.md)).

## Organization and Authorization Model

Use organizations and memberships from the beginning so the same model supports a
family, mentor relationship, bee club, research group, or commercial team.

MVP roles are:

- Owner
- Beekeeper
- Viewer

Admin, Apiary Manager, Inspector, Mentor, club, research, and commercial role
templates are later extensions over the same capability model.


Roles are convenience groupings, not the authorization boundary. Server-side
permissions must govern each organization-scoped operation, including viewing,
editing, inspections, media, member management, sharing, export, and administration.
Every query and object lookup must enforce organization isolation; a client-provided
organization identifier is never sufficient authorization.

## Sharing

Private family and team sharing comes first. Mentor, club, and public read-only
sharing are later capabilities. Public links must be unguessable, narrowly scoped,
revocable, expiring where appropriate, and unable to reveal precise apiary locations
or other sensitive data by default.

## Implementation and Verification Work

Implement ADR 0010 and verify hashing cost, bootstrap races, session rotation,
recovery, throttling, CSRF/origin controls, role capabilities, and cross-organization
negative cases. See the broader [Security Architecture](security-architecture.md)
for transport, secrets, software-supply-chain, and release requirements.

## Standards Baseline

- [OWASP Application Security Verification Standard 5.0](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [NIST SP 800-63B-4, Authentication and Authenticator Management](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [RFC 8252, OAuth 2.0 for Native Apps](https://www.rfc-editor.org/rfc/rfc8252.html)
