import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { sanitizeCallbackURL } from "@/lib/auth/callback-url";

/** Optimistic session check — re-verify with auth.api.getSession in layouts/actions. */
export function hasSessionCookie(request: NextRequest): boolean {
  return Boolean(getSessionCookie(request));
}

export function redirectToSignIn(request: NextRequest): NextResponse {
  const signInUrl = new URL("/sign-in", request.url);
  const callbackURL = sanitizeCallbackURL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  signInUrl.searchParams.set("callbackURL", callbackURL);
  return NextResponse.redirect(signInUrl);
}
