/**
 * Allow same-origin relative paths only — blocks protocol-relative and absolute URLs.
 * http://.../sign-in?callbackURL=%2Fsegments -> callbackURL = '/segments'
 * */
export function sanitizeCallbackURL(url: string): string {
  if (!url.startsWith("/") || url.startsWith("//") || url.includes("\\")) {
    return "/";
  }

  try {
    const { pathname, search } = new URL(url, "http://n");
    return `${pathname}${search}`;
  } catch {
    return "/";
  }
}

export function buildSignInPath(callbackURL: string): string {
  const safe = sanitizeCallbackURL(callbackURL);
  return `/sign-in?callbackURL=${encodeURIComponent(safe)}`;
}

export function withCallbackURL(path: string, callbackURL: string): string {
  const safe = sanitizeCallbackURL(callbackURL);
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}callbackURL=${encodeURIComponent(safe)}`;
}
