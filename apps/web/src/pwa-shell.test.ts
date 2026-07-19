import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceWorker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const accountSource = readFileSync(
  new URL('./features/account/AccountPage.tsx', import.meta.url),
  'utf8',
);
const overviewSource = readFileSync(
  new URL('./features/overview/OverviewPage.tsx', import.meta.url),
  'utf8',
);
const manifest = JSON.parse(
  readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'),
) as { start_url: string; scope: string; icons: Array<{ src: string }> };

describe('installed PWA shell', () => {
  it('stamps the service-worker cache name with the released product version', () => {
    // The service worker is a static script, so its cache version is pinned by
    // hand; this test is the stale-guard (T2-2 audit finding: the cache name
    // once lagged one build behind the shipped release, leaving updated shells
    // served from the previous release's cache generation).
    const { version } = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    expect(serviceWorker).toMatch(
      new RegExp(`const CACHE = \`\\$\\{CACHE_PREFIX\\}${version.replaceAll('.', '\\.')}-r\\d+\``),
    );
  });

  it('keeps installation paths relative so root and /app deployments cache the same shell', () => {
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.icons.every((icon) => icon.src.startsWith('./'))).toBe(true);
  });

  it('claims existing clients and always returns a response for an offline fetch', () => {
    expect(serviceWorker).toContain('self.clients.claim()');
    expect(serviceWorker).toContain('key.startsWith(CACHE_PREFIX)');
    expect(serviceWorker).toContain("if (!response.ok && event.request.mode === 'navigate')");
    expect(serviceWorker).toContain("new Response('Offline resource unavailable'");
    expect(serviceWorker).toContain('caches.match(BASE.pathname)');
    expect(serviceWorker).toContain("caches.match(new URL('index.html', BASE).pathname)");
  });

  it('hydrates the cached session before any launch-time network session request', () => {
    const cachedSession = appSource.indexOf('const cached = await cachedSession()');
    const cachedWorkspace = appSource.indexOf('setSession(offlineSession)', cachedSession);
    const launchGateDismissed = appSource.indexOf('setLoading(false)', cachedWorkspace);
    const networkSession = appSource.indexOf('const active = await api.session()', cachedSession);

    expect(cachedSession).toBeGreaterThan(-1);
    expect(cachedWorkspace).toBeGreaterThan(cachedSession);
    expect(launchGateDismissed).toBeGreaterThan(cachedWorkspace);
    expect(launchGateDismissed).toBeLessThan(networkSession);
    expect(appSource).toContain('if (!navigator.onLine && !desktopStandalone)');
  });

  it('never gates the Windows standalone shell behind external connectivity', () => {
    expect(appSource).toContain('const desktopStandalone = api.desktopStandalone()');
    expect(appSource).toContain('isOnline: () => desktopStandalone || navigator.onLine');
    expect(appSource).toContain('desktopStandalone ? false : !navigator.onLine');
    expect(appSource).toContain('api.deviceOwnerProvisioningAvailable()');
    expect(appSource).toContain('await establish(await api.provisionDeviceOwner())');
  });

  it('never offers sign-out to a device-managed owner who has no credentials to re-enter', () => {
    expect(accountSource).toContain('const deviceManaged = api.deviceManagedSession(session)');
    expect(accountSource).toContain('{!deviceManaged && (');
  });

  it('makes destination overview metrics keyboard-native navigation controls', () => {
    expect(overviewSource).toContain(
      "onClick={() => onNavigate({ page: 'hives', hiveStatus: 'active' })}",
    );
    expect(overviewSource).toContain("onClick={() => onNavigate({ page: 'apiaries' })}");
    expect(overviewSource).toContain("onClick={() => onNavigate({ page: 'inspections' })}");
    expect(overviewSource).toContain(
      "onClick={() => onNavigate({ page: 'care', careView: 'open-follow-ups' })}",
    );
    expect(overviewSource).toContain('className="metric metric-link"');
    // The pending-sync block is status-only and must stay non-interactive.
    expect(overviewSource).toContain('<article className="metric pending">');
  });

  it('blocks update activation while local records or media are pending', () => {
    expect(appSource).toContain('updateRegistration.waiting.postMessage');
    expect(appSource).toContain('disabled={pendingWork > 0}');
    expect(appSource).toContain("pendingWork === 1 ? '' : 's'");
    expect(serviceWorker).toContain("event.data?.type === 'SKIP_WAITING'");
  });

  it('schedules automatic synchronization for every connected lifecycle trigger', () => {
    expect(appSource).toContain("scheduler.request('open')");
    expect(appSource).toContain("scheduler.request('resume')");
    expect(appSource).toContain("scheduler.request('reconnect')");
    expect(appSource).toContain("scheduler.request('save')");
    expect(appSource).toContain("schedulerRef.current?.request('manual')");
    expect(appSource).toContain("window.addEventListener('pageshow', open)");
    expect(appSource).toContain("document.addEventListener('visibilitychange', resume)");
    expect(appSource).toContain('window.addEventListener(LOCAL_CHANGE_EVENT, localChange)');
  });
});
