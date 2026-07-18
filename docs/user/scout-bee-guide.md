# Scout Bee installation and operations guide

Scout Bee is the separately versioned ApiaryLens deployment bootloader. It is
designed to deploy and manage the backend and optional web frontend in Cloudflare
or on a Linux computer over SSH. Windows users will be able to run Scout without
typing Linux commands.

> **Coming soon:** Scout Bee is not currently offered as an end-user download.
> This guide describes the intended workflow so operators and contributors can
> review it before the separately versioned release is ready.

## Choose what Scout should manage

| Choice | Use it when | Where data lives |
|---|---|---|
| Family Cloud | Phones, tablets, and computers need one shared family deployment | Your Cloudflare account |
| Own hardware or cloud VM | You control a Linux server, home server, mini-PC, Hyper-V VM, or cloud VM | The selected Linux target |
| Advanced export | Your own CI/CD system will apply the deployment | In the target selected by the exported plan |

The optional web frontend may accompany a connected backend. Installing a backend
does not copy ApiaryLens product source into your deployment repository.

## Planned five-minute Windows start

1. Download Scout Bee from the direct ApiaryLens download offered after release.
2. Verify the version and published integrity information shown with the download.
3. Run Scout Bee. It will be portable and will not require Go, Node, WSL, Docker, or a
   Linux shell.
4. Select **Family Cloud**, **Own hardware or cloud VM**, or **Advanced export**.
5. Review the prerequisite and ownership summary. Scout does not change anything
   during preflight.
6. Review the exact actions and confirm **Apply**. Do not close Scout during
   activation or health verification; an interrupted operation can be resumed from
   its last verified checkpoint.

## Planned five-minute Linux start

1. Download the versioned Linux archive linked above.
2. Verify its checksum and attestation using the files attached to the same release.
3. Extract the single Scout executable and concise README into a directory owned by
   your user.
4. Mark the executable as executable and run it from a local graphical session.
5. Select the target and complete preflight before confirming any changes.

