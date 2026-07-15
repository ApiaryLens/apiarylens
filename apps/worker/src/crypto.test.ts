import { describe, expect, it } from 'vitest';
import { hashPassword, sha256, verifyPassword } from './crypto.js';

describe('portable Worker cryptography', () => {
  it('hashes and verifies passwords without a Node-only API', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
    expect(await verifyPassword('incorrect password', stored)).toBe(false);
  });

  it('computes a stable SHA-256 digest', async () => {
    expect(await sha256('ApiaryLens')).toMatch(/^[a-f0-9]{64}$/);
  });
});
