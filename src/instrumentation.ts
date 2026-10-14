/** Runs once when the server starts: refuse to boot production with placeholder secrets. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./server/startup");
  }
}
