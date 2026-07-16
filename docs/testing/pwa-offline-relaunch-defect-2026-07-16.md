# PWA Offline Relaunch Defect — 2026-07-16

## Observation

During the disposable Cloudflare UAT journey, the first apiary, two hives,
queen, inspection, follow-up, and media work synchronized successfully. After
the installed PWA was closed while offline, relaunch displayed a blank screen.
The server retained the synchronized records; no database loss was observed.

## Cause and correction

The service worker cached only the root shell and manifest and did not reliably
precache the Vite-generated hashed JavaScript and CSS assets. Navigation fallback
also did not explicitly prefer the mounted shell. The worker now discovers and
precaches the HTML-referenced assets during installation and falls back to the
cached navigation shell for offline navigations. The fix is committed in
`8e88fdc`, deployed to the disposable UAT Worker and the public `.app` Worker,
and the web unit suite passes.

## Retest

Reconnect the installed PWA once, wait for the updated worker to install and for
pending work to reach zero, then close and relaunch with connectivity disabled.
This retest remains open until a human confirms the installed app renders the
dashboard and retains the local inspection/photos.

