import { syncFixtures } from './fixtures/sync.js';
import { runConformanceSuite } from './harness/runner.js';

runConformanceSuite('sync', syncFixtures);
