# Task 007: Research Authentication and Identity Architecture

## Status

Architecture evidence completed 2026-07-15 and accepted through ADR 0010.
Implementation abuse, performance, and recovery tests remain release gates.

## Goal

Recommend the simplest secure authentication architecture that supports a
password-optional device-only experience, safe family cloud deployment, future
native clients, and optional organization identity federation without making an
external identity provider mandatory.

## Fixed Requirements

- No-auth operation is allowed only when no service is reachable beyond the device.
- LAN, VPN, tunnel, and public-cloud access require authentication and encrypted
  transport; credentials and session material never cross a network over plaintext.
- Public access requires normal publicly trusted HTTPS.
- A family must not need to operate a separate identity provider or buy an email,
  SMS, identity, or secrets service.
- The platform remains self-hosted, provider-neutral, privacy-first, and functional
  when OIDC is absent.
- Authorization and organization isolation are enforced by the API, not trusted to
  the PWA or identity provider.

## Questions to Answer

- Which proven framework or library can safely provide built-in accounts, sessions,
  invitations, recovery, and password hashing for each backend candidate?
- How is the first owner created and recovered without default credentials or a
  mandatory email provider?
- What is the safest same-origin browser session design for the offline PWA?
- What may remain available offline after session expiry or server-side revocation?
- Are passkeys appropriate for MVP or a later phase, and how do recovery and device
  portability work?
- How will future iPhone and other native clients use Authorization Code with PKCE?
- Does ApiaryLens need an authorization-server component, or can a narrower
  connection/bootstrap design meet the native-client requirement?
- How are local accounts linked, migrated, or disabled when OIDC is enabled?
- How are organization membership, roles, invitations, public links, and audit
  events represented and tested?

## Options to Evaluate

1. Built-in ApiaryLens accounts and sessions as the default, plus an optional OIDC
   relying-party adapter.
2. A bundled self-hosted identity provider for every server deployment.
3. External OIDC only.
4. A split model by deployment profile, including its migration and support burden.

For optional OIDC compatibility, test current supported releases of at least
Keycloak, authentik, and ZITADEL. Also test a generic standards-conformant provider
configuration. Candidate inclusion is not endorsement or a decision to bundle it.

## Evaluation Criteria

- Security properties and misuse resistance
- Setup, recovery, upgrade, backup, and diagnostic experience
- Idle memory, CPU, storage, and service count on the family reference footprint
- Open-source license and project health
- Offline PWA and multi-device behavior
- Native-app PKCE compatibility
- OIDC interoperability and account-linking behavior
- Multi-organization authorization boundaries
- Secret rotation and incident recovery
- Accessibility and usability for non-technical users
- Portability and exit path
- Testing and long-term maintainer burden

## Required Evidence

- Dated primary documentation and license sources
- Working prototypes against the leading backend candidates
- Measured family-profile resource use
- Abuse cases and threat model
- Authentication, recovery, revocation, tenant-isolation, and offline test cases
- Lucid authentication and trust-boundary flows with public exports

## Outputs

- Research report under `docs/research/`
- ADR selecting the authentication/session and optional federation architecture
- Follow-up ADR list for authorization, HTTPS, secrets, and native-client connection
- Updates to the master plan, deployment schema, test strategy, and Scout Bee design
- Operator guidance for device-only, LAN, and internet-facing modes
