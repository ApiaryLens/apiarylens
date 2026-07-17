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
  const mediaStore = new FilesystemMediaStore(path.join(dataDirectory, 'media'));
  const app = createApi({
    store,
    mediaStore,
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
    if (
      request.method === 'POST' &&
      new URL(request.url).pathname === '/__desktop/research/seed-foreign'
    ) {
      const timestamp = new Date().toISOString();
      const organizationId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const membershipId = crypto.randomUUID();
      const apiaryId = crypto.randomUUID();
      const mediaId = crypto.randomUUID();
      const mediaBytes = new Uint8Array([0xff, 0xd8, 0xff, 0x01]);
      store.database
        .prepare(
          `INSERT INTO organizations(id, name, timezone, created_at, updated_at)
           VALUES (?, 'Foreign family', 'UTC', ?, ?)`,
        )
        .run(organizationId, timestamp, timestamp);
      store.database
        .prepare(
          `INSERT INTO users(id, identifier, display_name, password_hash, created_at, updated_at)
           VALUES (?, ?, 'Foreign user', 'disabled', ?, ?)`,
        )
        .run(userId, `foreign-${userId}@example.test`, timestamp, timestamp);
      store.database
        .prepare(
          `INSERT INTO memberships(id, organization_id, user_id, role, status, created_at, updated_at)
           VALUES (?, ?, ?, 'viewer', 'active', ?, ?)`,
        )
        .run(membershipId, organizationId, userId, timestamp, timestamp);
      store.applyOperation(organizationId, userId, {
        operationId: crypto.randomUUID(),
        clientId: crypto.randomUUID(),
        entityType: 'apiary',
        entityId: apiaryId,
        action: 'create',
        baseVersion: 0,
        payload: { name: 'Private foreign apiary' },
        queuedAt: timestamp,
      });
      store.applyOperation(organizationId, userId, {
        operationId: crypto.randomUUID(),
        clientId: crypto.randomUUID(),
        entityType: 'mediaAsset',
        entityId: mediaId,
        action: 'create',
        baseVersion: 0,
        payload: {
          hiveId: crypto.randomUUID(),
          fileName: 'foreign.jpg',
          mediaType: 'image/jpeg',
          byteSize: mediaBytes.byteLength,
          sha256: crypto.createHash('sha256').update(mediaBytes).digest('hex'),
          state: 'ready',
        },
        queuedAt: timestamp,
      });
      await mediaStore.put(organizationId, mediaId, mediaBytes);
      return Response.json({ organizationId, apiaryId, mediaId }, { status: 201 });
    }
    if (
      request.method === 'POST' &&
      new URL(request.url).pathname === '/__desktop/research/check-foreign'
    ) {
      const input = await request.json();
      const apiary = store.getResource(input.organizationId, 'apiary', input.apiaryId);
      const mediaBytes = await mediaStore.get(input.organizationId, input.mediaId);
      return Response.json({
        apiaryUnchanged: apiary?.name === 'Private foreign apiary',
        mediaUnchanged:
          mediaBytes?.byteLength === 4 &&
          crypto.createHash('sha256').update(mediaBytes).digest('hex') ===
            crypto
              .createHash('sha256')
              .update(new Uint8Array([0xff, 0xd8, 0xff, 0x01]))
              .digest('hex'),
      });
    }
    if (
      request.method === 'POST' &&
      new URL(request.url).pathname === '/__desktop/research/commit-storage-marker'
    ) {
      const timestamp = new Date().toISOString();
      store.database
        .prepare(
          `INSERT INTO organizations(id, name, timezone, created_at, updated_at)
           VALUES ('win003-committed-storage-marker', 'Committed storage marker', 'UTC', ?, ?)`,
        )
        .run(timestamp, timestamp);
      return Response.json({ committed: true }, { status: 201 });
    }
    if (
      request.method === 'POST' &&
      new URL(request.url).pathname === '/__desktop/research/open-interrupted-write'
    ) {
      const timestamp = new Date().toISOString();
      store.database.exec('BEGIN IMMEDIATE');
      store.database
        .prepare(
          `INSERT INTO organizations(id, name, timezone, created_at, updated_at)
           VALUES ('win003-interrupted-storage-marker', 'Interrupted storage marker', 'UTC', ?, ?)`,
        )
        .run(timestamp, timestamp);
      return Response.json({ transactionOpen: true }, { status: 202 });
    }
    if (
      request.method === 'POST' &&
      new URL(request.url).pathname === '/__desktop/research/check-storage-recovery'
    ) {
      const integrityRows = store.database.prepare('PRAGMA integrity_check').all();
      const count = (id) =>
        store.database.prepare('SELECT COUNT(*) AS count FROM organizations WHERE id = ?').get(id)
          .count;
      return Response.json({
        integrityPassed: integrityRows.length === 1 && integrityRows[0].integrity_check === 'ok',
        committedMarkerRetained: count('win003-committed-storage-marker') === 1,
        interruptedMarkerRolledBack: count('win003-interrupted-storage-marker') === 0,
      });
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
        migrationVersions: store.database
          .prepare('SELECT version FROM migrations ORDER BY version')
          .all()
          .map(({ version }) => version),
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
