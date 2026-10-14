type Env = Record<string, string | undefined>;

/**
 * The client's address, or null when it cannot be known.
 *
 * `X-Forwarded-For` is only trusted when `TRUST_PROXY` is set, i.e. when a reverse proxy in
 * front of the app appends the address it received the connection from; the last entry is
 * that address (anything before it may have been sent by the client). Without a proxy the
 * header comes from the client and proves nothing, so it is ignored.
 */
export function clientIpFrom(
  headers: { get(name: string): string | null },
  env: Env = process.env,
): string | null {
  if (!/^(1|true|yes)$/i.test(env.TRUST_PROXY?.trim() ?? "")) return null;
  const last = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .at(-1);
  return last && last.length <= 64 ? last : null;
}
