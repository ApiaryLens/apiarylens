import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { unzipSync } from 'fflate';

const baseUrl = process.env.APIARYLENS_UAT_URL?.replace(/\/$/, '');
const operatorToken = process.env.APIARYLENS_UAT_OPERATOR_TOKEN;
const bootstrapToken = process.env.APIARYLENS_UAT_BOOTSTRAP_TOKEN;
const evidencePath = process.env.APIARYLENS_UAT_EVIDENCE;
const expectedSourceCommit = process.env.APIARYLENS_UAT_SOURCE_COMMIT;
const deploymentProfile = process.env.APIARYLENS_UAT_PROFILE ?? 'cloudflare';
if (!baseUrl) throw new Error('APIARYLENS_UAT_URL is required');
if (deploymentProfile === 'cloudflare' && !operatorToken)
  throw new Error('APIARYLENS_UAT_OPERATOR_TOKEN is required for Cloudflare recovery UAT');
if (!bootstrapToken) throw new Error('APIARYLENS_UAT_BOOTSTRAP_TOKEN is required');

class Client {
  cookie = '';

  async fetch(path, init = {}) {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set('cookie', this.cookie);
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers, redirect: 'error' });
    const setCookie = response.headers.get('set-cookie');
    const match = setCookie?.match(/__Host-apiarylens-session=([^;,\s]+)/);
    if (match) this.cookie = `__Host-apiarylens-session=${match[1]}`;
    return response;
  }
}

const report = {
  product: 'ApiaryLens',
  release: '0.1.0-rc.7',
  profile: `${deploymentProfile}-uat`,
  target: baseUrl,
  startedAt: new Date().toISOString(),
  sourceCommit: null,
  databaseMigration: null,
  checks: [],
};

function record(name, detail) {
  report.checks.push({ name, result: 'pass', detail });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function bodyForError(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function expect(response, status, label) {
  if (response.status !== status) {
    throw new Error(
      `${label}: expected ${status}, received ${response.status}: ${JSON.stringify(await bodyForError(response))}`,
    );
  }
  return response;
}

async function json(client, path, init, status, label) {
  const response = await expect(await client.fetch(path, init), status, label);
  return response.json();
}

function operation(clientId, entityType, entityId, action, baseVersion, payload) {
  return {
    operationId: randomUUID(),
    clientId,
    entityType,
    entityId,
    action,
    baseVersion,
    payload,
    queuedAt: new Date().toISOString(),
  };
}

async function push(client, csrfToken, operations, label) {
  return json(
    client,
    '/api/v1/sync/push',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ syncContractVersion: 1, operations }),
    },
    200,
    label,
  );
}

async function operatorFetch(path, init) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await anonymous.fetch(path, init);
    if (response.status !== 404 || attempt === 119) return response;
    await response.arrayBuffer();
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error('operator authorization did not become available');
}

const anonymous = new Client();
const owner = new Client();
const beekeeper = new Client();
const viewer = new Client();
const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const ownerIdentifier = `owner-${suffix}@uat.apiarylens.invalid`;
const beekeeperIdentifier = `beekeeper-${suffix}@uat.apiarylens.invalid`;
const viewerIdentifier = `viewer-${suffix}@uat.apiarylens.invalid`;
const ownerPassword = `Owner-${randomBytes(18).toString('base64url')}!`;
const beekeeperPassword = `Keeper-${randomBytes(18).toString('base64url')}!`;
const viewerPassword = `Viewer-${randomBytes(18).toString('base64url')}!`;

let healthResponse;
let health;
for (let attempt = 0; attempt < 120; attempt += 1) {
  const candidateResponse = await anonymous.fetch('/health');
  if (candidateResponse.status === 200) {
    const candidateHealth = await candidateResponse.json();
    const sourceMatches =
      !expectedSourceCommit || candidateHealth.build?.sourceCommit === expectedSourceCommit;
    if (candidateHealth.build?.databaseMigration === '0004' && sourceMatches) {
      healthResponse = candidateResponse;
      health = candidateHealth;
      break;
    }
  } else {
    await candidateResponse.arrayBuffer();
  }
  if (attempt < 119) await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
}
assert(healthResponse && health, 'expected deployment did not become available');
assert(
  health.status === 'ok' &&
    (health.profile ?? health.build?.deploymentProfile) === deploymentProfile,
  'health identity is invalid',
);
assert(health.build.databaseMigration === '0004', 'migration head is not 0004');
assert(
  !expectedSourceCommit || health.build.sourceCommit === expectedSourceCommit,
  'source commit does not match the build under test',
);
assert(
  healthResponse.headers.get('x-content-type-options') === 'nosniff',
  'secure headers missing',
);
report.sourceCommit = health.build.sourceCommit;
report.databaseMigration = health.build.databaseMigration;
record(
  'health-and-headers',
  `HTTPS health identifies ${health.build.artifactIdentity} at migration 0004`,
);

