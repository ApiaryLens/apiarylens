import type { World } from '../harness/world.js';

/**
 * One executable contract clause. `contract` is the stable identifier of the
 * cross-client behavior being enforced (surface/rule), and is the first thing
 * a failing CI run prints. Fixtures contain fixture data and expected
 * behavior only — never backend- or client-specific logic.
 */
export interface ConformanceFixture {
  contract: string;
  title: string;
  run(world: World): Promise<void>;
}
