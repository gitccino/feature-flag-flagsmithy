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

## Changing the database schema

Migrations are files in `drizzle/`, committed to git and applied in order.
`drizzle-kit push` is deliberately not available — it diffs the schema against
the live database and silently drops whatever it cannot account for, which
against real user data is unrecoverable.

1. Edit `lib/db/schema.ts` — it is the single source of truth.
2. `bun run db:generate` — writes a numbered `.sql` file plus a snapshot.
3. **Read the generated SQL.** This is the review step, and the reason the
   workflow exists. A `DROP COLUMN` you did not intend is caught here or not
   at all.
4. Commit the `.sql` and `drizzle/meta/` changes alongside the schema edit.
5. `bun run db:migrate` — applies anything not yet recorded in the
   `drizzle.__drizzle_migrations` table. Already-applied migrations are
   skipped, so re-running is a no-op.

`scripts/baseline-migrations.ts` is a spent one-off: this database predates the
migration workflow, so its tables existed while the journal table was empty.
The script recorded the five existing migrations as applied. It skips any entry
already recorded, so re-running it is a no-op and a partial run can be safely
repeated. Nothing needs to run it again.
