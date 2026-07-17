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

## Photos

Selected photos and thumbnails are staged locally first. ApiaryLens uploads them
privately when online. Captions can be changed and media can be removed. Media URLs
are authenticated; the storage bucket or filesystem is not public.

## Export and Account Recovery

An owner can download a complete export from the management view. The ZIP includes
a manifest, JSON data, CSV tables, and original photos. Store it somewhere you
control. Recovery codes are single-use; after using one, sign in and create a new
set through the family recovery workflow.

## Demo Safety

`demo.apiarylens.app` contains synthetic records only. Resetting the demo clears its
local browser workspace. Never enter real hive, family, account, or photo data into
the public demo.

## Help

See [Troubleshooting](../troubleshooting.md) for offline, sign-in, media, update, and
deployment symptoms. Operators should use the [Operations Guide](../operator/operations-guide.md).
