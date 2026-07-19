# Air-gap bundle: offline install and transported updates

ApiaryLens supports Compose deployments on hosts with **zero outbound
network**. Each release publishes an offline deployment bundle,
`apiarylens-<version>-airgap-<sha12>.tar`, containing the prebuilt product
images, the compose profile with an air-gap override, the embedded migration
history, the compatibility manifest, the lifecycle scripts, and this runbook.
Nothing in the install or update procedure reaches a registry, package
manager, or certificate authority: migrations run in a `--network none`
one-shot container, activation uses `--no-build` with `pull_policy: never`,
and the backup/restore helper image ships inside the bundle.

This page is packaged into every bundle as `docs/AIRGAP.md` so the procedure
travels with the artifact.

## Bundle contents

```
apiarylens-<version>-airgap-<sha12>.tar
├── bundle-manifest.json          bundle identity, image IDs, pinned minimum
│                                 Docker/Compose versions, member digests
├── compatibility-manifest.json   canonical release compatibility manifest
├── release-identity.json         release identity block
├── checksums.sha256              sha256sum -c format over every member
├── images/apiarylens-images-<version>.tar
│                                 one docker-save archive: apiarylens-api,
│                                 apiarylens-web, and the backup helper image
├── compose/                      compose.yaml, compose.airgap.yaml,
│                                 Caddyfile, Caddyfile.backend-only, .env.example
├── migrations/migration-history.json
├── scripts/                      lifecycle scripts (see scripts/README.md)
└── docs/AIRGAP.md                this runbook
```

## Supported envelope

The same envelope as [Cloud VM Compose](cloud-vm-compose.md) — Ubuntu Server
24.04 LTS x86-64, 2 vCPU, 4 GiB RAM — with these air-gap specifics:

- **No outbound network is required.** The "outbound HTTPS" requirement of
  the connected procedure does not apply.
- **Docker Engine ≥ 24.0 with Compose plugin ≥ 2.24.0.** The bundle manifest
  records the tested minimums (`minimumDockerEngine`,
  `minimumComposeVersion`) and the exact versions the release was built
  with; the scripts refuse older Compose versions.
- **Disk headroom:** the bundle manifest records the required free space
  (`requiredDiskHeadroomGiB`) for the loaded images, one retained previous
  release for rollback, and one backup, in addition to your data and media.

## TLS without ACME

Public ACME certificate issuance is impossible without egress. Two supported
options:

1. **Internal name with Caddy's local CA (default, no egress).** Keep
   `APIARYLENS_SITE_ADDRESS` set to `localhost` or an internal DNS name that
   is not publicly resolvable. Caddy issues certificates from its own local
   CA with no network access. Export the CA root once and distribute it to
   the family devices that will use the deployment: the root certificate is
   at `/data/caddy/pki/authorities/local/root.crt` inside the `caddy_data`
   volume (`docker compose -p <project> cp web:/data/caddy/pki/authorities/local/root.crt .`).
2. **Operator-supplied certificate.** Provide your own certificate and key
   pair and reference them from the Caddyfile (`tls cert.pem key.pem`) if
   your organization operates an internal CA.

## Connected machine: export and verify

1. Download `apiarylens-<version>-airgap-<sha12>.tar` and
   `release-manifest.json` from the release page.
2. Verify the bundle's SHA-256 against the release manifest entry and verify
   the GitHub artifact attestation
   (`gh attestation verify <bundle> --repo ApiaryLens/apiarylens`). This is
   the provenance trust boundary: keyless attestation verification needs
   online transparency-log access, so it happens here, on the connected
   side.
3. Record the verification output with the transported media.
4. Copy the tar to the transport media and re-hash the copy on the media
   (`sha256sum`) before it leaves the machine.

## Air-gapped host: install

```bash
sha256sum apiarylens-<version>-airgap-<sha12>.tar   # compare with the recorded value
mkdir bundle && tar -xf apiarylens-<version>-airgap-<sha12>.tar -C bundle
bundle/scripts/verify-bundle.sh --bundle-dir bundle
bundle/scripts/install-airgap.sh --bundle-dir bundle --target /opt/apiarylens \
  --project apiarylens --site-address localhost
```

`install-airgap.sh` performs, in order: bundle verification, host preflight
(architecture, Compose minimum, no existing install), secret creation (or
adoption of operator-provided secret files), release staging, `docker load`
with image-ID verification against `bundle-manifest.json` (the recorded IDs
are derived from the image archive itself — the config-blob digests that
`docker load` reproduces on any host and image store), the one-shot
network-isolated migration, offline activation
(`docker compose -f compose.yaml -f compose.airgap.yaml up -d --no-build --wait`),
health verification of the running release identity, and the commit of the
`current` symlink. Every step is recorded in the update ledger
(`<target>/lifecycle/update-ledger.jsonl`).

## Air-gapped host: transported update

Steps 1–4 above on the connected machine, then on the host:

5. **Discover/Review** — hash the transported tar against the recorded
   value, extract, and run `verify-bundle.sh --bundle-dir <dir> --target
   <target>`. This verifies every member checksum and evaluates the
   compatibility rules: the bundle must be newer than the installed version,
   the installed version must not be older than the bundle's
   `minimumDirectUpgradeSource`, and channel changes require
   `--allow-channel-change`.
6. **Preflight** — `update-airgap.sh` verifies the architecture, the Compose
   minimum, the disk headroom, and that the ledger records no interrupted
   operation.
7. **Back up** — a forced, verified backup (database, media, durable
   secrets, release evidence) via `backup.sh`; the path is recorded in the
   ledger entry.
8. **Stage** — the new release directory is staged, configuration carries
   over, images are loaded, and loaded image IDs are compared with
   `bundle-manifest.json`.
9. **Migrate** — the dedicated one-shot migration container runs with
   `--network none` before any service is recreated. On failure the previous
   release restarts untouched and the ledger records `migration-failed`.
10. **Activate** — `up -d --no-build --wait` with the air-gap override.
11. **Verify** — `/health` must report the new release identity.
12. **Commit or recover** — on success the `current` symlink moves and the
    ledger records `committed`; the previous release directory and images
    are retained for the rollback window. On activation or verification
    failure the script compares the applied migration head with the head
    the previous release shipped: while they are equal the previous release
    is re-activated automatically (`rolled-back`); after a schema advance
    the previous code is never run against the newer database — the
    pre-update backup is restored automatically instead (`restored`, after
    a scratch-volume restore test proves it restorable).

All of it in one command:

```bash
bundle/scripts/update-airgap.sh --bundle-dir bundle --target /opt/apiarylens --project apiarylens
```

## Routine operations

```bash
scripts/backup.sh --target /opt/apiarylens --project apiarylens          # verified backup
scripts/restore-test.sh --target /opt/apiarylens --project apiarylens    # non-destructive restore proof
scripts/rollback.sh --target /opt/apiarylens --project apiarylens        # previous release, same migration head only
scripts/restore.sh --target /opt/apiarylens --project apiarylens --yes   # destructive restore, revokes sessions
scripts/teardown.sh --target /opt/apiarylens --project apiarylens        # stop; data kept by default
```

See `scripts/README.md` in the bundle for the full interface, exit codes,
and the update-ledger format, and the
[versioning, release, and update lifecycle](../architecture/versioning-release-and-update-lifecycle.md)
for the state machine these scripts implement. Scout Bee does not yet drive
air-gapped hosts; this manual procedure is the supported path (the Scout
adapter requires HTTPS artifact sources and on-host builds today).
