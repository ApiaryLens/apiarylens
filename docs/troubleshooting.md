# Troubleshooting

## The App Says Offline

Confirm the device itself has connectivity. Continue recording work if needed; the
pending count should increase. When connectivity returns, choose **Sync now**. Do not
clear site data. If work remains pending, save diagnostics and record the exact time,
device, page, and operation.

## A Record Has a Conflict

ApiaryLens preserves both the client and server value. Review the conflicting fields,
choose the intended value, save, and synchronize again. Do not repeatedly retry an
unreviewed conflict.

## A Photo Is Pending or Failed

Keep the PWA installed and leave browser storage intact. Confirm the original and
thumbnail are still listed locally, reconnect, and retry synchronization. Operators
should verify authenticated media routes, private storage bindings, capacity, and
object permissions without making the bucket public.

## Sign-In or Invitation Fails

Check the exact HTTPS origin, device clock, invitation expiry/status, and account
identifier. Sessions are origin-bound secure cookies. After a restore, all existing
sessions are intentionally revoked. Use a single-use recovery code only on the real
deployment origin.

## The PWA Will Not Update

Finish or synchronize pending inspections and staged media. The app intentionally
does not force a data-losing reload. If no work is pending, accept the update and
verify the Version and Build view.

## Health Check Fails

Compare `/health` with the release manifest. For Compose, inspect container health,
TLS routing, the data volume, and migration logs. For Cloudflare, inspect the active
Worker revision and D1/R2 bindings. Do not enable provider telemetry or publish
secrets to obtain support.

## Backup or Restore Fails

Stop before retrying destructive work. Retain the source archive, pre-restore backup,
sanitized diagnostics, manifest, and digests. A readable ZIP or tar file alone is not
proof of compatibility. Restore only when product, migration, and format identities
match the documented path.

## Scout Bee Stops Safely

Read the failed phase and recovery guidance, correct the prerequisite, then use
**Resume safely**. Export the secret-free plan and sanitized diagnostics. Runtime
credentials must be entered again; they are deliberately not persisted.
