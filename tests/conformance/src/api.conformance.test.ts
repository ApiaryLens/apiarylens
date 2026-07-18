import { apiFixtures } from './fixtures/api.js';
import { runConformanceSuite } from './harness/runner.js';

runConformanceSuite('api', apiFixtures);
