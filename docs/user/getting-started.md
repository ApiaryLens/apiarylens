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
and an Other option for local equipment variations. Record the purpose and frame
count where applicable.

The list is both a visual and textual representation of the hive. Use **Up** or
**Down** to match the physical order. **Remove** takes a component out of the active
stack without erasing its history; removed and stored equipment remains available
under the history disclosure. Stack changes save locally and synchronize like other
hive records.

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
