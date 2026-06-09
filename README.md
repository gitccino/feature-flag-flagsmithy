# Flagsmithy

A self-hostable **feature flag platform** built on the Next.js App Router. Flagsmithy lets you ship features behind flags, roll them out gradually by percentage, target specific user segments, and evaluate everything per-environment through a fast, cache-backed API — with a full audit trail of every change.

---

## Highlights

- **Per-environment flags** — every flag has independent state (`development`, `staging`, `production`) so a flag can be on in staging and off in production.
- **Rollout strategies** — flip a flag as a simple boolean kill-switch, or roll it out to a deterministic percentage of users.
- **Segment targeting** — build reusable user segments from trait conditions (`plan = pro`, `country in [TH, SG]`, …) and attach prioritized rules to a flag.
- **Public evaluation API** — `GET`/`POST /api/flags/:key` authenticated by environment-scoped API keys, with Redis caching and per-project rate limiting.
- **Audit logging** — every admin mutation is recorded with actor, request, environment, scope, and before/after diffs, queryable from the settings page.
- **Admin dashboard** — manage flags, segments, environments, and API keys behind email/password auth.

---

## Tech Stack


| Layer                 | Technology                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| Framework             | [Next.js 16](https://nextjs.org/) (App Router, Server Actions, React 19 + React Compiler)       |
| Language              | TypeScript                                                                                      |
| Database              | PostgreSQL via [Neon serverless](https://neon.tech/) + [Drizzle ORM](https://orm.drizzle.team/) |
| Auth                  | [Better Auth](https://www.better-auth.com/) (email + password)                                  |
| Cache / Rate limiting | [Upstash Redis](https://upstash.com/) + `@upstash/ratelimit`                                    |
| UI                    | Radix UI + shadcn, Tailwind CSS v4, Lucide icons, Sonner toasts                                 |
| Validation            | Zod                                                                                             |
