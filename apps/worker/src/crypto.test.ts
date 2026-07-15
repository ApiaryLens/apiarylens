import { describe, expect, it } from 'vitest';
import { hashPassword, keyedHash, sha256, verifyPassword } from './crypto.js';

const authRoot = 'test-authentication-root-secret-with-entropy';

describe('portable Worker cryptography', () => {
  it('hashes and verifies passwords without a Node-only API', async () => {
    const stored = await hashPassword('correct horse battery staple', authRoot);
    expect(stored).toMatch(/^pbkdf2-sha256-v2\$100000\$/);
    expect(await verifyPassword('correct horse battery staple', stored, authRoot)).toBe(true);
    expect(await verifyPassword('incorrect password', stored, authRoot)).toBe(false);
    expect(
      await verifyPassword(
        'correct horse battery staple',
        stored,
        'different-authentication-root-secret',
      ),
    ).toBe(false);
  });

  it('computes a stable SHA-256 digest', async () => {
    expect(await sha256('ApiaryLens')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('domain-separates keyed session identifiers', async () => {
    expect(await keyedHash('opaque-session-token', authRoot)).toMatch(/^[a-f0-9]{64}$/);
    expect(await keyedHash('opaque-session-token', authRoot)).not.toBe(
      await sha256('opaque-session-token'),
    );
  });
});
