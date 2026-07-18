import { serve, type ServerType } from '@hono/node-server';
import { SqliteStore } from '@apiarylens/database';
import { FilesystemMediaStore } from '@apiarylens/media';
import { createBuildIdentity } from '@apiarylens/contracts';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApi } from './app.js';
import { formatServerAddress, resolveServerBinding } from './runtime-config.js';

export type RunningServer = {
  server: ServerType;
  address: string;
  port: number;
  close: () => Promise<void>;
};

export function startServer(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<RunningServer> {
  const port = Number(environment.PORT ?? 3000);
  const databasePath = environment.APIARYLENS_DATABASE ?? './data/apiarylens.sqlite';
  const mediaPath = environment.APIARYLENS_MEDIA ?? './data/media';
  const bootstrapToken = environment.BOOTSTRAP_TOKEN_FILE
    ? readFileSync(environment.BOOTSTRAP_TOKEN_FILE, 'utf8').trim()
    : environment.BOOTSTRAP_TOKEN;
  const authRootSecret = environment.AUTH_ROOT_SECRET_FILE
    ? readFileSync(environment.AUTH_ROOT_SECRET_FILE, 'utf8').trim()
    : environment.AUTH_ROOT_SECRET;
  if (environment.NODE_ENV === 'production' && !bootstrapToken) {
    throw new Error('A protected first-owner bootstrap code is required in production');
  }
  if (environment.NODE_ENV === 'production' && (!authRootSecret || authRootSecret.length < 32)) {
    throw new Error('A durable authentication root secret of at least 32 characters is required');
  }
  const binding = resolveServerBinding(
    environment,
    Boolean(bootstrapToken && authRootSecret && authRootSecret.length >= 32),
  );
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const store = new SqliteStore(databasePath, {
    ...(authRootSecret ? { authRootSecret } : {}),
  });
  const mediaStore = new FilesystemMediaStore(mediaPath);
  const app = createApi({
    store,
    mediaStore,
    secureCookies: environment.NODE_ENV === 'production',
    ...(bootstrapToken ? { bootstrapToken } : {}),
    ...(authRootSecret ? { authRootSecret } : {}),
    buildIdentity: createBuildIdentity({
      deploymentProfile: 'compose',
      ...(environment.APIARYLENS_SOURCE_COMMIT
        ? { sourceCommit: environment.APIARYLENS_SOURCE_COMMIT }
        : {}),
      ...(environment.APIARYLENS_BUILD_TIME
        ? { buildTime: environment.APIARYLENS_BUILD_TIME }
        : {}),
      ...(environment.APIARYLENS_ARTIFACT_IDENTITY
        ? { artifactIdentity: environment.APIARYLENS_ARTIFACT_IDENTITY }
        : {}),
    }),
  });

  return new Promise((resolveStarted) => {
    const server = serve({ fetch: app.fetch, port, hostname: binding.hostname }, (info) => {
      console.log(`ApiaryLens API listening on ${formatServerAddress(info.address, info.port)}`);
      resolveStarted({
        server,
        address: info.address,
        port: info.port,
        close: () =>
          new Promise<void>((resolveClosed, rejectClosed) => {
            server.close((error) => {
              store.close();
              if (error) rejectClosed(error);
              else resolveClosed();
            });
          }),
      });
    });
  });
}