Linux source builds require development tools and are documented under
[Contributor builds](#contributor-builds). They are not the normal installation
path.

## Deploy from Windows to Linux over SSH

The Linux target may be a Hyper-V VM on the Windows computer, a home server, a
mini-PC, or a cloud VM. Scout runs on Windows and performs the target-side work.

Before starting, have the target's hostname or IP address, SSH user, and one
supported authentication method. Know where ApiaryLens data and backups should
live. The normal guided flow is:

1. Select **Own hardware or cloud VM** and **Remote Linux over SSH**.
2. Enter the host, port, user, and absolute target data directory.
3. Choose one explicit authentication method:
   - **Windows OpenSSH agent or default identity** uses the current user's agent and
     normal OpenSSH identity files without an interactive prompt.
   - **Private key file** requires an absolute path to a regular key file. The path
     is a runtime-only input and never enters the plan, operation history, logs, or
     diagnostics. On Windows, an optional passphrase is supplied through Scout's
     protected OpenSSH askpass boundary.
   - **Password** is supported by packaged Windows Scout through that same protected
     askpass boundary. Scout writes the value to a restricted temporary file, never
     to command arguments or the deployment plan, and removes the file when the SSH
     operation ends.

   Linux Scout currently fails closed for password and encrypted-private-key
   passphrase authentication. Use the Linux user's SSH agent or an unencrypted
   runtime-only private key until an equivalent protected askpass boundary is
   implemented there.
4. Confirm the SSH host-key fingerprint. A changed key is a blocking security event;
   investigate it instead of accepting it automatically.
5. Run preflight. Scout checks operating system, architecture, time, disk, ports,
   permissions, Docker Engine, Compose v2, and release compatibility.
6. Follow the guided prerequisite remediation. A supported family deployment does
   not require the user to open a Linux shell and paste deployment commands.
7. Choose **backend only** or **backend plus web**, review the public address and
   backup responsibility, then confirm apply.
8. Scout transfers the exact verified release, verifies it again on the target,
   creates target-side secrets through the protected boundary, applies each
   migration once, and runs health and authenticated smoke checks.
9. Save the redacted operation summary and secret-free deployment record.

## Deploy to Cloudflare

Use a user-owned Cloudflare account and a minimum-permission API token created for
the intended D1, R2, Worker, route, DNS, and secret operations.

1. Select **Family Cloud** and **Cloudflare**.
2. Choose **backend only** or **backend plus web**.
3. Enter non-secret names and domain choices. Provide the API token only in the
   protected credential prompt.
4. Run preflight and review the exact resources Scout will create or reuse. Scout
   reuses a resource only when its identity matches the deployment plan.
5. Review current, dated cost information in Scout. Preview guidance must not be
   interpreted as a permanent-free guarantee.
6. Confirm apply. Scout pins the product release, creates storage, applies
   migrations, uploads secrets through the provider API, deploys the backend and
   optional frontend, then verifies DNS, TLS, authenticated API access, D1, and R2.
7. Save the redacted operation summary and secret-free deployment record.

## Install, update, and repair

### Install

Scout downloads the exact product manifest and artifacts, verifies repository and
release identity, schema compatibility, declared and actual size, checksum,
signature, and attestation, then caches the verified version. Only after explicit
confirmation does it install and health-check the selected target.

### Update

1. Open Scout and select the managed installation.
2. Review the available version, release channel, compatibility, release notes, and
   migration consequences.
3. Create and verify the pre-update backup.
4. Confirm update. Scout stages the new release, applies migrations once, activates
   it, and verifies health and data/media counts.
5. If health fails, Scout leaves the previous version active or performs the
   compatible rollback/restore shown before confirmation.

Scout Bee and ApiaryLens have independent versions and channels. Updating Scout does
not silently change the selected ApiaryLens product release.

### Repair

Repair verifies installed files against the artifact lock, restores missing or
corrupted product files from the verified cache, rechecks permissions and
prerequisites, restarts the service, and verifies health. Repair must not overwrite
family data to make an application-file problem disappear.

## Backup and restore

### Backup

1. Select the installation and choose **Backup**.
2. Choose a destination outside the computer or target being protected.
3. Review included database, original media, product/contract identity, and
   verification metadata. Secrets and Windows-protected credentials are excluded.
4. Create the backup and wait for checksum verification to complete.

### Restore

1. Select **Restore**, then choose the verified backup.
2. Scout validates format, compatibility, space, checksums, database integrity, and
   migration identity before offering confirmation.
3. Review the destructive warning. Scout first creates a separate recovery backup
   of the current installation.
4. Confirm restore. Data is restored into staging, verified, and activated
   atomically. Restored sessions are revoked.
5. If activation or health verification fails, Scout restores the prior data. A
   successful restore requires a fresh sign-in.

## Rollback and uninstall

Rollback is offered only when a verified cached release is compatible with the
current schema and data. Scout explains whether it can roll code back directly or
must restore the pre-update backup.

Uninstall presents separate choices:

- **Remove application, keep data** removes replaceable program files and preserves
  a reinstall/restore path.
- **Remove deployment, keep backup** removes target resources only after listing
  what remains and where the backup is stored.
- **Permanently delete application and data** requires a separate destructive
  confirmation and enumerates local or provider resources before deletion.

Closing Scout is not a safe substitute for uninstalling or cancelling a lifecycle
operation.

## Advanced plan and CI/CD export

Choose **Advanced export** to produce a secret-free bundle containing:

- `apiarylens-deployment.json`;
- an immutable artifact lock with versions, sizes, and hashes;
- the verification record and trust policy;
- environment and secret-name requirements without secret values;
- provider-neutral GitHub Actions/Azure DevOps instructions; and
- a redacted action and recovery summary.

Commit those files to a personal automation repository such as
`Hybrid-Solutions-Cloud/my-apiarylens`. Supply credentials through that CI system's
secret store. The pipeline consumes immutable released artifacts; it does not copy
ApiaryLens source or invoke a personal deployment from the core source repository.

## Channels and version verification

Stable is the default. Select Preview or RC only under **Advanced release channel**
after reading the warning that contracts, data migrations, and user experience may
change frequently. Before apply, confirm the product version, Scout version,
manifest identity, source commit, compatibility range, artifact size, SHA-256, and
verification result. Scout rejects floating versions, unexpected sizes, invalid
checksums, untrusted manifests, incompatible schemas, and unauthorized downgrades.

## Data, logs, privacy, and diagnostics

Windows Scout stores non-secret state under
`%LOCALAPPDATA%\ApiaryLens\ScoutBee`. Linux uses the applicable XDG data, cache, and
state directories. Verified releases are cached by version for resume, repair, and
rollback. Temporary storage is used only during download and safe extraction.

Scout performs no telemetry by default. Plans, logs, diagnostics, caches, and
exports exclude passwords, session cookies, provider tokens, SSH private keys,
recovery codes, secret values, hive records, and media. A diagnostics bundle shows
versions, safe environment facts, artifact/plan hashes, prerequisite results,
operation checkpoints, health results, and redacted recent errors. Preview the
bundle before sharing it with support.

## Troubleshooting

### SSH connection or host-key failure

Confirm the address, port, user, network route, and authentication method. If the
host key changed, stop and reconcile the fingerprint with the target owner. Do not
delete the known-host record simply to make the warning disappear.

### Docker or Compose prerequisite failure

Use Scout's guided remediation and rerun preflight. Confirm that the SSH user may
operate Docker and that Compose v2 is available. Unsupported operating systems or
architectures require a supported target rather than an improvised root script.

### DNS or TLS health failure

Check that the selected hostname points to the intended target, required ports are
reachable, and certificate issuance has completed. Scout must not report completion
until public HTTPS and authenticated health checks pass.

### Cloudflare permission failure

Compare the requested action list with the token's account, zone, D1, R2, Worker,
route, DNS, and secret permissions. Create a narrower corrected token and retry the
failed checkpoint; do not use a global key as a shortcut.

### Interrupted operation

Reopen Scout and choose **Resume**. It continues from the last verified idempotent
checkpoint. Do not manually delete its operation or release cache while recovery is
pending.

### Failed migration or health check

Open the redacted operation result. Choose the offered compatible rollback or
verified restore. Preserve the recovery backup and diagnostics. A failed health
check is never a successful installation.

### No rollback available

Do not force an older binary over a newer database. Restore the compatible verified
backup or remain on the previous active installation while gathering diagnostics.

## Contributor builds

Contributors may clone [`ApiaryLens/scout-bee`](https://github.com/ApiaryLens/scout-bee)
and follow its README. Source builds currently require Node.js 24, pnpm 11.7.0, and
Go 1.26 or newer. Those tools are build prerequisites only; end-user Scout packages
must not require them. Product contracts, manifests, migrations, and artifacts stay
authoritative in [`ApiaryLens/apiarylens`](https://github.com/ApiaryLens/apiarylens).

For executor boundaries, failure semantics, and repository ownership, see the
[Scout Bee lifecycle design](../deployment/scout-bee.md).
