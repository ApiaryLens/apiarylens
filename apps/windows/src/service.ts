import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { serve, type ServerType } from '@hono/node-server';
import { createBuildIdentity } from '@apiarylens/contracts';
import { SqliteStore } from '@apiarylens/database';
import { FilesystemMediaStore } from '@apiarylens/media';
import { createApi } from '@apiarylens/server/runtime-app';
import { desktopControlHeader, safeTokenEqual } from './service-contract.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required desktop service value: ${name}`);
  return value;
}

const controlToken = required('APIARYLENS_DESKTOP_CONTROL_TOKEN');
const parentPid = Number(required('APIARYLENS_DESKTOP_PARENT_PID'));
const instanceName = required('APIARYLENS_DESKTOP_INSTANCE').replace(/[^a-zA-Z0-9_.-]/g, '-');
const readyFile = resolve(required('APIARYLENS_DESKTOP_READY_FILE'));
const webRoot = resolve(required('APIARYLENS_DESKTOP_WEB_ROOT'));
const databasePath = resolve(required('APIARYLENS_DATABASE'));
const mediaPath = resolve(required('APIARYLENS_MEDIA'));
const authRootSecret = required('APIARYLENS_AUTH_ROOT_SECRET');
const bootstrapToken = required('APIARYLENS_BOOTSTRAP_TOKEN');
if (!Number.isSafeInteger(parentPid) || parentPid < 1)
  throw new Error('Invalid desktop parent PID');
if (process.argv.some((argument) => argument.includes(controlToken))) {
  throw new Error('Desktop control token must never be passed in process arguments');
}

const store = new SqliteStore(databasePath, { authRootSecret });
const mediaStore = new FilesystemMediaStore(mediaPath);
const api = createApi({
  store,
  mediaStore,
  secureCookies: false,
  bootstrapToken,
  authRootSecret,
  buildIdentity: createBuildIdentity({ deploymentProfile: 'development' }),
});
const instanceGuard = createServer();
let server: ServerType | undefined;
let parentTimer: NodeJS.Timeout | undefined;
let endpoint = '';
let stopping = false;

const contentTypes: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function staticHeaders(contentType: string): Record<string, string> {
  return {
    'content-type': contentType,
    'content-security-policy':
      "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
  };
}

function staticResponse(url: URL): Response | undefined {
  if (url.pathname.startsWith('/api/') || url.pathname === '/health') return undefined;
  const requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const candidate = resolve(webRoot, requested);
  if (candidate !== webRoot && !candidate.startsWith(`${webRoot}${sep}`)) {
    return Response.json({ code: 'desktop_path_not_allowed' }, { status: 403 });
  }
  try {
    const bytes = readFileSync(candidate);
    return new Response(bytes, {
      headers: staticHeaders(
        contentTypes[extname(candidate).toLowerCase()] ?? 'application/octet-stream',
      ),
    });
  } catch {
    // SPA routes are served by index.html; missing asset paths remain 404.
    if (!extname(requested)) {
      return new Response(readFileSync(resolve(webRoot, 'index.html')), {
        headers: staticHeaders('text/html; charset=utf-8'),
      });
    }
    return Response.json({ code: 'desktop_asset_not_found' }, { status: 404 });
  }
}

async function protectedFetch(request: Request): Promise<Response> {
  const presented = request.headers.get(desktopControlHeader) ?? '';
  if (!safeTokenEqual(controlToken, presented)) {
    return Response.json({ code: 'desktop_control_unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/__desktop/shutdown') {
    if (request.headers.get('origin') !== null) {
      return Response.json({ code: 'desktop_host_only' }, { status: 403 });
    }
    setTimeout(() => stop(0), 25).unref();
    return Response.json({ stopping: true }, { status: 202 });
  }
  const origin = request.headers.get('origin');
  const staticAsset = request.method === 'GET' || request.method === 'HEAD';
  if (
    origin !== endpoint &&
    !(origin === null && staticAsset && !url.pathname.startsWith('/api/'))
  ) {
    return Response.json({ code: 'desktop_origin_not_allowed' }, { status: 403 });
  }
  const response = staticAsset ? staticResponse(url) : undefined;
  return response ?? api.fetch(request);
}

function stop(exitCode: number): void {
  if (stopping) return;
  stopping = true;
  if (parentTimer) clearInterval(parentTimer);
  rmSync(readyFile, { force: true });
  const finish = () => {
    try {
      store.close();
    } finally {
      instanceGuard.close(() => process.exit(exitCode));
    }
  };
  if (server) {
    server.close(finish);
    setTimeout(() => process.exit(exitCode), 3_000).unref();
  } else {
    finish();
  }
}

instanceGuard.once('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') process.exit(73);
  throw error;
});
instanceGuard.listen(`\\\\.\\pipe\\${instanceName}`, () => {
  server = serve({ fetch: protectedFetch, hostname: '127.0.0.1', port: 0 }, (address) => {
    if (address.address !== '127.0.0.1')
      throw new Error('Desktop service opened a non-loopback listener');
    endpoint = `http://127.0.0.1:${address.port}`;
    writeFileSync(
      readyFile,
      JSON.stringify({
        pid: process.pid,
        address: address.address,
        port: address.port,
        serviceProtocolVersion: 1,
        buildIdentityHash: createHash('sha256').update('0.1.0-preview.1').digest('hex'),
      }),
      { mode: 0o600 },
    );
    parentTimer = setInterval(() => {
      try {
        process.kill(parentPid, 0);
      } catch {
        stop(74);
      }
    }, 500);
    parentTimer.unref();
  });
});

process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));
process.on('uncaughtException', () => stop(70));
