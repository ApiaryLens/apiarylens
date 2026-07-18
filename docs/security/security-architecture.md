# Security Architecture

## Status

Current security architecture and mandatory outcomes. ADR 0010 selects the MVP
identity/session boundary. Threat modeling, the ASVS verification matrix, runtime
measurements, and supply-chain evidence remain release gates.

## Security Objective

ApiaryLens stores potentially sensitive apiary locations, hive health, photos,
production records, user identities, and organization data. It must be safe enough
to expose through a properly configured internet deployment while remaining simple
for a beekeeper to operate and fully functional without a proprietary security
service.

Secure defaults are part of ease of use. A user should not need to understand
cryptography, tokens, certificates, or identity-provider administration to obtain a
safe supported configuration.

## Trust and Exposure Rules

- Device-only mode may omit an application password only when its data and services
  cannot be reached from another device. The device and operating-system account
  are then the security boundary.
- Any LAN, VPN, tunnel, or public reachability requires authentication and encrypted
  transport. Credentials and session material must never cross a network over plaintext.
- Internet-facing and remote-access profiles require normal publicly trusted HTTPS.
  Plain HTTP is not a supported networked deployment.
- Scout Bee and server startup validation must reject or clearly stop unsafe
  combinations such as no authentication on a non-loopback interface, default
  credentials, missing production secrets, or public HTTP.
- The family profile uses safe built-in accounts by default. Operating a separate
  identity provider is an advanced, optional path.

See [Authentication, Authorization, and Sharing](authentication-and-sharing.md).
The proposed packaged Windows boundary is reviewed separately in the Windows
Client Security Boundary and Threat Review, part of the ApiaryLens design record
(private, see [docs/RELOCATED.md](../RELOCATED.md)).

## Control Areas

### Identity and authorization

- Secure first-owner bootstrap with no shared or default password
- Server-enforced organization isolation and least privilege
- Secure session, recovery, invitation, revocation, and audit behavior
- Optional standards-based OIDC federation without a cloud-only dependency
- OAuth Authorization Code with PKCE and an external user-agent for future native
  clients

### Transport, network, and deployment

- Loopback-only binding for no-auth device service
- Minimal published ports and deny-by-default network guidance
- Trusted TLS automation for public hosts and documented private-network options
- Reverse-proxy trust, forwarded-header, origin, CORS, and host validation
- Rate limits and abuse controls appropriate to small hardware
- Containers run as non-root with least privilege, health checks, read-only
  filesystem areas where practical, and explicit persistent volumes

### Secrets and cryptographic material

- Cryptographically strong secrets generated during installation; no default values
- Provider-neutral inputs through environment variables, mounted files, or Docker
  secrets, with optional external secret-manager adapters
- Secrets excluded from deployment-plan JSON, command history where practical,
  logs, diagnostics, backups unless encrypted, and source control
- Documented rotation and recovery for signing, session, database, OIDC, API, and
  integration credentials
- No home-grown cryptographic algorithms or token formats

### Data protection and privacy

- No telemetry, analytics, or data egress by default
- Minimize precise location disclosure and redact sensitive fields from logs
- Explicit authorization for data, media, backup, export, and public-link access
- Documented database, media, and backup protection for each deployment profile
- Encryption in transit and clear operator guidance for storage encryption and
  encrypted off-device backups
- Safe deletion, retention, export, restore, and device-loss behavior

### Secure engineering and supply chain

- Threat model each major trust boundary before dependent implementation
- Use applicable OWASP ASVS 5.0 requirements as development and verification input
- Peer review security-sensitive changes and add negative authorization tests
- Automated secret scanning, dependency review, static analysis, and container
  vulnerability scanning in CI
- Pin and regularly update dependencies and base images; document supported versions
- Generate an SBOM for releases
- Sign release artifacts and container images, publish checksums and provenance, and
  document verification
- Protect release credentials and keep maintainer signing systems outside the public
  product runtime
- Use private vulnerability reporting and publish a supported-version/security-fix
  policy before the first stable release

## Required Security Design Artifacts

Before an internet-facing family profile is called supported, the repository must
contain:

1. A Lucid system trust-boundary and data-flow diagram with a public accessible export.
2. A threat model covering the PWA, API, synchronization, media, database, backups,
   Scout Bee, update path, public demo, and optional external providers.
3. Accepted ADRs for authentication/session architecture, authorization and tenant
   isolation, public HTTPS, secrets, and release signing/provenance.
4. A versioned security requirements and verification matrix derived from the
   applicable ASVS controls.
5. Security test cases and release gates in the public test strategy.

## Initial Risk Register

| Risk | Likelihood | Impact | Level | Primary mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| No-auth installation becomes network reachable | Medium | High | High | Loopback-only invariant; Scout Bee and startup rejection | Core maintainers | Open |
| Weak or confusing family authentication causes account compromise | Medium | High | High | Built-in secure defaults, throttling, recovery design, security tests | Identity design owner | Open |
| Cross-organization authorization failure exposes hive or location data | Medium | High | High | Server-side isolation, deny-by-default permissions, negative tests | API/data owners | Open |
| Tokens or deployment secrets leak through logs, plans, or source | Medium | High | High | Secret references, redaction, scanning, rotation runbook | Release/operations owners | Open |
| Vulnerable dependency or build pipeline compromises releases | Medium | High | High | Review, scanning, SBOM, signing, provenance, protected release credentials | Release maintainers | Open |
| TLS or reverse-proxy misconfiguration exposes credentials | Medium | High | High | Supported HTTPS profiles, validation, secure headers, deployment tests | Deployment owner | Open |
| Offline device loss exposes cached family data | Medium | Medium | Medium | Explicit local-data threat model, device guidance, revocation, optional protection research | PWA owner | Open |
| Heavy external IdP makes family deployment unusable | High | Medium | High | Built-in accounts by default; OIDC remains optional | Architecture owner | Mitigated by direction |

The risk register is refined as architecture is selected. Accepted risks require an
explicit rationale; security difficulty alone is not a reason to hide an unsafe
configuration behind an “advanced” switch.

## Reference Baseline

- [OWASP Application Security Verification Standard 5.0](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [RFC 8252, OAuth 2.0 for Native Apps](https://www.rfc-editor.org/rfc/rfc8252.html)