let bootstrapStatus;
for (let attempt = 0; attempt < 120; attempt += 1) {
  bootstrapStatus = await json(owner, '/api/v1/bootstrap/status', {}, 200, 'bootstrap status');
  if (bootstrapStatus.requiresToken) break;
  assert(bootstrapStatus.available === true, 'isolated UAT target has already been bootstrapped');
  if (attempt < 119) await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
}
assert(bootstrapStatus.available === true, 'isolated UAT target has already been bootstrapped');
assert(bootstrapStatus.requiresToken === true, 'isolated UAT bootstrap is not token-protected');
await expect(
  await owner.fetch('/api/v1/bootstrap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      bootstrapToken: `invalid-${randomBytes(16).toString('hex')}`,
      identifier: ownerIdentifier,
      displayName: 'UAT Owner',
      password: ownerPassword,
      organizationName: 'ApiaryLens UAT Family',
      timezone: 'America/New_York',
    }),
  }),
  403,
  'reject invalid bootstrap token',
);
let ownerSession;
for (let attempt = 0; attempt < 120; attempt += 1) {
  const response = await owner.fetch('/api/v1/bootstrap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      bootstrapToken,
      identifier: ownerIdentifier,
      displayName: 'UAT Owner',
      password: ownerPassword,
      organizationName: 'ApiaryLens UAT Family',
      timezone: 'America/New_York',
    }),
  });
  if (response.status === 201) {
    ownerSession = await response.json();
    break;
  }
  if (response.status !== 403 || attempt === 119) {
    await expect(response, 201, 'bootstrap owner');
  }
  await response.arrayBuffer();
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
}
assert(ownerSession, 'bootstrap owner did not become available after secret propagation');
assert(ownerSession.recoveryCodes.length === 8, 'owner recovery codes were not issued');
record(
  'protected-bootstrap',
  'Rejected an invalid deployment code, then created the first owner and family; eight recovery codes issued',
);

const initialOwnerCookie = owner.cookie;
const refreshedOwnerSession = await json(owner, '/api/v1/session', {}, 200, 'rotate owner session');
assert(owner.cookie && owner.cookie !== initialOwnerCookie, 'owner session cookie did not rotate');
const staleOwner = new Client();
staleOwner.cookie = initialOwnerCookie;
await expect(await staleOwner.fetch('/api/v1/session'), 401, 'reject rotated owner session');
ownerSession.csrfToken = refreshedOwnerSession.csrfToken;
record(
  'session-rotation',
  'Session refresh issued a new opaque cookie and immediately rejected the prior identifier',
);

async function inviteAndAccept(client, identifier, displayName, role, password) {
  const invitation = await json(
    owner,
    '/api/v1/invitations',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': ownerSession.csrfToken },
      body: JSON.stringify({ identifier, displayName, role, expiresInHours: 48 }),
    },
    201,
    `invite ${role}`,
  );
  return json(
    client,
    '/api/v1/invitations/accept',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: invitation.token, password }),
    },
    201,
    `accept ${role}`,
  );
}

const beekeeperSession = await inviteAndAccept(
  beekeeper,
  beekeeperIdentifier,
  'UAT Beekeeper',
  'beekeeper',
  beekeeperPassword,
);
const viewerSession = await inviteAndAccept(
  viewer,
  viewerIdentifier,
  'UAT Viewer',
  'viewer',
  viewerPassword,
);
const members = await json(owner, '/api/v1/members', {}, 200, 'member list');
assert(members.items.length === 3, 'owner, beekeeper, and viewer were not all active');
record('family-roles', 'Invited and activated separate beekeeper and viewer sessions');

