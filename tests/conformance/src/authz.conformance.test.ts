import { authzFixtures } from './fixtures/authz.js';
import { runConformanceSuite } from './harness/runner.js';

runConformanceSuite('authz', authzFixtures);
