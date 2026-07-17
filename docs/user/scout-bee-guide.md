# Scout Bee user guide

Scout Bee is the guided installer and lifecycle manager for ApiaryLens. Run Scout
on the computer in front of you; choose where ApiaryLens should run; and let Scout
verify, install, update, back up, repair, restore, roll back, diagnose, or remove the
deployment. A Windows computer can manage Cloudflare or a separate Linux machine
over SSH. You do not need to type Linux commands.

> **Public Preview status:** Scout Bee is independently versioned and is under active
> development. Its new signed end-user packages are not published yet. Do not use a
> source archive as an installer. When packages become available, this page and the
> [release page](https://github.com/ApiaryLens/scout-bee/releases) will link to the
> exact signed files. Preview and release-candidate product channels require an
> explicit advanced opt-in; Stable remains the default.

## Choose where ApiaryLens will live

| Choice | Best fit | What Scout manages |
|---|---|---|
| Family Cloud | A family that wants an always-available PWA without maintaining a server | Cloudflare Worker, D1 records, private R2 photos, health checks, backup, and recovery |
| Own hardware | A home server, mini-PC, NAS-compatible Linux host, or Hyper-V VM | Docker Compose over pinned SSH, HTTPS health, releases, backups, rollback, and uninstall |
| Cloud VM | An ordinary Linux VM in Azure or another provider | The same Compose-over-SSH path; the provider does not become an ApiaryLens dependency |
| Advanced plan | An operator with an existing CI/CD pipeline | A secret-free plan, artifact lock, verification record, and handoff instructions |

Scout runs on one computer and the deployment target can be another. Installing
Scout on Windows does not mean ApiaryLens must run on Windows or WSL.

## Five-minute Windows start

These steps apply after a signed Windows package appears on the Scout release page.

1. Download `scout-bee-<version>-windows-amd64.exe` from the matching GitHub Release.
2. Verify the file using the release's SHA-256 checksum and GitHub attestation.
3. Confirm Windows shows the expected ApiaryLens publisher signature and a valid
   timestamp. Stop if the publisher is missing or the signature is invalid.
4. Run the portable executable as your normal Windows user. Administrator access,
   Go, Node.js, WSL, Docker, and a Linux shell are not required on the Scout computer.
5. Leave **Stable** selected, choose a target, and run **Preflight** before **Apply**.

Scout opens a browser-based guide on a random loopback address. The launch token
exists only in memory. Do not copy that address into another device or expose it on
the network.

## Five-minute Linux start

These steps apply after a Linux package appears on the Scout release page.

1. Download `scout-bee-<version>-linux-amd64.tar.gz`, its checksums, and attestation.
2. Verify the archive before extraction.
3. Extract the archive and read the included `README.txt`.
4. Mark the single `scout-bee` executable as executable and run it as your normal
   user. Go and Node.js are not runtime prerequisites.
5. Leave **Stable** selected, choose a target, and run **Preflight** before **Apply**.

The Linux archive is an end-user package. A Git clone or GitHub source ZIP is a
contributor workflow and requires the development toolchain.

## Deploy from Windows to a Linux machine

The target can be a Hyper-V VM, home server, mini-PC, NAS-compatible Linux host, or
cloud VM.

1. Prepare a supported Linux target with a normal SSH user and network access.
2. In Scout, choose **Your Linux server**.
3. Enter the server hostname, SSH user, install folder, and public HTTPS address.
4. Compare the host-key fingerprint Scout displays with the fingerprint obtained
   from the server or provider console. Approve only an exact match.
5. Run **Preflight**. Scout checks the pinned host identity, SSH access, architecture,
   clock, disk space, Docker Engine, Docker Compose v2, folder safety, and HTTPS
   policy. It explains missing prerequisites without asking you to type shell commands.
6. Review the secret-free plan and selected immutable release.
7. Enter the one-time owner setup code only when Scout asks for it, then apply.
8. Scout transfers the checksum-verified bundle and runtime secrets separately,
   starts Compose, waits for health, and verifies the exact release identity over HTTPS.

If the live host key changes later, Scout stops. Verify whether the machine was
legitimately rebuilt before accepting a new fingerprint.

## Deploy to Cloudflare Family Cloud

1. Create or select the Cloudflare account that will own the deployment.
2. Create a narrowly scoped API token for the required Worker, D1, R2, and deployment
   operations. Do not paste an account-wide credential into a plan or repository.
3. In Scout, choose **Family Cloud** and review the dated cost/allowance notice.
4. Enter the account ID, deployment name, database name, private-photo bucket name,
   and optional custom HTTPS domain.
5. Run **Preflight** to verify the local deployment tool, account access, resource
   naming, cost guardrails, release compatibility, and backup readiness.
6. Enter the API token only into the runtime credential field. Scout keeps it in
   memory and excludes it from plans, operation records, logs, and diagnostics.
7. Apply and wait for Worker, D1, R2, migration, and HTTPS health verification.
8. Create and store a backup outside the Cloudflare account.

Cloudflare pricing and free allowances can change. Scout shows the dated assumptions;
the account owner remains responsible for billing limits and alerts.

## Lifecycle operations

### Install

Run Preflight, review the exact release and target, supply runtime credentials, and
apply. Save the owner setup code until the first owner account has been created.

### Update

Scout verifies the selected release, compatibility, checksum, and available space;
creates a pre-update backup; applies migrations; verifies health; and commits the
new release only after validation. Do not bypass the backup because the UI reports
an update is available.

### Repair

Repair reacquires the same immutable release from the verified cache or official
release source, creates a safety backup, reapplies deployment files, and verifies
health without rewriting the migration ledger or deleting user data.

### Back up

Choose **Backup**, select a destination outside the deployment, and apply. Scout
verifies that the archive is readable and contains the expected ApiaryLens manifest.
Keep more than one generation and periodically test restore.

### Restore

Select a compatible verified backup. Scout first creates a recovery backup of the
current deployment, stops writes, restores records and private media, revokes old
sessions, restarts the service, and verifies release health. A restore never weakens
authentication because protected credentials could not be recovered.

### Roll back

Choose a compatible cached earlier release. Scout backs up current data, verifies
the earlier release and its migration compatibility, activates it, and checks health.
Rollback is unavailable when the current schema or manifest does not declare the
path safe; use restore with a compatible backup instead.

### Uninstall

Choose one explicit data policy:

- **Keep data** stops and removes application services while retaining records,
  media, protected credentials, backups, and verified releases for recovery.
- **Remove all data** removes services, data, media, protected credentials, and
  selected Scout-managed residue after confirmation.

Always create and verify an export or backup before remove-all.

## Export a plan to `my-apiarylens` or CI/CD

Choose **Advanced plan**, review the generated plan, and export
`apiarylens-deployment.json`. The plan records intent and immutable release identity;
it contains no password, API token, private key, bearer token, certificate, or secret
value.

Commit only these safe handoff files:

- the deployment plan;
- artifact lock with URLs, sizes, and SHA-256 values;
- release/compatibility verification record; and
- generated CI/CD instructions.

Store runtime credentials in the target pipeline's secret store. A personal
repository such as `Hybrid-Solutions-Cloud/my-apiarylens` consumes released artifacts;
it must not copy ApiaryLens or Scout product source.

## Release channels and version verification

Scout and ApiaryLens have independent versions. Scout compatibility metadata states
which product manifest, deployment-plan, diagnostics, and product-version ranges it
understands.

- **Stable** is always the default.
- **Preview** can change frequently and must be selected under Advanced release channel.
- **Release candidate** is also advanced and is not equivalent to Stable.

Before execution, Scout checks the product and version, channel, manifest checksum,
contract compatibility, artifact URL, byte size, and SHA-256. Release workflows also
publish SBOM, license, provenance, and GitHub attestation evidence. Stop if any identity
or verification result differs from the release page.

## Data, cache, logs, and diagnostics

Scout uses the current user's platform directories:

| Data | Windows | Linux |
|---|---|---|
| Operation state and diagnostics source | `%AppData%\ApiaryLens\ScoutBee\operations` | `$XDG_CONFIG_HOME/ApiaryLens/ScoutBee/operations` or the user config directory |
| Verified product release cache | `%LocalAppData%\ApiaryLens\ScoutBee\releases` | `$XDG_CACHE_HOME/ApiaryLens/ScoutBee/releases` or the user cache directory |

Temporary extraction uses a protected temporary directory and is removed after the
operation. Checksum-addressed cached versions remain for resume and rollback.
Diagnostics contain Scout/product versions, the secret-free plan, phases, and
sanitized errors. Review a diagnostic before sharing it. Runtime secrets must never
appear; report it as a security defect if one does.

## Troubleshooting

### SSH connection or host-key failure

Confirm the hostname, port, and user. Compare the current fingerprint through a
trusted provider console or the physical server. Never disable strict host-key
checking to make an error disappear.

### Docker or prerequisite failure

Use Scout's guided remediation and rerun Preflight. Confirm the target—not the
Windows Scout computer—has supported Linux, Docker Engine, Compose v2, sufficient
disk, correct UTC time, and safe folder ownership.

### DNS or TLS health failure

Confirm the hostname resolves to the deployment and that ports 80/443 reach the
target. Wait for DNS propagation, then retry health verification. Do not replace a
publicly trusted certificate with an untrusted certificate for an internet-facing site.

### Cloudflare permission failure

Create a new least-privilege token with only the resources Scout lists. Do not use
the global API key. Confirm the account ID and resource ownership.

### Interrupted operation

Reopen Scout, load the recorded operation, and choose **Resume safely**. Resume is
allowed only for the same target, operation, and pinned release checksum. Scout uses
the verified cache instead of silently selecting a newer release.

### Checksum, manifest, provenance, or compatibility failure

Stop. Do not edit the manifest, checksum, compatibility file, or migration ledger.
Refresh official release metadata or select another compatible release. If official
files disagree, report a release incident.

### Failed migration or health check

Scout leaves the previous release or recovery backup available and does not declare
success. Save sanitized diagnostics, repair the prerequisite, and resume. Use rollback
only when compatibility permits it; otherwise restore the verified backup.

### Rollback unavailable

The cache may not contain a compatible earlier version, or the schema may not permit
downgrade. Preserve the current data, select a compatible backup, and use Restore.

## Contributor source build

End users should stop here. Contributors can clone the separate
[`ApiaryLens/scout-bee`](https://github.com/ApiaryLens/scout-bee) repository and follow
its README. Source builds require Node.js, pnpm, and Go and are not a substitute for
the signed end-user package or released-artifact acceptance tests.

## Get help

- [Scout Bee source and issues](https://github.com/ApiaryLens/scout-bee)
- [ApiaryLens product issues](https://github.com/ApiaryLens/apiarylens/issues)
- [Security reporting](https://github.com/ApiaryLens/scout-bee/security)
- [Public roadmap](https://apiarylens.org/roadmap/)
