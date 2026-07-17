# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, use GitHub's private vulnerability reporting for this repository:

1. Go to the **Security** tab of this repository.
2. Click **Report a vulnerability**.
3. Describe the issue in as much detail as possible, including steps to reproduce
   and potential impact.

This opens a private advisory visible only to maintainers until a fix is ready,
which is the preferred channel until the project has a dedicated security contact
address.

## Scope

Security reports are welcome for the official PWA, Node/SQLite/filesystem server,
Cloudflare Worker/D1/R2 backend, synchronization and authorization contracts,
Docker Compose deployment, Scout Bee, release artifacts and attestations, and the
`.org`, `.app`, and `.dev` public properties.

Include the affected release, deployment profile, prerequisites, reproduction steps,
and impact. Remove credentials, private hive records, location data, and unrelated
personal information. Problems caused only by unsupported source modifications,
provider account policy, or infrastructure outside ApiaryLens may be redirected,
but a report that could affect the portable product should still be submitted
privately for triage.

## Supported versions

The current `0.1.0-preview.3` public preview receives security fixes while it is
the active pre-release. Superseded release candidates are retained for audit and
recovery evidence but are not supported for deployment. Stable-version support
windows will be published with the first stable release.

## Our commitment

Given ApiaryLens's privacy-first and self-hosted-first principles, security issues
that could expose a beekeeper's hive, location, or business data are treated as
high priority. We will acknowledge reports as promptly as possible and credit
reporters (with permission) once a fix is released.