const ids = Object.fromEntries(
  [
    'apiary',
    'hiveOne',
    'hiveTwo',
    'queen',
    'equipmentBox',
    'inspection',
    'miteCount',
    'healthObservation',
    'feedingEvent',
    'treatmentEvent',
    'harvest',
    'followUp',
    'mediaAsset',
  ].map((name) => [name, randomUUID()]),
);
const capturedAt = new Date().toISOString();
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const thumbnail = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const mediaSha = createHash('sha256').update(png).digest('hex');
const ownerClientId = randomUUID();
const resourceDefinitions = [
  [
    'apiary',
    ids.apiary,
    {
      name: 'UAT Family Yard',
      location: 'Synthetic UAT location',
      accessNotes: null,
      notes: 'Isolated acceptance data',
      archivedAt: null,
    },
  ],
  [
    'hive',
    ids.hiveOne,
    {
      apiaryId: ids.apiary,
      name: 'UAT Hive One',
      status: 'active',
      installDate: '2026-04-15',
      origin: 'Synthetic package',
      notes: null,
      archivedAt: null,
    },
  ],
  [
    'hive',
    ids.hiveTwo,
    {
      apiaryId: ids.apiary,
      name: 'UAT Hive Two',
      status: 'active',
      installDate: '2026-05-01',
      origin: 'Synthetic nucleus',
      notes: null,
      archivedAt: null,
    },
  ],
  [
    'queen',
    ids.queen,
    {
      hiveId: ids.hiveOne,
      identifier: 'UAT Queen 2026',
      marked: true,
      markColor: 'white',
      year: 2026,
      source: 'Synthetic UAT',
      introductionDate: '2026-04-15',
      status: 'current',
      notes: null,
    },
  ],
  [
    'equipmentBox',
    ids.equipmentBox,
    {
      hiveId: ids.hiveOne,
      boxType: 'deep',
      position: 1,
      frameCount: 10,
      status: 'active',
      notes: null,
    },
  ],
  [
    'inspection',
    ids.inspection,
    {
      hiveId: ids.hiveOne,
      inspectedAt: capturedAt,
      inspectorName: 'UAT Owner',
      state: 'complete',
      notes: 'Synthetic healthy colony',
      temperament: 'calm',
      populationStrength: 'strong',
      queenSeen: true,
      eggsOrLarvae: true,
      broodCondition: 'Solid brood pattern',
      stores: 'Adequate',
      followUpNotes: 'Recheck in seven days',
      weather: { temperature: 78, temperatureUnit: 'f', conditions: 'Clear', wind: 'Light' },
    },
  ],
  [
    'miteCount',
    ids.miteCount,
    {
      hiveId: ids.hiveOne,
      inspectionId: ids.inspection,
      measuredAt: capturedAt,
      method: 'alcohol_wash',
      sampleSize: 300,
      miteCount: 3,
      resultPercent: 1,
      notes: null,
    },
  ],
  [
    'healthObservation',
    ids.healthObservation,
    {
      hiveId: ids.hiveOne,
      inspectionId: ids.inspection,
      observedAt: capturedAt,
      category: 'Brood pattern',
      severity: 'low',
      notes: 'Synthetic observation',
      resolvedAt: null,
    },
  ],
  [
    'feedingEvent',
    ids.feedingEvent,
    {
      hiveId: ids.hiveOne,
      inspectionId: ids.inspection,
      fedAt: capturedAt,
      feedType: '1:1 syrup',
      amount: 1,
      unit: 'quart',
      reason: 'Spring buildup',
      notes: null,
    },
  ],
  [
    'treatmentEvent',
    ids.treatmentEvent,
    {
      hiveId: ids.hiveOne,
      inspectionId: ids.inspection,
      productOrMethod: 'Synthetic UAT treatment',
      applicationDate: '2026-07-15',
      removalDate: '2026-07-22',
      dosageOrAmount: 'Test amount',
      restrictions: 'Not real treatment guidance',
      notes: null,
    },
  ],
  [
    'harvest',
    ids.harvest,
    {
      hiveId: ids.hiveOne,
      inspectionId: ids.inspection,
      harvestedAt: capturedAt,
      quantity: 12,
      unit: 'lb',
      notes: 'Synthetic UAT harvest',
    },
  ],
  [
    'followUp',
    ids.followUp,
    {
      hiveId: ids.hiveOne,
      inspectionId: ids.inspection,
      description: 'Verify synthetic follow-up completion',
      dueDate: '2026-07-22',
      completedAt: null,
    },
  ],
  [
    'mediaAsset',
    ids.mediaAsset,
    {
      hiveId: ids.hiveOne,
      inspectionId: ids.inspection,
      fileName: 'uat-hive.png',
      mediaType: 'image/png',
      byteSize: png.length,
      sha256: mediaSha,
      caption: 'Synthetic UAT image',
      width: 1,
      height: 1,
      capturedAt,
      state: 'staged',
    },
  ],
];
const createOperations = resourceDefinitions.map(([type, id, payload]) =>
  operation(ownerClientId, type, id, 'create', 0, payload),
);
const created = await push(owner, ownerSession.csrfToken, createOperations, 'create P0 records');
assert(
  created.results.every((item) => item.status === 'accepted'),
  'one or more P0 records were rejected',
);
record('p0-records', `Created ${created.results.length} records across all MVP resource types`);

