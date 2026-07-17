import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`missing-${name.toLowerCase()}`);
  return value;
};

const token = required('APIARYLENS_CONTROL_TOKEN');
const allowedOrigin = required('APIARYLENS_ALLOWED_ORIGIN');
const dataDirectory = path.resolve(required('APIARYLENS_DATA_DIRECTORY'));
const readyFile = path.resolve(required('APIARYLENS_READY_FILE'));
const parentPid = Number.parseInt(required('APIARYLENS_PARENT_PID'), 10);
const instanceName = required('APIARYLENS_INSTANCE_NAME').replace(/[^a-zA-Z0-9_.-]/g, '-');
const pipeName = `\\\\.\\pipe\\${instanceName}`;

if (!Number.isSafeInteger(parentPid) || parentPid < 1) throw new Error('invalid-parent-pid');
if (process.argv.some((argument) => argument.includes(token)))
  throw new Error('secret-present-in-arguments');

fs.mkdirSync(dataDirectory, { recursive: true });
const databasePath = path.join(dataDirectory, 'apiarylens-research.sqlite3');
const database = new DatabaseSync(databasePath);
database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
database.exec(`
  CREATE TABLE IF NOT EXISTS schema_metadata (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO schema_metadata (id, version) VALUES (1, 0);
`);
const currentVersion = database
  .prepare('SELECT version FROM schema_metadata WHERE id = 1')
  .get().version;
if (currentVersion < 1) {
  database.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS research_records (
      id TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    UPDATE schema_metadata SET version = 1 WHERE id = 1;
    COMMIT;
  `);
}

const safeEqual = (presented) => {
  const expectedBytes = Buffer.from(token, 'utf8');
  const presentedBytes = Buffer.from(presented, 'utf8');
  return (
    expectedBytes.length === presentedBytes.length &&
    crypto.timingSafeEqual(expectedBytes, presentedBytes)
  );
};

const authorize = (request, response) => {
  const authorization = request.headers.authorization ?? '';
  const presented = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!safeEqual(presented)) {
    response.writeHead(401, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end('{"error":"unauthorized"}');
    return false;
  }
  if (request.headers.origin !== allowedOrigin) {
    response.writeHead(403, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end('{"error":"origin-not-allowed"}');
    return false;
  }
  return true;
};

const readBody = async (request) => {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 16 * 1024) throw new Error('request-too-large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

let stopping = false;
let parentTimer;
const instanceGuard = net.createServer();
const httpServer = http.createServer(async (request, response) => {
  response.setHeader('access-control-allow-origin', allowedOrigin);
  response.setHeader('vary', 'origin');
  if (!authorize(request, response)) return;

  try {
    if (request.method === 'GET' && request.url === '/health') {
      const version = database
        .prepare('SELECT version FROM schema_metadata WHERE id = 1')
        .get().version;
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ status: 'ok', schemaVersion: version }));
      return;
    }
    if (request.method === 'POST' && request.url === '/records') {
      const body = await readBody(request);
      if (typeof body.id !== 'string' || typeof body.value !== 'string')
        throw new Error('invalid-record');
      database
        .prepare('INSERT INTO research_records (id, value, created_at) VALUES (?, ?, ?)')
        .run(body.id, body.value, new Date().toISOString());
      response.writeHead(201, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end('{"created":true}');
      return;
    }
    if (request.method === 'GET' && request.url === '/records') {
      const records = database.prepare('SELECT id, value FROM research_records ORDER BY id').all();
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ records }));
      return;
    }
    if (request.method === 'POST' && request.url === '/shutdown') {
      response.writeHead(202, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end('{"stopping":true}');
      setImmediate(() => stop(0));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end('{"error":"not-found"}');
  } catch (error) {
    response.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ error: error.message }));
  }
});

const stop = (exitCode) => {
  if (stopping) return;
  stopping = true;
  if (parentTimer) clearInterval(parentTimer);
  if (fs.existsSync(readyFile)) fs.rmSync(readyFile, { force: true });
  httpServer.close(() => {
    instanceGuard.close(() => {
      database.close();
      process.exit(exitCode);
    });
  });
  setTimeout(() => process.exit(exitCode), 3000).unref();
};

instanceGuard.once('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error('single-instance-unavailable');
    database.close();
    process.exit(73);
  }
  throw error;
});

instanceGuard.listen(pipeName, () => {
  httpServer.listen(0, '127.0.0.1', () => {
    const address = httpServer.address();
    fs.writeFileSync(
      readyFile,
      JSON.stringify({
        pid: process.pid,
        port: address.port,
        address: address.address,
        family: address.family,
        instanceName,
        dataDirectory,
        databasePath,
        schemaVersion: 1,
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
