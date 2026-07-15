import { pbkdf2Sync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

const authRoot = 'test-authentication-root-secret-with-entropy';

describe('portable Node password hashing', () => {
  it('uses the peppered v2 format and rejects a different root secret', async () => {
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

  it('keeps an unpeppered release-candidate hash readable during upgrade', async () => {
    const password = 'legacy release candidate password';
    const salt = Buffer.alloc(16, 7);
    const derived = pbkdf2Sync(password, salt, 100_000, 32, 'sha256');
    const stored = `pbkdf2-sha256$100000$${salt.toString('base64url')}$${derived.toString('base64url')}`;
    expect(await verifyPassword(password, stored, authRoot)).toBe(true);
  });
});
