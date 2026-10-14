import { assertSafeToStart } from "./env";

// Imported once by src/instrumentation.ts when the Node.js server boots.
try {
  assertSafeToStart();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
