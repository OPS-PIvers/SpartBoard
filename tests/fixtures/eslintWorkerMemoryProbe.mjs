// Mirrors node_modules/eslint/lib/eslint/eslint.js's runWorkers(), which
// spawns each lint worker as `new Worker(workerURL, { env: SHARE_ENV, workerData })`
// with no `resourceLimits`. Run under a raised --max-old-space-size (as a
// child process, from tests/ci.eslintConcurrencyMemory.test.ts) and prints
// the worker's own resourceLimits so the test can confirm the flag never
// reaches it.
import {
  Worker,
  isMainThread,
  resourceLimits,
  parentPort,
  SHARE_ENV,
} from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

if (isMainThread) {
  const worker = new Worker(fileURLToPath(import.meta.url), { env: SHARE_ENV });
  worker.once('message', (limits) => {
    process.stdout.write(JSON.stringify(limits));
    process.exit(0);
  });
} else {
  parentPort.postMessage(resourceLimits);
}
