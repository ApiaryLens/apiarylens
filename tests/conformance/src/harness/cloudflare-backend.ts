import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import workerApp from '@apiarylens/worker/app';
import { AUTH_ROOT_SECRET } from '../fixtures/data.js';
import type { ConformanceBackend } from './backend.js';
import { readResourceValueRow, seedForeignOrganizationRows } from './seed.js';

const migrationsDirectory = fileURLToPath(
  new URL('../../../../apps/worker/migrations/', import.meta.url),
);

/**
 * The Cloudflare deployment profile: the exact `apps/worker` Hono application
 * over the repository's established workerd-shape test harness (D1 statement
 * semantics over SQLite, R2 object semantics over memory), matching the
 * harness the worker's own suite uses.
 */
class HarnessD1Statement {
  private parameters: SQLInputValue[] = [];

  constructor(private readonly statement: StatementSync) {}

  bind(...parameters: unknown[]) {
    this.parameters = parameters as SQLInputValue[];
    return this;
  }

  first<T>() {
    return Promise.resolve((this.statement.get(...this.parameters) ?? null) as T | null);
  }

  all<T>() {
    return Promise.resolve({ results: this.statement.all(...this.parameters) as T[] });
  }

  run() {
    const result = this.statement.run(...this.parameters);
    return Promise.resolve({
      success: true,
      meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) },
    });
  }
}

class HarnessD1Database {
  readonly database = new DatabaseSync(':memory:');

  constructor() {
    const migrations = readdirSync(migrationsDirectory)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    for (const migration of migrations) {
      this.database.exec(readFileSync(join(migrationsDirectory, migration), 'utf8'));
    }
  }

  prepare(sql: string) {
    return new HarnessD1Statement(this.database.prepare(sql));
  }

  async batch(statements: HarnessD1Statement[]) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }

  close() {
    this.database.close();
  }
}

class HarnessR2Bucket {
  readonly objects = new Map<string, Uint8Array>();

  put(key: string, value: ArrayBuffer | Uint8Array) {
    this.objects.set(
      key,
      value instanceof Uint8Array ? value.slice() : new Uint8Array(value).slice(),
    );
    return Promise.resolve();
  }

  get(key: string) {
    const value = this.objects.get(key);
    return Promise.resolve(
      value
        ? {
            body: value.slice(),
            arrayBuffer: () => Promise.resolve(value.slice().buffer),
          }
        : null,
    );
  }

  delete(key: string) {
    this.objects.delete(key);
    return Promise.resolve();
  }

  list() {
    return Promise.resolve({
      objects: Array.from(this.objects.keys(), (key) => ({ key })),
      truncated: false as const,
    });
  }
}

export function createCloudflareBackend(): ConformanceBackend {
  const db = new HarnessD1Database();
  const media = new HarnessR2Bucket();
  const environment = {
    DB: db as unknown as D1Database,
    MEDIA: media as unknown as R2Bucket,
    AUTH_ROOT_SECRET,
  };
  return {
    label: 'cloudflare',
    description: 'Cloudflare profile (apps/worker + workerd-shape D1/R2 harness)',
    request: async (path, init) => workerApp.request(path, init, environment),
    async seedForeignOrganization(memberUserId) {
      const seed = seedForeignOrganizationRows(db.database, memberUserId);
      await media.put(`${seed.organizationId}/${seed.mediaId}`, seed.mediaBytes);
      return seed;
    },
    readResourceValue: (organizationId, entityType, id) =>
      readResourceValueRow(db.database, organizationId, entityType, id),
    close: () => db.close(),
  };
}
