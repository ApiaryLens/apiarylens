import { createHash, randomUUID } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';

const bytesEqual = (left, right) =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

export async function runApiAcceptance({
  endpoint,
  controlToken,
  allowedOrigin,
  bootstrapToken,
  migrationVersions,
  restartService,
  credentialLifecycle,
}) {
  let baseUrl = endpoint;
  let checkCount = 0;
  const expect = (condition, name) => {
    checkCount += 1;
    if (!condition) throw new Error(`api-acceptance-${name}`);
  };
  const request = (path, options = {}) =>
    fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${controlToken}`,
        origin: allowedOrigin,
        ...(options.headers ?? {}),
      },
    });
  const json = async (response) => response.json();
  const cookieFrom = (response) => response.headers.get('set-cookie')?.split(';')[0] ?? '';
  const ownerIdentifier = 'installed-owner@example.test';
  const ownerPassword = 'installed acceptance password one';
  const recoveredPassword = 'installed acceptance password two';

  expect(
    JSON.stringify(migrationVersions) === JSON.stringify(['0001', '0002', '0003', '0004']),
    'migration-head',
  );
  const bootstrapStatus = await request('/api/v1/bootstrap/status');
  expect(bootstrapStatus.status === 200, 'bootstrap-status-code');
  expect((await json(bootstrapStatus)).requiresToken === true, 'bootstrap-token-required');

  const bootstrapPayload = {
    identifier: ownerIdentifier,
    displayName: 'Installed Artifact Owner',
    password: ownerPassword,
    organizationName: 'Installed Artifact Apiary',
    timezone: 'America/New_York',
  };
  const rejectedBootstrap = await request('/api/v1/bootstrap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...bootstrapPayload, bootstrapToken: 'incorrect-bootstrap-token' }),
  });
  expect(rejectedBootstrap.status === 403, 'bootstrap-wrong-token-rejected');

  const bootstrap = await request('/api/v1/bootstrap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...bootstrapPayload, bootstrapToken }),
  });
  expect(bootstrap.status === 201, 'bootstrap-created');
  const bootstrapCookieHeader = bootstrap.headers.get('set-cookie') ?? '';
  expect(bootstrapCookieHeader.includes('HttpOnly'), 'session-cookie-http-only');
  expect(bootstrapCookieHeader.includes('SameSite=Strict'), 'session-cookie-same-site');
  let ownerCookie = cookieFrom(bootstrap);
  const owner = await json(bootstrap);
  expect(Boolean(ownerCookie) && owner.csrfToken.length > 32, 'owner-session-issued');
  credentialLifecycle?.issued(ownerCookie);

  const secondBootstrap = await request('/api/v1/bootstrap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...bootstrapPayload,
      identifier: 'second-owner@example.test',
      bootstrapToken,
    }),
  });
  expect(secondBootstrap.status === 409, 'bootstrap-single-use');

  const openApi = await request('/api/v1/openapi.json');
  expect(openApi.status === 200 && (await json(openApi)).openapi === '3.1.0', 'openapi-published');

  const seed = await request('/__desktop/research/seed-foreign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  expect(seed.status === 201, 'foreign-family-seeded');
  const foreign = await json(seed);
  const ownerHeaders = { cookie: ownerCookie };
  const foreignList = await request('/api/v1/resources/apiary', { headers: ownerHeaders });
  expect(
    foreignList.status === 200 && (await json(foreignList)).items.length === 0,
    'foreign-list-hidden',
  );
  expect(
    (await request(`/api/v1/resources/apiary/${foreign.apiaryId}`, { headers: ownerHeaders }))
      .status === 404,
    'foreign-lookup-hidden',
  );
  expect(
    (await request(`/api/v1/media/${foreign.mediaId}/content`, { headers: ownerHeaders }))
      .status === 404,
    'foreign-media-hidden',
  );
  const changes = await request('/api/v1/sync/pull', { headers: ownerHeaders });
  expect(
    changes.status === 200 && (await json(changes)).changes.length === 0,
    'foreign-changes-hidden',
  );
  const members = await request('/api/v1/members', { headers: ownerHeaders });
  expect(
    members.status === 200 && (await json(members)).items.length === 1,
    'foreign-membership-hidden',
  );

  const foreignUpdate = await request('/api/v1/sync/push', {
    method: 'POST',
    headers: {
      ...ownerHeaders,
      'content-type': 'application/json',
      'x-csrf-token': owner.csrfToken,
    },
    body: JSON.stringify({
      syncContractVersion: 1,
      operations: [
        {
          operationId: randomUUID(),
          clientId: randomUUID(),
          entityType: 'apiary',
          entityId: foreign.apiaryId,
          action: 'update',
          baseVersion: 1,
          payload: { name: 'Unauthorized change' },
          queuedAt: new Date().toISOString(),
        },
      ],
    }),
  });
  expect((await json(foreignUpdate)).results[0].status === 'conflict', 'foreign-update-denied');
  const foreignCheck = await request('/__desktop/research/check-foreign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(foreign),
  });
  const foreignState = await json(foreignCheck);
  expect(foreignState.apiaryUnchanged && foreignState.mediaUnchanged, 'foreign-state-unchanged');

  const operation = {
    operationId: randomUUID(),
    clientId: randomUUID(),
    entityType: 'apiary',
    entityId: randomUUID(),
    action: 'create',
    baseVersion: 0,
    payload: { name: 'Installed artifact apiary' },
    queuedAt: new Date().toISOString(),
  };
  const withoutCsrf = await request('/api/v1/sync/push', {
    method: 'POST',
    headers: { ...ownerHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ syncContractVersion: 1, operations: [operation] }),
  });
  expect(withoutCsrf.status === 403, 'csrf-required');
  const push = () =>
    request('/api/v1/sync/push', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': owner.csrfToken,
      },
      body: JSON.stringify({ syncContractVersion: 1, operations: [operation] }),
    });
  expect((await json(await push())).results[0].status === 'accepted', 'sync-write-accepted');
  expect((await json(await push())).results[0].status === 'duplicate', 'sync-write-deduplicated');

  const refreshed = await request('/api/v1/session', { headers: ownerHeaders });
  expect(refreshed.status === 200, 'session-refresh');
  const oldOwnerCookie = ownerCookie;
  ownerCookie = cookieFrom(refreshed);
  const refreshedOwner = await json(refreshed);
  expect(ownerCookie !== oldOwnerCookie, 'session-cookie-rotated');
  credentialLifecycle?.rotated(oldOwnerCookie, ownerCookie);
  expect(
    (await request('/api/v1/session', { headers: { cookie: oldOwnerCookie } })).status === 401,
    'old-session-revoked',
  );
  expect(
    (await request('/api/v1/members', { headers: { cookie: ownerCookie } })).status === 200,
    'rotated-session-valid',
  );

  const mediaId = randomUUID();
  const mediaBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3]);
  const thumbnailBytes = new Uint8Array([0xff, 0xd8, 1, 2, 3]);
  const mediaOperation = {
    operationId: randomUUID(),
    clientId: randomUUID(),
    entityType: 'mediaAsset',
    entityId: mediaId,
    action: 'create',
    baseVersion: 0,
    payload: {
      hiveId: randomUUID(),
      fileName: 'installed-inspection.jpg',
      mediaType: 'image/jpeg',
      byteSize: mediaBytes.byteLength,
      sha256: createHash('sha256').update(mediaBytes).digest('hex'),
      state: 'staged',
    },
    queuedAt: new Date().toISOString(),
  };
  const currentOwnerHeaders = {
    cookie: ownerCookie,
    'x-csrf-token': refreshedOwner.csrfToken,
  };
  const metadata = await request('/api/v1/sync/push', {
    method: 'POST',
    headers: { ...currentOwnerHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ syncContractVersion: 1, operations: [mediaOperation] }),
  });
  expect(metadata.status === 200, 'media-metadata-created');
  const upload = await request(`/api/v1/media/${mediaId}/content`, {
    method: 'PUT',
    headers: { ...currentOwnerHeaders, 'content-type': 'image/jpeg' },
    body: mediaBytes,
  });
  const uploaded = await json(upload);
  expect(upload.status === 200 && uploaded.state === 'ready', 'media-original-uploaded');
  const thumbnail = await request(`/api/v1/media/${mediaId}/thumbnail`, {
    method: 'PUT',
    headers: { ...currentOwnerHeaders, 'content-type': 'image/jpeg' },
    body: thumbnailBytes,
  });
  expect(thumbnail.status === 204, 'media-thumbnail-uploaded');
  const originalDownload = await request(`/api/v1/media/${mediaId}/content`, {
    headers: { cookie: ownerCookie },
  });
  expect(
    bytesEqual(new Uint8Array(await originalDownload.arrayBuffer()), mediaBytes),
    'media-original-downloaded',
  );
  const thumbnailDownload = await request(`/api/v1/media/${mediaId}/content?variant=thumbnail`, {
    headers: { cookie: ownerCookie },
  });
  expect(
    bytesEqual(new Uint8Array(await thumbnailDownload.arrayBuffer()), thumbnailBytes),
    'media-thumbnail-downloaded',
  );
  expect((await request(`/api/v1/media/${mediaId}/content`)).status === 401, 'media-auth-required');

  const invitation = await request('/api/v1/invitations', {
    method: 'POST',
    headers: { ...currentOwnerHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      displayName: 'Installed Viewer',
      identifier: 'installed-viewer@example.test',
      role: 'viewer',
      expiresInHours: 48,
    }),
  });
  expect(invitation.status === 201, 'viewer-invited');
  const invitationBody = await json(invitation);
  const acceptedViewer = await request('/api/v1/invitations/accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: invitationBody.token, password: 'installed viewer password' }),
  });
  expect(acceptedViewer.status === 201, 'viewer-enrolled');
  const viewerCookie = cookieFrom(acceptedViewer);
  const viewer = await json(acceptedViewer);
  const viewerHeaders = { cookie: viewerCookie, 'x-csrf-token': viewer.csrfToken };
  const viewerWrite = await request('/api/v1/sync/push', {
    method: 'POST',
    headers: { ...viewerHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      syncContractVersion: 1,
      operations: [{ ...operation, operationId: randomUUID(), entityId: randomUUID() }],
    }),
  });
  expect(viewerWrite.status === 403, 'viewer-write-denied');
  expect(
    (await request('/api/v1/export/full', { headers: { cookie: viewerCookie } })).status === 403,
    'viewer-export-denied',
  );
  expect(
    (
      await request(`/api/v1/media/${mediaId}/content`, {
        method: 'DELETE',
        headers: viewerHeaders,
      })
    ).status === 403,
    'viewer-media-delete-denied',
  );

  const ownerExport = await request('/api/v1/export/full', { headers: { cookie: ownerCookie } });
  expect(ownerExport.status === 200, 'owner-export-created');
  const exportFiles = unzipSync(new Uint8Array(await ownerExport.arrayBuffer()));
  const manifest = JSON.parse(strFromU8(exportFiles['manifest.json']));
  const exportedData = JSON.parse(strFromU8(exportFiles['data.json']));
  expect(manifest.exportFormat === 1, 'export-manifest-version');
  expect(
    bytesEqual(exportFiles[`media/${mediaId}/installed-inspection.jpg`], mediaBytes),
    'export-media-present',
  );
  expect(
    !exportedData.apiary.some((item) => item.id === foreign.apiaryId),
    'foreign-apiary-excluded-from-export',
  );
  expect(
    !exportedData.mediaAsset.some((item) => item.id === foreign.mediaId),
    'foreign-media-excluded-from-export',
  );

  const recovery = await request('/api/v1/auth/recover', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identifier: ownerIdentifier,
      recoveryCode: owner.recoveryCodes[0],
      newPassword: recoveredPassword,
    }),
  });
  expect(recovery.status === 204, 'recovery-succeeded');
  expect(
    (await request('/api/v1/session', { headers: { cookie: ownerCookie } })).status === 401,
    'recovery-revoked-session',
  );
  credentialLifecycle?.revoked(ownerCookie);
  const reusedRecovery = await request('/api/v1/auth/recover', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identifier: ownerIdentifier,
      recoveryCode: owner.recoveryCodes[0],
      newPassword: 'third password must not be accepted',
    }),
  });
  expect(reusedRecovery.status === 400, 'recovery-code-one-time');

  const restarted = await restartService();
  baseUrl = restarted.endpoint;
  expect(
    JSON.stringify(restarted.migrationVersions) ===
      JSON.stringify(['0001', '0002', '0003', '0004']),
    'restart-migration-head',
  );
  const signIn = await request('/api/v1/auth/sign-in', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: ownerIdentifier, password: recoveredPassword }),
  });
  expect(signIn.status === 200, 'restart-sign-in');
  const restartedCookie = cookieFrom(signIn);
  const restartedOwner = await json(signIn);
  credentialLifecycle?.issued(restartedCookie);
  const persistedMedia = await request(`/api/v1/media/${mediaId}/content`, {
    headers: { cookie: restartedCookie },
  });
  expect(
    bytesEqual(new Uint8Array(await persistedMedia.arrayBuffer()), mediaBytes),
    'restart-media-persisted',
  );
  const persistedApiary = await request(`/api/v1/resources/apiary/${operation.entityId}`, {
    headers: { cookie: restartedCookie },
  });
  expect(persistedApiary.status === 200, 'restart-resource-persisted');

  const deletion = await request('/api/v1/sync/push', {
    method: 'POST',
    headers: {
      cookie: restartedCookie,
      'content-type': 'application/json',
      'x-csrf-token': restartedOwner.csrfToken,
    },
    body: JSON.stringify({
      syncContractVersion: 1,
      operations: [
        {
          ...mediaOperation,
          operationId: randomUUID(),
          action: 'delete',
          baseVersion: uploaded.version,
          payload: null,
        },
      ],
    }),
  });
  expect(deletion.status === 200, 'media-delete-synchronized');
  expect(
    (await request(`/api/v1/media/${mediaId}/content`, { headers: { cookie: restartedCookie } }))
      .status === 404,
    'media-delete-applied',
  );
  credentialLifecycle?.signedOut(restartedCookie);

  return Object.freeze({
    passed: true,
    checkCount,
    migrationVersions: restarted.migrationVersions,
    bootstrapProtected: true,
    csrfAndDeduplicationPassed: true,
    organizationIsolationPassed: true,
    sessionRotationAndRecoveryPassed: true,
    viewerAuthorizationPassed: true,
    mediaOriginalThumbnailExportDeletePassed: true,
    restartPersistencePassed: true,
    serverSessionCredentialLifecyclePassed: credentialLifecycle?.passed() ?? false,
  });
}
