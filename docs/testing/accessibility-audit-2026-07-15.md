# Accessibility Audit: ApiaryLens MVP Release Candidate

**Standard:** WCAG 2.1 AA  
**Date:** 2026-07-15  
**Build:** 0.1.0-rc.1

## Summary

Automated axe-core scans found zero WCAG 2.1 A/AA violations on the `.org` home and
documentation hub, `.app` entry, isolated PWA demo, `.dev` home, and API reference.
The mobile PWA has named landmarks, no unlabeled form controls, no horizontal
overflow at 320 CSS pixels, visible native keyboard focus, and no visible interactive
target below 44 by 44 CSS pixels after remediation. A subsequent browser-controlled
inspection of the live `.org` home, docs, and support surfaces; `.app` entry; and
`.dev` home and contracts surfaces confirmed explicit tab icons, one primary heading,
named controls, landmark structure, no horizontal overflow, and no target below 44 by
44 CSS pixels at both 375-pixel mobile and 320-pixel zoom-equivalent widths.

Automated checks do not prove full conformance. Manual NVDA/VoiceOver reading,
keyboard completion of every destructive/recovery flow, and 200% browser zoom on
the signed UAT device matrix remain release gates.

## Findings and Remediation

| # | Area | Criterion | Severity | Result |
|---|---|---|---|---|
| 1 | Demo exit link target was 85 by 21 CSS pixels | 2.5.5 Target Size | Major | Fixed with a 44-pixel minimum interactive height |
| 2 | Organization/version button was 236 by 23 CSS pixels | 2.5.5 Target Size | Major | Fixed with a 44-pixel minimum interactive height |
| 3 | Form naming and landmarks | 1.3.1, 3.3.2, 4.1.2 | None | No unlabeled visible controls; header, main, and named primary navigation present |
| 4 | Narrow reflow | 1.4.10 | None | No horizontal document overflow at 320 CSS pixels |
| 5 | Keyboard focus | 2.4.7 | None | Focused demo exit link exposes a visible browser outline |
| 6 | Public-site brand, footer, and inline-link targets rendered below the project's 44 by 44 CSS-pixel gate | 2.5.5 Target Size | Major | Fixed across `.org`, generated docs, `.app`, and `.dev`; live mobile recheck found no undersized visible targets |
| 7 | Generated `.org` documentation pages relied on implicit root favicon discovery | 1.1.1 Non-text Content | Minor | Fixed with explicit SVG favicon and Apple touch-icon metadata on every generated document |
| 8 | Current shared-client recovery-code button rendered at 28.2 CSS pixels high | 2.5.5 Target Size | Major | Fixed in `23dac44`; five-profile rerun found no target below 44 CSS pixels |

The live browser pass also found no unnamed visible control, missing image alternative,
or page-level horizontal overflow on the six inspected public entry surfaces. This is
structural and responsive evidence only; it is not recorded as a substitute for the
manual keyboard and assistive-technology steps below.

On 2026-07-16, the live rc.4 synthetic demo received an additional desktop Chrome
pass. Sequential Tab traversal reached the exit, organization, synchronization, and
all five primary-navigation controls without a focus trap. Every control exposed a
visible focus outline and measured at least 44 CSS pixels high. The same rendered
journey retained its landmarks and had no horizontal overflow at 390-by-844 and
820-by-1180 CSS-pixel viewports. A newly completed synthetic inspection was saved
locally, survived a tab reload, and appeared synchronized exactly once. The bounded
record is [`desktop-chrome-uat-2026-07-16.json`](desktop-chrome-uat-2026-07-16.json).
This closes the Chrome desktop structural, keyboard-navigation, target-size, and
synthetic reload checks only; it does not close the manual screen-reader, 200% zoom,
forced-colors, physical-device, photo, or release-update gates.

On 2026-07-17, the Windows-host research harness scanned the current shared React UI
at desktop, 200%-equivalent, 400%-equivalent, forced-colors, and reduced-motion
profiles. The first run found finding 8. After remediation, GitHub Actions run
[`29548097125`](https://github.com/ApiaryLens/apiarylens/actions/runs/29548097125)
reported zero axe A/AA violations, zero undersized targets, no horizontal overflow,
valid landmarks, visible keyboard focus, and active forced-colors/reduced-motion
media queries. The detailed interpretation and remaining native-host limitations are
recorded in
[`2026-07-16-windows-host-and-package-spike.md`](../research/2026-07-16-windows-host-and-package-spike.md#shared-ui-accessibility-evidence).

## Automated Scan Evidence

| Page | Passed rules | Total violations | Serious/critical |
|---|---:|---:|---:|
| `https://apiarylens.org` | 18 | 0 | 0 |
| `https://apiarylens.org/docs/` | 10 | 0 | 0 |
| `https://apiarylens.app` | 8 | 0 | 0 |
| `https://demo.apiarylens.app/app/` | 18 | 0 | 0 |
| `https://apiarylens.dev` | 8 | 0 | 0 |
| `https://apiarylens.dev/api/` | 8 | 0 | 0 |

Run `npm run audit` in the `.org` repository to repeat the scan.

## Manual Acceptance Still Required

- [ ] Complete onboarding, apiary/hive editing, inspection, photo, care, family,
      conflict, export, update, and destructive flows using keyboard only.
- [ ] Verify logical announcements and live status with NVDA on Windows.
- [ ] Verify VoiceOver on iPhone and iPad, including installed-PWA navigation.
- [ ] Verify text resize and browser zoom to 200% on each supported desktop browser.
- [ ] Verify contrast and non-color cues in forced-colors/high-contrast mode.
- [ ] Confirm modal focus containment, Escape behavior, focus restoration, error
      summary movement, and no unexpected focus changes.

The MVP release gate remains open until these items are recorded in the
[MVP UAT Record](mvp-uat.md).
