# ApiaryLens for Windows

This workspace is the production composition root for the Windows-first ApiaryLens
client. It is no longer an empty placeholder. The current implementation provides:

- a single-instance Electron host with a sandboxed, context-isolated renderer;
- the existing React product UI served from a private supervised local service;
- the portable ApiaryLens API, SQLite store, migrations, and filesystem media adapter;
- an operating-system-assigned IPv4 loopback port with a per-launch control capability;
- main-process-only protected standalone secrets using Electron `safeStorage`;
- per-user data, media, runtime, credential, log, backup, and readiness locations;
- exact-origin navigation, popup/webview denial, permission denial, and a narrow preload bridge;
- graceful service shutdown, parent-death supervision, stale-readiness handling, and bounded kill;
- native owner bootstrap, so the deployment bootstrap credential never enters renderer JavaScript;
- focused contract, path, credential, and renderer-boundary tests; and
- a noninteractive smoke mode that starts the real service and records secret-free evidence.

## Developer verification

```powershell
pnpm --filter @apiarylens/windows typecheck
pnpm --filter @apiarylens/windows test
pnpm --filter @apiarylens/windows build
pnpm --filter @apiarylens/windows start -- --desktop-user-data=D:/tmp/apiarylens-windows-profile --desktop-smoke=D:/tmp/apiarylens-windows-smoke.json
```

Normal development launch is `pnpm --filter @apiarylens/windows dev`. It opens an
application window; the smoke command does not.

## Current boundary

This is production application code, not a signed release. ADR 0016 remains Proposed
until its owner and physical-device gates pass. Packaging, signing, attestation,
update/rollback, retail Windows profiles, backup/restore UX, connected mode, and
standalone-to-connected migration remain release-blocking work. The research scripts
under `scripts/research` remain evidence inputs and are not shipped by this workspace.