await expect(
  await owner.fetch(`/api/v1/media/${ids.mediaAsset}/content`, {
    method: 'PUT',
    headers: { 'content-type': 'image/png', 'x-csrf-token': ownerSession.csrfToken },
    body: png,
  }),
  200,
  'upload original media',
);
await expect(
  await owner.fetch(`/api/v1/media/${ids.mediaAsset}/thumbnail`, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg', 'x-csrf-token': ownerSession.csrfToken },
    body: thumbnail,
  }),
  204,
  'upload thumbnail',
);
const original = Buffer.from(
  await (
    await expect(
      await viewer.fetch(`/api/v1/media/${ids.mediaAsset}/content`),
      200,
      'viewer reads original',
    )
  ).arrayBuffer(),
);
const thumb = Buffer.from(
  await (
    await expect(
      await viewer.fetch(`/api/v1/media/${ids.mediaAsset}/content?variant=thumbnail`),
      200,
      'viewer reads thumbnail',
    )
  ).arrayBuffer(),
);
assert(
  original.equals(png) && thumb.equals(thumbnail),
  'downloaded media differs from uploaded bytes',
);
await expect(
  await anonymous.fetch(`/api/v1/media/${ids.mediaAsset}/content`),
  401,
  'private media',
);
record(
  'private-media',
  'Original and thumbnail round-tripped exactly; anonymous access was denied',
);

const pulled = await json(
  beekeeper,
  '/api/v1/sync/pull?cursor=0&limit=100',
  {},
  200,
  'second-client pull',
);
assert(
  pulled.changes.length >= resourceDefinitions.length,
  'second client did not receive all changes',
);
const followUpUpdate = operation(randomUUID(), 'followUp', ids.followUp, 'update', 1, {
  hiveId: ids.hiveOne,
  inspectionId: ids.inspection,
  description: 'Verify synthetic follow-up completion',
  dueDate: '2026-07-22',
  completedAt: new Date().toISOString(),
});
const followUpResult = await push(
  beekeeper,
  beekeeperSession.csrfToken,
  [followUpUpdate],
  'beekeeper completes follow-up',
);
assert(followUpResult.results[0].status === 'accepted', 'beekeeper follow-up update failed');
record('second-client-sync', 'Beekeeper pulled the complete change set and completed a follow-up');

const ownerApiaryUpdate = operation(ownerClientId, 'apiary', ids.apiary, 'update', 1, {
  name: 'UAT Family Yard — Owner Edit',
  location: 'Synthetic UAT location',
  accessNotes: null,
  notes: 'Owner conflict branch',
  archivedAt: null,
});
const ownerUpdateResult = await push(
  owner,
  ownerSession.csrfToken,
  [ownerApiaryUpdate],
  'owner conflict branch',
);
assert(
  ownerUpdateResult.results[0].status === 'accepted' && ownerUpdateResult.results[0].version === 2,
  'owner conflict branch failed',
);
const duplicateResult = await push(
  owner,
  ownerSession.csrfToken,
  [ownerApiaryUpdate],
  'idempotent replay',
);
assert(duplicateResult.results[0].status === 'duplicate', 'idempotent replay was not recognized');
const staleUpdate = operation(randomUUID(), 'apiary', ids.apiary, 'update', 1, {
  name: 'UAT Family Yard — Stale Edit',
  location: 'Synthetic UAT location',
  accessNotes: null,
  notes: 'Stale conflict branch',
  archivedAt: null,
});
const conflictResult = await push(
  beekeeper,
  beekeeperSession.csrfToken,
  [staleUpdate],
  'stale conflict branch',
);
assert(
  conflictResult.results[0].status === 'conflict' && conflictResult.results[0].version === 2,
  'stale update did not produce an explicit conflict',
);
record(
  'conflict-and-idempotency',
  'Duplicate replay was idempotent and stale edit returned the current server value as a conflict',
);

const viewerWrite = operation(randomUUID(), 'apiary', randomUUID(), 'create', 0, {
  name: 'Forbidden Viewer Apiary',
  location: null,
  accessNotes: null,
  notes: null,
  archivedAt: null,
});
await expect(
  await viewer.fetch('/api/v1/sync/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': viewerSession.csrfToken },
    body: JSON.stringify({ syncContractVersion: 1, operations: [viewerWrite] }),
  }),
  403,
  'viewer write denial',
);
await expect(await viewer.fetch('/api/v1/export/full'), 403, 'viewer export denial');
await expect(
  await viewer.fetch('/api/v1/invitations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': viewerSession.csrfToken },
    body: JSON.stringify({
      identifier: 'forbidden@uat.invalid',
      displayName: 'Forbidden',
      role: 'viewer',
      expiresInHours: 1,
    }),
  }),
  403,
  'viewer admin denial',
);
record(
  'viewer-negative-authorization',
  'Server denied viewer write, export, and invitation-management requests',
);

