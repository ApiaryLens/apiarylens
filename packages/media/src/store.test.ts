import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FilesystemMediaStore } from './store.js';

describe('FilesystemMediaStore', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'apiarylens-media-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores private bytes under organization scope', async () => {
    const store = new FilesystemMediaStore(root);
    const organizationId = randomUUID();
    const mediaId = randomUUID();
    await store.put(organizationId, mediaId, new Uint8Array([1, 2, 3]));
    expect(await store.get(organizationId, mediaId)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await store.get(randomUUID(), mediaId)).toBeUndefined();
  });

  it('refuses path traversal identifiers', async () => {
    const store = new FilesystemMediaStore(root);
    await expect(store.put('../escape', randomUUID(), new Uint8Array())).rejects.toThrow();
  });

  it('stores and deletes an authorized thumbnail beside the original', async () => {
    const store = new FilesystemMediaStore(root);
    const organizationId = randomUUID();
    const mediaId = randomUUID();
    await store.put(organizationId, mediaId, new Uint8Array([1]), 'original');
    await store.put(organizationId, mediaId, new Uint8Array([2]), 'thumbnail');
    expect(await store.get(organizationId, mediaId, 'thumbnail')).toEqual(new Uint8Array([2]));
    await store.delete(organizationId, mediaId);
    expect(await store.get(organizationId, mediaId)).toBeUndefined();
    expect(await store.get(organizationId, mediaId, 'thumbnail')).toBeUndefined();
  });
});
