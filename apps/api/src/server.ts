import { serve } from '@hono/node-server';
import { SqliteStore } from '@apiarylens/database';
import { FilesystemMediaStore } from '@apiarylens/media';
import { createBuildIdentity } from '@apiarylens/contracts';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApi } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const databasePath = process.env.APIARYLENS_DATABASE ?? './data/apiarylens.sqlite';
const mediaPath = process.env.APIARYLENS_MEDIA ?? './data/media';
const bootstrapToken = process.env.BOOTSTRAP_TOKEN_FILE
  ? readFileSync(process.env.BOOTSTRAP_TOKEN_FILE, 'utf8').trim()
  : process.env.BOOTSTRAP_TOKEN;
const authRootSecret = process.env.AUTH_ROOT_SECRET_FILE
  ? readFileSync(process.env.AUTH_ROOT_SECRET_FILE, 'utf8').trim()
  : process.env.AUTH_ROOT_SECRET;
if (process.env.NODE_ENV === 'production' && !bootstrapToken) {
  throw new Error('A protected first-owner bootstrap code is required in production');
}
if (process.env.NODE_ENV === 'production' && (!authRootSecret || authRootSecret.length < 32)) {
  throw new Error('A durable authentication root secret of at least 32 characters is required');
}
if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
const store = new SqliteStore(databasePath, {
  ...(authRootSecret ? { authRootSecret } : {}),
});
const mediaStore = new FilesystemMediaStore(mediaPath);
const app = createApi({
  store,
  mediaStore,
  secureCookies: process.env.NODE_ENV === 'production',
  ...(bootstrapToken ? { bootstrapToken } : {}),
  ...(authRootSecret ? { authRootSecret } : {}),
  buildIdentity: createBuildIdentity({
    deploymentProfile: 'compose',
    ...(process.env.APIARYLENS_SOURCE_COMMIT
      ? { sourceCommit: process.env.APIARYLENS_SOURCE_COMMIT }
      : {}),
    ...(process.env.APIARYLENS_BUILD_TIME ? { buildTime: process.env.APIARYLENS_BUILD_TIME } : {}),
    ...(process.env.APIARYLENS_ARTIFACT_IDENTITY
      ? { artifactIdentity: process.env.APIARYLENS_ARTIFACT_IDENTITY }
      : {}),
  }),
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`ApiaryLens API listening on http://127.0.0.1:${info.port}`);
});
