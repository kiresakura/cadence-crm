/** Runs once when the server starts: refuse to boot production with placeholder secrets. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertSafeToStart } = await import("./server/env");
  try {
    assertSafeToStart();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
