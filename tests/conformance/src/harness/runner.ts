import { describe, it } from 'vitest';
import type { BackendFactory } from './backend.js';
import { createCloudflareBackend } from './cloudflare-backend.js';
import { createNodeBackend } from './node-backend.js';
import type { ConformanceFixture } from '../fixtures/types.js';
import { World } from './world.js';

export const backendFactories: readonly BackendFactory[] = [
  { label: 'node', create: createNodeBackend },
  { label: 'cloudflare', create: createCloudflareBackend },
];

/**
 * Bind one fixture list to every backend profile. The reported test name leads
 * with the contract identifier, so a failure names the broken cross-client
 * contract — `[sync/push.idempotent-replay] … × cloudflare` — before it names
 * any file.
 */
export function runConformanceSuite(surface: string, fixtures: readonly ConformanceFixture[]) {
  for (const factory of backendFactories) {
    describe(`${surface} contract × ${factory.label} backend`, () => {
      for (const fixture of fixtures) {
        it(`[${fixture.contract}] ${fixture.title}`, async () => {
          const world = new World(factory.create());
          try {
            await fixture.run(world);
          } finally {
            world.close();
          }
        });
      }
    });
  }
}
