# ApiaryLens Operations Guide

## Supported Profiles

The MVP supports the Cloudflare family profile and Docker Compose on personally
controlled Linux hardware. The same Compose bundle is the supported cloud-VM path.
Scout Bee is coming soon. Every operation below has a direct path available today.

## Release Identity

Before installing or updating, download the release manifest and verify the selected
artifact's byte count and SHA-256 digest. Never deploy a mutable `latest` tag. The
running `/health` response and PWA Version and Build view must match the manifest's
product, API, synchronization, migration, deployment-plan, export, and local-store
contracts.

## Cloudflare Direct Operations

1. Use a narrowly scoped API token for Workers Scripts, D1, R2, and the requested
   custom domain. Keep Web Analytics and Worker observability disabled.
2. Create or reuse the exact named D1 database and private R2 bucket.
3. Apply ordered D1 migrations from the verified bundle.
4. Provide the first-install `BOOTSTRAP_TOKEN` and a separate random
   `AUTH_ROOT_SECRET` through Wrangler's secrets-file mechanism so both are installed
   atomically with the Worker. Retain the authentication root through every update;
   rotating or losing it invalidates keyed sessions and prevents verification of
   peppered passwords.
5. Deploy the Worker/static bundle with D1 and R2 bindings and a custom-domain route.
6. Verify public HTTPS, `/health`, bootstrap protection, authenticated data access,
   private media, export, and quota assumptions.

The maintenance endpoint requires a short-lived `SCOUT_OPERATOR_TOKEN` for backup,
export, or restore. The endpoint returns 404 when that value is absent. Operators
using the direct path must create it only for the operation and remove it afterward;
future Scout Bee automation will enforce the same boundary.

## Compose Direct Operations

1. Verify Linux, UTC time, free space, Docker Engine, Compose v2, DNS, and public
   HTTPS prerequisites.
2. Transfer the content-addressed Compose bundle over SSH with strict host-key
   checking and verify its SHA-256 digest on the server.
3. Extract it under `/opt/apiarylens/releases/<version>`, place the one-time bootstrap
   code and durable authentication root in separate mode-600 files outside the release
   tree, and reference those Docker secrets from the mode-600 `.env`.
4. Run `docker compose --project-name <name> --env-file <file> -f docker/compose.yaml
   up -d --build --wait`.
5. Verify container health, public HTTPS, `/health`, sign-in, database writes, private
   media, export, and backup readiness.

Do not expose the API directly, publish HTTP, use default credentials, or bind an
unauthenticated service to LAN or public interfaces.

## Backup

- Compose backups stop API writes, archive the named data volume, validate gzip and
  tar structure, copy release identity and the mode-600 authentication root, then
  restart the API.
- Cloudflare backups stream allow-listed identity and application tables plus all
  private R2 objects through the temporary protected maintenance endpoint.
- Copy backups away from the deployment. Record product version, migration head,
  export/backup format, time, size, digest, and restore-test result.
- A backup is not accepted until its archive validation and a separate restore test
  pass.

## Restore

Restore is destructive. Confirm the target identity and backup compatibility, create
a pre-restore backup, stop writes, restore data and media, revoke prior sessions,
restart, and verify health plus an authenticated user journey. If verification fails,
leave the target unavailable and restore the pre-restore archive.

## Update and Rollback

1. Read release notes and compatibility limits.
2. Verify the artifact and create a tested backup.
3. Ensure PWA clients show no pending work before instructing users to reload.
4. Apply migrations, activate the new immutable revision, and run health and smoke
   checks.
5. Roll back application code only when migrations are backward compatible.
   Otherwise perform a full restore. Never guess across an irreversible migration.

Rollback triggers include a failed health identity, authentication failure, any
organization-isolation failure, media loss, pending-work loss, migration error, or
failure of the critical UAT journey.

## Uninstall

The direct Compose procedure defaults to keeping data; future Scout Bee workflows
will do the same. A Cloudflare
keep-data uninstall removes public triggers but retains a dormant service so its
write-only authentication root secret survives for a later reinstall; deleting the
Worker would make retained peppered credentials unrecoverable. Removing D1, R2, the
dormant service, authentication roots, or Docker volumes requires a separate explicit
destructive confirmation. Verify a portable backup before deleting retained data.

## Diagnostics and Privacy

Diagnostics may contain versions, plan fields, phase results, health state, and
sanitized errors. They must never include passwords, session cookies, recovery
codes, API tokens, bootstrap values, private keys, media, or hive records.
