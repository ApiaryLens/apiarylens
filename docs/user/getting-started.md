# ApiaryLens User Guide

## Start Here

ApiaryLens keeps family apiary records available across phones, tablets, and
computers while remaining usable when the yard has no signal. Your deployment
operator gives you the HTTPS address and, for the first owner only, a one-time setup
code.

1. Open the HTTPS address in Safari, Chrome, or Edge.
2. If this is a new family, choose **Create the first family**, enter the one-time
   setup code, and create the owner account. Otherwise, sign in or accept an
   invitation.
3. Use the browser's **Add to Home Screen** or **Install app** action.
4. Create an apiary and its first hive.
5. Open **Inspect**, record observations, photos, and follow-up work, then save a
   draft or complete the inspection.

## Working Without a Connection

The installed PWA keeps the application shell and synchronized records on the
device. New and edited records, inspection drafts, and staged photos are stored in
the browser until a connection returns. The header shows connectivity and pending
work. **Sync now** retries immediately.

Do not clear the browser's site data or uninstall the PWA while pending work is
shown. A platform update also waits rather than forcing a reload while records or
media remain pending.

## Apiaries, Hives, and History

- **Overview** shows active hives, open follow-ups, pending synchronization, and the
  latest inspection for each hive.
- **Apiaries** creates and edits yards, locations, access notes, and archives.
- **Hives** records status, installation, origin, notes, queens, and essential box
  equipment.
- **Inspect** saves complete or resumable inspections, weather snapshots, photos,
  colony observations, and follow-ups.
- **Care** records mite counts, feeding, treatments, harvests, and tasks. The mite
  trend includes an accessible table as well as a chart.

Inspection weather is always optional and can be entered manually without a signal.
The snapshot supports temperature and units, common or custom conditions, relative
humidity, and wind speed, units, and direction. Saved weather appears in inspection
history. ApiaryLens does not currently contact a weather provider or share your
location; any future automatic current or historical enrichment will require an
explicit consent step and will preserve manual offline entry.

Common inspection and care fields suggest beekeeper vocabulary without locking you
into it. Brood condition, stores, health observations, feed type/unit/reason,
treatment product or method, restrictions, harvest units, and follow-up descriptions
accept standard suggestions, recent family values where available, or a typed custom
value. Treatment suggestions are recordkeeping aids, not treatment advice; always
follow applicable law and the exact product label.

### Queen identity and marking

When adding a queen, choose a numbered disc/tag, breeder code, queen name, or an
explicit Other identifier. Then record the mark by year, by observed color, or as
unmarked. Year mode suggests the international five-color cycle: white for years
ending in 1 or 6, yellow for 2 or 7, red for 3 or 8, green for 4 or 9, and blue for
5 or 0. You can still record a different observed color. The year remains a manual
field because the beekeeper—not the current date—knows the queen's actual year.

