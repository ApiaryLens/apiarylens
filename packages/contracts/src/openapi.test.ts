import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from './openapi.js';

describe('OpenAPI contract', () => {
  it('publishes the versioned portable API surface and generated domain schemas', () => {
    const document = buildOpenApiDocument();
    expect(document.openapi).toBe('3.1.0');
    expect(document.paths['/sync/push'].post.summary).toMatch(/idempotent/i);
    expect(document.paths['/export/full'].get.responses['200']).toBeDefined();
    expect('inspection' in document.components.schemas).toBe(true);
    expect(document.components.securitySchemes.browserSession.in).toBe('cookie');
  });
});
