import { NextResponse, type NextRequest } from "next/server";

import { isProduction } from "@/server/env";
import { createNonce, securityHeaders } from "@/server/security-headers";

/**
 * Gives every request a fresh CSP nonce. The policy is set on the request too, which is how
 * Next.js learns the nonce for its own scripts; pages are rendered per request for this reason.
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const headers = securityHeaders({
    nonce,
    production: isProduction(),
    dev: process.env.NODE_ENV === "development",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", headers["Content-Security-Policy"]!);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

export const config = {
  matcher: [
    {
      // Everything except build assets; prefetches render no HTML and need no nonce.
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
