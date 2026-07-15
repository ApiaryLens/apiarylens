import { describe, expect, it, vi } from 'vitest';
import app from './index.js';

const emptyEnvironment = (operatorToken?: string) =>
  ({
    DB: {},
    MEDIA: {},
    ...(operatorToken ? { SCOUT_OPERATOR_TOKEN: operatorToken } : {}),
  }) as never;

describe('Cloudflare operator boundary', () => {
  for (const [method, path] of [
    ['GET', '/api/v1/operator/backup'],
    ['POST', '/api/v1/operator/restore'],
  ] as const) {
    it(`conceals ${method} ${path} when the operator token is not configured`, async () => {
      const response = await app.request(path, { method }, emptyEnvironment());
      expect(response.status).toBe(404);
      expect(((await response.json()) as { code: string }).code).toBe('not_found');
    });

    it(`conceals ${method} ${path} when the bearer token is incorrect`, async () => {
      const response = await app.request(
        path,
        { method, headers: { authorization: 'Bearer incorrect-token' } },
        emptyEnvironment('correct-token'),
      );
      expect(response.status).toBe(404);
      expect(((await response.json()) as { code: string }).code).toBe('not_found');
    });
  }

  it('rejects an invalid restore before changing persistent state', async () => {
    const response = await app.request(
      '/api/v1/operator/restore',
      {
        method: 'POST',
        headers: { authorization: 'Bearer correct-token' },
        body: new Uint8Array([1, 2, 3]),
      },
      emptyEnvironment('correct-token'),
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe('backup_invalid');
  });
});

describe('Cloudflare error boundary', () => {
  it('returns a generic request-correlated error without exposing internals', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await app.request('/api/v1/bootstrap/status', {}, emptyEnvironment());
    const body = (await response.json()) as { code: string; message: string; requestId: string };

    expect(response.status).toBe(500);
    expect(body.code).toBe('internal_error');
    expect(body.message).toBe('The request could not be completed');
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(body)).not.toContain('first');
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });
});
