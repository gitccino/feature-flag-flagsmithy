@AGENTS.md

# Flagsmithy — Agent Guide

Self-hostable **feature flag platform** on the Next.js App Router. Per-environment flags, percentage rollouts, segment targeting, a cache-backed public evaluation API, and a full audit trail. See `README.md` for the product overview.

> **Read this before writing code.** This is Next.js 16 — APIs and file conventions differ from older versions. When unsure about a Next.js API, read the local docs in `node_modules/next/dist/docs/` (they match the installed version) rather than relying on memory.

---

## Tech Stack

| Layer | Technology | Docs |
| --- | --- | --- |
| Framework | Next.js 16 (App Router, Server Actions, React 19.2 + React Compiler) | https://nextjs.org/docs |
| Language | TypeScript (strict) | https://www.typescriptlang.org/docs/ |
| Database | PostgreSQL via Neon serverless + Drizzle ORM | https://orm.drizzle.team/docs · https://neon.tech/docs |
| Auth | Better Auth (email + password) | https://www.better-auth.com/docs |
| Cache / Rate limiting | Upstash Redis + `@upstash/ratelimit` | https://upstash.com/docs/redis · https://upstash.com/docs/redis/sdks/ratelimit-ts |
| UI | Radix UI + shadcn/ui, Tailwind CSS v4, Lucide icons | https://ui.shadcn.com · https://www.radix-ui.com · https://tailwindcss.com/docs |
| Validation | Zod | https://zod.dev |

Package manager: **Bun** (`bun.lock`). Use `bun install`, `bun add <pkg>`, `bun run <script>`.

Scripts: `bun run dev`, `bun run build`, `bun run start`, `bun run lint`.

---

## Core Principles

1. **Server-first architecture.** Default to Server Components. Only add `"use client"` when a component truly needs interactivity, browser APIs, or hooks (`useState`, `useEffect`, event handlers). Push client boundaries as far down the tree as possible.
2. **Mutations go through Server Actions.** Use `"use server"` functions for all writes. Do not build internal REST endpoints for first-party UI mutations — Route Handlers are reserved for the public API (e.g. flag evaluation) and webhooks.
3. **Type safety everywhere.** No `any`. Derive types from the source of truth: infer DB types from Drizzle schemas, infer input/output types from Zod schemas (`z.infer<...>`). Prefer `unknown` + a Zod parse over loose casts.
4. **Validate at every boundary.** Every Server Action argument, Route Handler body/params, and external payload must be parsed with Zod before use. Never trust client input.
5. **Security is not optional in Proxy.** Proxy/middleware is for optimistic checks only. Always re-verify auth and authorization *inside* each Server Action and protected Route Handler — never rely on Proxy matchers alone (a refactor can silently drop coverage).
6. **Fail safe and explicit.** Server Actions return typed result objects (e.g. `{ ok: true, data } | { ok: false, error }`) rather than throwing across the client boundary. Surface user-facing errors via Sonner toasts.
7. **Audit every admin mutation.** Persisting a change to flags, segments, environments, or API keys must also write an audit log entry (actor, request, environment, scope, before/after diff).
8. **Cache deliberately, invalidate precisely.** Tag cached reads with `cacheTag`; invalidate with `updateTag` (read-your-writes in Server Actions) or `revalidateTag(tag, profile)`. Keep Redis as the hot path for public flag evaluation.

---

## Next.js 16 — Critical Rules

### `proxy.ts`, NOT `middleware.ts`

This is the recurring confusion — get it right:

- In Next.js 16 the `middleware` file convention is **deprecated and renamed to `proxy`**. Create `proxy.ts` at the project root (same level as `app/`).
- Export a function named **`proxy`** (or a default export), not `middleware`:

```ts
// proxy.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  // optimistic checks only — re-verify in Server Actions / Route Handlers
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

- **Runtime is `nodejs` and cannot be changed.** The `edge` runtime is NOT supported in `proxy`, and setting the `runtime` config throws. (If you genuinely need edge, that still requires `middleware` — but default to `proxy`.)
- Only **one** `proxy.ts` per project. Split logic into helper modules and import them.
- Config flags were renamed: `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`.
- Without a `matcher`, Proxy runs on every request (including static assets) — always scope the matcher.
- Do not use Proxy for slow data fetching or as the session/authorization solution.

### Async Request APIs (breaking)

`cookies()`, `headers()`, `draftMode()`, and route `params` / `searchParams` are **async-only** — always `await` them.

```ts
const cookieStore = await cookies();

// app/flags/[key]/page.tsx
export default async function Page(props: PageProps<"/flags/[key]">) {
  const { key } = await props.params;
}
```

Run `bunx next typegen` to generate `PageProps` / `LayoutProps` / `RouteContext` helpers.

### Caching APIs

- `revalidateTag` now requires a profile argument: `revalidateTag("flags", "max")`.
- Use `updateTag(tag)` in Server Actions for immediate read-your-writes; use `refresh()` to refresh the client router after an action.
- `cacheLife` / `cacheTag` are stable — import without the `unstable_` prefix.

### Other v16 notes

- Turbopack is the default for `dev` and `build` (no flags needed).
- **No `next lint`** — it's removed. Lint via `bun run lint` (ESLint flat config) or Biome directly; `next build` does not lint.
- `next/image`: use `images.remotePatterns` (not the deprecated `images.domains`).
- `serverRuntimeConfig` / `publicRuntimeConfig` are removed — use env vars (`process.env`, `NEXT_PUBLIC_*`).
- React Compiler is available (`reactCompiler: true` in `next.config.ts`) — don't hand-add `useMemo`/`useCallback` for micro-optimizations it would handle.

---

## Conventions

- **Imports:** path alias is `@/*` → project root (e.g. `@/lib/db`, `@/app/...`). There is no `src/` directory; `app/` lives at the root.
- **Validation:** colocate Zod schemas with their feature; derive types via `z.infer`. Parse at boundaries with `.safeParse` and handle the failure branch.
- **Database:** define Drizzle schemas as the single source of truth; use the typed query builder. Keep migrations under Drizzle's migration workflow. Use the Neon serverless driver.
- **Auth:** gate Server Actions and protected Route Handlers by resolving the Better Auth session server-side. Email + password is the only method.
- **Rate limiting:** apply `@upstash/ratelimit` to the public evaluation API, keyed per project/environment API key.
- **UI:** compose from shadcn/ui (Radix primitives), style with Tailwind v4 utilities, icons from `lucide-react`, toasts via Sonner. Keep interactive widgets as small client components.
- **Server Actions:** keep them in dedicated `actions.ts` files (or a feature `actions/` folder), each starting with `"use server"`. Validate input, check auth, mutate, write audit log, then invalidate the relevant cache tag.

---

## Definition of Done

Before considering a change complete:

- Types check (no `any`, no unchecked casts) and `bun run lint` passes.
- All new inputs are Zod-validated; auth/authorization is enforced server-side (not only in Proxy).
- Admin mutations write an audit log entry and invalidate the correct cache tag.
- New file conventions follow Next.js 16 (`proxy.ts`, async request APIs, profiled `revalidateTag`).
