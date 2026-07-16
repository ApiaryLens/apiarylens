# Docker Compose deployment

This directory contains the production Docker Compose profile for ApiaryLens. It is
the same portable server profile shipped in each signed release bundle and used by
Scout Bee on personally controlled hardware, Hyper-V, and ordinary Linux cloud VMs.

For a released installation, use the signed bundle and Scout Bee from the
[ApiaryLens Public Preview 1 release page](../docs/releases/0.1.0-preview.1.md). Scout Bee verifies the
manifest and bundle digest, pins the SSH host key, creates protected runtime secrets,
runs migrations, waits for both containers, and verifies the exact public HTTPS
release identity. The direct procedure below exists so Scout Bee is never required.

## Supported host

- x86-64 Linux; Ubuntu Server 24.04 LTS is the verified reference
- Docker Engine with the Compose v2 plugin
- 2 vCPU, 4 GiB RAM, and 32 GiB persistent disk recommended for the family profile
- inbound TCP 80 and 443; TCP 22 restricted to the operator's source address
- a DNS name whose A/AAAA record resolves to the host
- outbound HTTPS for image/package retrieval and ACME certificate issuance

The measured reference deployment used about 55 MiB of quiet container memory, but
the larger host recommendation leaves room for image builds, updates, backups, and
operating-system work. Database, media, Caddy state, and configuration are stored in
named Docker volumes and must be included in the operator's backup plan.

## Direct source checkout

Copy `.env.example` to `.env`, replace the example identity values, and set
`APIARYLENS_SITE_ADDRESS` to the real DNS name. Create the secret files before the
first start; do not put either secret in `.env` or shell history.

```bash
cd docker
install -d -m 700 secrets
umask 077
openssl rand -base64 36 > secrets/bootstrap-token
openssl rand -base64 48 > secrets/auth-root
docker compose config --quiet
docker compose build --pull
docker compose up -d --wait
curl --fail --show-error --silent "https://hives.example.com/health"
```

The bootstrap token is a one-time first-owner setup code. Keep it only until the
first owner and family have been created, then remove the local copy. The
authentication root is durable deployment state: protect and back it up with the
database and private media volumes.

## Operating the deployment

```bash
# Current status and health
docker compose ps
curl --fail --show-error --silent "https://hives.example.com/health"

# Recent logs without copying secret files
docker compose logs --since 30m api web

# Stop without deleting data
docker compose down

# Remove containers and retained volumes only after a verified export and backup
docker compose down --volumes
```

Use the published [update and recovery lifecycle](../docs/architecture/versioning-release-and-update-lifecycle.md)
for backup-before-update, migration, health verification, rollback, and restore. Do
not run `docker compose down --volumes` as an update or troubleshooting step.

For Azure, AWS, and Google Cloud host preparation, cost components, and the exact
compatibility record, see [Cloud VM Compose](../docs/deployment/cloud-vm-compose.md).
