import { randomBytes } from "node:crypto";

/**
 * Turn a display name into a url-safe slug.
 * "My Cool App!" -> "my-cool-app". Strips accents, lowercases, collapses any
 * run of non-alphanumerics to a single hyphen, trims edge hyphens.
 * Falls back to "project" when the name has no slug-able characters (e.g. "!!!").
 */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD") // split accented chars into base + diacritic
    .replace(/[\u0300-\u036f]/g, "") // drop the diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumeric -> hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens

  return slug || "project";
}

/** Short, url-safe random token used to break slug collisions. */
export function slugSuffix(length = 6): string {
  return randomBytes(length)
    .toString("base64url")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
    .slice(0, length);
}

/** Append a collision-breaking suffix: "my-app" -> "my-app-k3f9x2". */
export function slugWithSuffix(base: string): string {
  return `${base}-${slugSuffix()}`;
}