The color cycle follows the [University of Florida IFAS queen-management
guidance](https://ask.ifas.ufl.edu/publication/IN1457). Source choices cover raised
in this apiary, purchased from a breeder, swarm/removal, unknown, and Other.

### Hive equipment stack

Open **Hives**, select a hive under **Equipment stack**, and add each physical
component from bottom to top. ApiaryLens supports bottom boards, deep brood boxes,
medium and shallow honey supers, queen excluders, feeders, inner and outer covers,
and an Other option for local equipment variations. Choosing Other reveals a custom
type or purpose field, so local equipment and beekeeper terminology are preserved
instead of being forced into a standard configuration. Record the purpose, installed
date, and frame count where applicable.

The list is both a visual and textual representation of the hive. Use **Up** or
**Down** to match the physical order. **Remove** takes a component out of the active
stack without erasing its history; ApiaryLens records the removal time, and removed
or stored equipment remains available under the history disclosure. Stack changes
save locally and synchronize like other hive records.

## Family Access

Owners can invite members as a beekeeper or viewer. The owner role cannot be
delegated through an invitation. Open the management view to see active and revoked
members plus unexpired pending invitations. A pending link can be replaced (which
invalidates the old link) or revoked. Removing an active non-owner member immediately
revokes that membership and its existing sessions.

Viewers cannot create, edit, delete, upload, export, or administer data. Authorization
and family isolation are enforced by the server, not only by hidden buttons.
Invitation links and recovery codes are secrets; share them through a private channel.
An invited person creates their own password when accepting the link; the owner never
chooses or sees that password.

## Sign-in and devices

Each browser or installed PWA has its own server session in a secure, HttpOnly
cookie; ApiaryLens application code cannot read or copy that cookie. The offline
cache contains non-secret account context and synchronized family records, not the
session token or CSRF credential. Open **Account and build** to see the current
browser/device type, whether it is an installed app, the server-session expiry, and
the expected reconnect behavior.

ApiaryLens remains usable with synchronized data while offline. On reconnect it
validates the secure cookie and synchronizes automatically. Sign-in is required only
when that server session expired or was revoked. **Sign out other devices** revokes
all other sessions for the current account while preserving the current one; it does
not delete records already cached on those devices. Removing a family member or
using account recovery also revokes that person's sessions. Signing out locally now
removes the cached account context even when the device is offline, while leaving
family records in place until **Clear local data** is explicitly selected.

The Windows application starts in standalone mode unless Scout Bee imports a
verified, secret-free connection profile. Connected mode keeps the same offline
records, media staging, outbox, reconnect, and session behavior as the PWA, in an
isolated Windows application storage partition. The imported profile contains the
HTTPS backend and compatibility identity but no password, session, provider token,
SSH key, deployment secret, or recovery code. Authentication happens in the Windows
client after import. Returning to standalone mode preserves the prior standalone
data; it does not silently copy newer remote-only records back into that database.

ApiaryLens for Windows Preview 2 is available as a current-user
[`ApiaryLensSetup-UNSIGNED-PREVIEW.exe`](https://github.com/ApiaryLens/apiarylens/releases/download/v0.1.0-preview.2/ApiaryLensSetup-UNSIGNED-PREVIEW.exe).
It installs without administrator rights and does not require Node, Go, WSL, Docker,
or a Linux shell. Review the
[official versioned release](https://github.com/ApiaryLens/apiarylens/releases/tag/v0.1.0-preview.2)
before running Setup. The current Preview installer is **not Authenticode-signed**;
its SHA-256 is
`696276fdd0c4c537b34ea757f2d17a40383cb385d8c72ac0de2779af404c0b1e`.
Windows may show **Windows protected your PC**. Choose **More info → Run anyway**
only after the downloaded file matches that exact hash. A future signed release
must show the publisher documented on its own release page; this unsigned Preview
must not be described as signed.

The release also publishes a full Squirrel update package, `RELEASES` metadata,
artifact sizes, and SHA-256 hashes. The database, original photos, protected
credentials, connection profile, and backups live in the user's application-data
directory rather than the replaceable install directory, so application updates do
not overwrite family data.

An owner using Windows standalone can choose **Account and build → Create Windows
backup**. Select a destination for the `.albackup` file and keep it somewhere other
than the computer running ApiaryLens. The application briefly restarts its private
local service so the SQLite database and original photos form one consistent,
checksum-verified archive. Windows-protected application credentials are excluded.
Choose **Restore Windows backup** to select a compatible archive. ApiaryLens verifies
every checksum before showing the destructive confirmation, creates a separate
pre-restore recovery backup, replaces the current database and photos, revokes
restored sessions, and verifies the restarted service. If startup or health checks
fail, the prior data is restored automatically. A successful restore requires a
fresh sign-in.

### Update ApiaryLens for Windows

1. Create and verify a current `.albackup` before changing versions.
2. Open the versioned ApiaryLens release page and confirm the target version,
   compatibility notes, package size, and SHA-256.
3. Download and run that release's explicitly named Preview Setup executable. Setup updates the
   current-user installation; it does not replace the private application-data
   directory.
4. Reopen ApiaryLens and confirm **Account and build** shows the expected version.
5. Confirm the local service is healthy and open a recent hive, inspection, and
   original photo. If connected, allow automatic synchronization to finish.

Do not install an older package over a newer database unless the release explicitly
declares that rollback compatible. Use the verified backup/restore path when a
schema rollback requires data restoration.

### Repair the Windows installation

Use [Scout Bee](scout-bee-guide.md#repair) and select **Repair** for the managed
Windows installation. Repair verifies the pinned application package, replaces
missing or corrupted program files from the verified cache, restarts the private
loopback service, and checks health. It does not erase the database or photos to
hide an application-file problem. Create a backup before repair when the current
installation can still produce one.

### Uninstall or reinstall

1. Create a current backup and record its SHA-256 and product version.
2. In Windows **Settings → Apps → Installed apps**, find **ApiaryLens** and choose
   **Uninstall**, or use Scout Bee's **Remove application, keep data** operation.
3. Confirm the program is removed. Preview uninstall preserves the private
   application-data directory so a verified reinstall can recover the family data.
4. To reinstall, run the exact verified Setup package for a compatible version and
   confirm health and records before deleting any backup.

Permanent data deletion is intentionally separate from normal uninstall. Do not
manually remove application-data folders as a shortcut: verify a portable backup,
review every retained location, and use Scout's separately confirmed remove-data
workflow when it is available for the selected release.

## Photos

Selected photos and thumbnails are staged locally first. ApiaryLens uploads them
privately when online. Captions can be changed and media can be removed. Media URLs
are authenticated; the storage bucket or filesystem is not public.

## Export and Account Recovery

An owner can download a complete export from the management view. The ZIP includes
a manifest, JSON data, CSV tables, and original photos. Store it somewhere you
control. This portable export is separate from a deployment backup, and a phone or
browser's offline working copy is not a server backup.

Open Scout Bee on the operator computer to create and verify a deployment backup or
to see the last backup and restore result recorded there. Before restore, Scout
requires a compatible verified archive, creates a recovery backup of the current
deployment, warns that current records and media will be replaced, revokes active
sessions, and verifies health afterward. See the [Scout Bee backup and restore
guide](scout-bee-guide.md#backup).

Recovery codes are single-use; after using one, sign in and create a new set through
the family recovery workflow.

## Demo Safety

`demo.apiarylens.app` contains synthetic records only. Resetting the demo clears its
local browser workspace. Never enter real hive, family, account, or photo data into
the public demo.

## Help

Use the searchable [Beekeeping glossary](beekeeping-glossary.md) for product and hive
terminology. See [Troubleshooting](../troubleshooting.md) for offline, sign-in, media,
update, and deployment symptoms. Operators should use the [Operations
Guide](../operator/operations-guide.md).
