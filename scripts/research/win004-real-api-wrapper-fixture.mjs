import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { serve } from '../../apps/api/node_modules/@hono/node-server/dist/index.mjs';
import { createApi } from '../../apps/api/dist/app.js';
import { createBuildIdentity } from '../../packages/contracts/dist/index.js';
import { SqliteStore } from '../../packages/database/dist/index.js';
import { FilesystemMediaStore } from '../../packages/media/dist/index.js';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`missing-${name.toLowerCase()}`);
  return value;
};

const controlToken = required('APIARYLENS_CONTROL_TOKEN');
const allowedOrigin = required('APIARYLENS_ALLOWED_ORIGIN');
const dataDirectory = path.resolve(required('APIARYLENS_DATA_DIRECTORY'));
const readyFile = path.resolve(required('APIARYLENS_READY_FILE'));
const parentPid = Number.parseInt(required('APIARYLENS_PARENT_PID'), 10);
const instanceName = required('APIARYLENS_INSTANCE_NAME').replace(/[^a-zA-Z0-9_.-]/g, '-');
const bootstrapToken = required('APIARYLENS_BOOTSTRAP_TOKEN');
const authRootSecret = required('APIARYLENS_AUTH_ROOT_SECRET');
const pipeName = `\\\\.\\pipe\\${instanceName}`;

if (!Number.isSafeInteger(parentPid) || parentPid < 1) throw new Error('invalid-parent-pid');
if (process.argv.some((argument) => argument.includes(controlToken))) {
  throw new Error('control-token-present-in-arguments');
}

const safeEqual = (presented) => {
  const expectedBytes = Buffer.from(controlToken, 'utf8');
  const presentedBytes = Buffer.from(presented, 'utf8');
  return (
    expectedBytes.length === presentedBytes.length &&
    crypto.timingSafeEqual(expectedBytes, presentedBytes)
  );
};

let stopping = false;
let parentTimer;
let httpServer;
let store;
const instanceGuard = net.createServer();

const stop = (exitCode) => {
  if (stopping) return;
  stopping = true;
  if (parentTimer) clearInterval(parentTimer);
  if (fs.existsSync(readyFile)) fs.rmSync(readyFile, { force: true });

  const closeStoreAndGuard = () => {
    try {
      store?.close();
    } finally {
      instanceGuard.close(() => process.exit(exitCode));
    }
  };
  if (httpServer) {
    httpServer.close(closeStoreAndGuard);
    setTimeout(() => process.exit(exitCode), 3000).unref();
  } else {
    closeStoreAndGuard();
  }
};

instanceGuard.once('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error('single-instance-unavailable');
    process.exit(73);
  }
  throw error;
});

instanceGuard.listen(pipeName, () => {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const databasePath = path.join(dataDirectory, 'apiarylens.sqlite');
  const mediaPath = path.join(dataDirectory, 'media');
  store = new SqliteStore(databasePath, { authRootSecret });
  const app = createApi({
    store,
    mediaStore: new FilesystemMediaStore(mediaPath),
    secureCookies: false,
    bootstrapToken,
    authRootSecret,
    buildIdentity: createBuildIdentity({ deploymentProfile: 'development' }),
  });

  const protectedFetch = async (request) => {
    const authorization = request.headers.get('authorization') ?? '';
    const presented = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!safeEqual(presented)) {
      return Response.json(
        { code: 'desktop_control_unauthorized' },
        { status: 401, headers: { 'cache-control': 'no-store' } },
      );
    }
    if (request.headers.get('origin') !== allowedOrigin) {
      return Response.json(
        { code: 'desktop_origin_not_allowed' },
        { status: 403, headers: { 'cache-control': 'no-store' } },
      );
    }
    if (request.method === 'POST' && new URL(request.url).pathname === '/__desktop/shutdown') {
      setImmediate(() => stop(0));
      return Response.json({ stopping: true }, { status: 202 });
    }
    return app.fetch(request);
  };

  httpServer = serve({ fetch: protectedFetch, port: 0, hostname: '127.0.0.1' }, (address) => {
    fs.writeFileSync(
      readyFile,
      JSON.stringify({
        pid: process.pid,
        port: address.port,
        address: address.address,
        family: address.family,
        instanceName,
        protocolVersion: 1,
      }),
      { encoding: 'utf8', mode: 0o600 },
    );
    parentTimer = setInterval(() => {
      try {
        process.kill(parentPid, 0);
      } catch {
        stop(74);
      }
    }, 250);
    parentTimer.unref();
  });
});

process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));
process.on('uncaughtException', (error) => {
  console.error(`fatal:${error.message}`);
  stop(70);
});
