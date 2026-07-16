# ApiaryLens MVP Owner Acceptance Runbook

## Purpose

Use this short runbook to close the remaining human-operated MVP gates for
`0.1.0-rc.7`. The automated release, Cloudflare, Compose, Hyper-V, Azure/GCP
reference, security, backup/restore, and desktop-browser evidence is already
recorded in [`mvp-uat.md`](mvp-uat.md). This runbook covers only evidence that
cannot be established from the build server.

## Prerequisites

- The live `.org` site and `.app` PWA are reachable over HTTPS.
- A private UAT deployment with two family accounts and one Viewer account.
- One iPhone or iPad, one second family device, and a desktop browser.
- A small set of disposable test photos; do not use private production data.
- The current board open locally at
  `D:\git\apiarylens\apiarylens-ops\pmo\boards\apiarylens-mvp-status.html`.

## Required journey

1. Install the PWA on the phone or tablet and open it once while online.
2. Create or use the UAT family, apiary, two hives, queen, and box configuration.
3. Turn off connectivity on the mobile device.
4. Create an inspection with two photos, mite count, feeding, treatment,
   harvest, and a follow-up item. Confirm the pending/offline state is visible.
5. Relaunch the installed PWA while offline. Confirm the inspection and staged
   photos are still present.
6. Restore connectivity and wait for synchronization. Confirm exactly one
   inspection, exactly two photos, and no duplicate follow-up.
7. Sign in on the second family device and confirm the shared history appears.
   Confirm Viewer can read but cannot modify or access another organization.
8. With a second offline inspection pending, perform the documented compatible
   update. Confirm the draft and photos survive and synchronize exactly once.
9. Run the final keyboard and screen-reader review of the supported journey:
   focus order, labels, validation errors, contrast, and touch targets. Record
   any finding; do not treat NVDA/VoiceOver or 200% zoom as passed by inference.
10. Review the live `.org`, `.app`, and `.dev` surfaces, release notes, roadmap,
    recovery guidance, icons, screenshots, and board. Sign the acceptance entry.

## Evidence to record

Create or update a dated JSON/Markdown evidence file in `docs/testing/` with:

- device/browser model and OS version;
- release identity shown by the Version and Build view;
- offline start, relaunch, reconnect, and update timestamps;
- record/media counts before and after synchronization;
- Viewer negative authorization result;
- accessibility findings and disposition;
- owner name, date, and explicit pass/fail decision.

Do not include passwords, tokens, private hive data, or personal photos.

## Acceptance rule

Mark `UAT-02`, `UAT-03`, `UAT-04`, `UAT-05`, `REL-05`, and `OPS-03` complete
only when the evidence file exists and the owner has signed the result. If any
step fails, leave the task open, record the failure and recovery action, and do
not promote the release to stable.