const exported = Buffer.from(
  await (await expect(await owner.fetch('/api/v1/export/full'), 200, 'owner export')).arrayBuffer(),
);
const exportFiles = unzipSync(exported);
for (const name of [
  'manifest.json',
  'data.json',
  'csv/apiary.csv',
  'csv/hive.csv',
  'csv/inspection.csv',
])
  assert(exportFiles[name], `export is missing ${name}`);
const exportedMedia = exportFiles[`media/${ids.mediaAsset}/uat-hive.png`];
assert(
  exportedMedia && Buffer.from(exportedMedia).equals(png),
  'exported original media is missing or changed',
);
record(
  'portable-export',
  `Validated manifest, JSON, three CSV files, and original media in a ${exported.length}-byte ZIP`,
);

if (operatorToken) {
  await expect(await anonymous.fetch('/api/v1/operator/backup'), 404, 'hidden operator route');
  const backup = Buffer.from(
    await (
      await expect(
        await operatorFetch('/api/v1/operator/backup', {
          headers: { authorization: `Bearer ${operatorToken}` },
        }),
        200,
        'operator backup',
      )
    ).arrayBuffer(),
  );
  const backupFiles = unzipSync(backup);
  for (const name of [
    'manifest.json',
    'database/bootstrap_claims.json',
    'database/organizations.json',
    'database/users.json',
    'database/memberships.json',
    'database/resources.json',
    'database/changes.json',
    'database/idempotency.json',
    'database/invitations.json',
    'database/sign_in_attempts.json',
    'database/audit_events.json',
  ])
    assert(backupFiles[name], `backup is missing ${name}`);
  assert(
    backupFiles[`media/${ownerSession.organization.id}/${ids.mediaAsset}`],
    'backup is missing original media',
  );

  const mutationId = randomUUID();
  const mutation = operation(ownerClientId, 'apiary', mutationId, 'create', 0, {
    name: 'Must disappear after restore',
    location: null,
    accessNotes: null,
    notes: null,
    archivedAt: null,
  });
  const mutationResult = await push(
    owner,
    ownerSession.csrfToken,
    [mutation],
    'post-backup mutation',
  );
  assert(mutationResult.results[0].status === 'accepted', 'post-backup mutation failed');
  const restore = await json(
    { fetch: (path, init) => operatorFetch(path, init) },
    '/api/v1/operator/restore',
    {
      method: 'POST',
      headers: { authorization: `Bearer ${operatorToken}`, 'content-type': 'application/zip' },
      body: backup,
    },
    200,
    'operator restore',
  );
  assert(
    restore.status === 'ok' && restore.sessionsRevoked === true,
    'restore did not revoke sessions',
  );
  await expect(await owner.fetch('/api/v1/session'), 401, 'restored session revocation');
  const restoredOwner = new Client();
  const restoredSession = await json(
    restoredOwner,
    '/api/v1/auth/sign-in',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: ownerIdentifier, password: ownerPassword }),
    },
    200,
    'post-restore sign-in',
  );
  assert(restoredSession.membership.role === 'owner', 'restored owner role is invalid');
  const restoredApiaries = await json(
    restoredOwner,
    '/api/v1/resources/apiary',
    {},
    200,
    'post-restore records',
  );
  assert(
    restoredApiaries.items.some((item) => item.id === ids.apiary),
    'pre-backup apiary was not restored',
  );
  assert(
    !restoredApiaries.items.some((item) => item.id === mutationId),
    'post-backup mutation survived restore',
  );
  const restoredMedia = Buffer.from(
    await (
      await expect(
        await restoredOwner.fetch(`/api/v1/media/${ids.mediaAsset}/content`),
        200,
        'post-restore media',
      )
    ).arrayBuffer(),
  );
  assert(restoredMedia.equals(png), 'restored media differs from backup');
  record(
    'backup-and-restore',
    `Validated protected ${backup.length}-byte backup, destructive restore, session revocation, record rollback, and media recovery`,
  );
} else {
  record(
    'recovery-handoff',
    'Product state is ready for the Compose profile backup and restore lifecycle through Scout Bee',
  );
}

report.completedAt = new Date().toISOString();
report.result = 'pass';
if (evidencePath) {
  await writeFile(resolve(evidencePath), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
