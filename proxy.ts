import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { hasSessionCookie, redirectToSignIn } from "@/lib/proxy/auth";

export function proxy(request: NextRequest) {
  if (!hasSessionCookie(request)) {
    return redirectToSignIn(request);
  }

  const requestHeaders = new Headers(request.headers);
  // Proxy -> attach pathname to request -> Server Component reads header (Standard Next.js pattern)
  requestHeaders.set(
    "x-pathname",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/", "/segments", "/segments/:path*"],
  // Exclude public paths instead of listing every protected route
  // matcher: [
  //   "/((?!sign-in|sign-up|api|_next/static|_next/image|favicon.ico).*)",
  // ],
};

// Gaps for future routes
// /settings, /flags, /environments
