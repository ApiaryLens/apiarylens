import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceWorker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const manifest = JSON.parse(
  readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'),
) as { start_url: string; scope: string; icons: Array<{ src: string }> };

describe('installed PWA shell', () => {
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

  it('makes destination overview metrics keyboard-native navigation controls', () => {
    expect(appSource).toContain("onClick={() => onNavigate('hives')}");
    expect(appSource).toContain("onClick={() => onNavigate('apiaries')}");
    expect(appSource).toContain("onClick={() => onNavigate('care')}");
    expect(appSource).toContain('className="metric metric-link"');
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
