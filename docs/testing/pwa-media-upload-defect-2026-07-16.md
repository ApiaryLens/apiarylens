# PWA Media Upload Defect — 2026-07-16

## Observation

The disposable Cloudflare UAT inspection and its `mediaAsset` metadata reached
the server, but the metadata remained `staged` and the corresponding original
object was absent from the private R2 bucket. The desktop therefore knew that a
photo record existed but could not render its content.

## Release impact

This is an open P0 media acceptance defect. A synchronized metadata row is not
evidence that the original and thumbnail bytes uploaded successfully. The media
gate remains open until both objects exist, the resource is `ready`, and the
desktop can render the image.

## Retest

Use the original phone source blob while online. Confirm the upload response,
original and thumbnail R2 objects, `ready` state, and desktop rendering. Do not
delete local media or clear browser storage before the retest.

