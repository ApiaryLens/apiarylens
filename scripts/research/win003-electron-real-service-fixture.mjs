import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { serve } from '@hono/node-server';
import { createBuildIdentity } from '@apiarylens/contracts';
import { SqliteStore } from '@apiarylens/database';
import { FilesystemMediaStore } from '@apiarylens/media';
import { createApi } from './dist/app.js';

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
  if (error.code === 'EADDRINUSE') process.exit(73);
  throw error;
});

instanceGuard.listen(pipeName, () => {
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.mkdirSync(path.join(dataDirectory, 'media'), { recursive: true });
  store = new SqliteStore(path.join(dataDirectory, 'apiarylens.sqlite'), { authRootSecret });
  const app = createApi({
    store,
    mediaStore: new FilesystemMediaStore(path.join(dataDirectory, 'media')),
    secureCookies: false,
    bootstrapToken,
    authRootSecret,
    buildIdentity: createBuildIdentity({ deploymentProfile: 'development' }),
  });

  const protectedFetch = async (request) => {
    const authorization = request.headers.get('authorization') ?? '';
    const presented = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!safeEqual(presented)) {
      return Response.json({ code: 'desktop_control_unauthorized' }, { status: 401 });
    }
    if (request.headers.get('origin') !== allowedOrigin) {
      return Response.json({ code: 'desktop_origin_not_allowed' }, { status: 403 });
    }
    if (request.method === 'POST' && new URL(request.url).pathname === '/__desktop/shutdown') {
      setImmediate(() => stop(0));
      return Response.json({ stopping: true }, { status: 202 });
    }
    return app.fetch(request);
  };

  httpServer = serve({ fetch: protectedFetch, hostname: '127.0.0.1', port: 0 }, (address) => {
    fs.writeFileSync(
      readyFile,
      JSON.stringify({
        pid: process.pid,
        address: address.address,
        port: address.port,
        serviceProtocolVersion: 1,
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
