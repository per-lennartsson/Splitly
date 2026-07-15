# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Splitly — a shared expense tracker (Next.js App Router + Prisma/Postgres) supporting two household types:
- **RECURRING** households (roommates/family): month-by-month view, recurring bills, category budgets.
- **EVENT** groups (trips): a flat running expense list with a single final settle-up, no monthly structure.

## Critical constraint: everything runs in Docker

**Never install Node, run `npm`, or run the app on the host.** No local Node install is assumed. Every command — install, migrate, build, test, dev — must go through `docker compose`. This is a hard requirement from the project setup, not a style preference.

```bash
# Day-to-day dev (hot reload, mounts source as a volume)
docker compose -f docker-compose.dev.yml up -d db      # start Postgres only
docker compose -f docker-compose.dev.yml run --rm app npm install
docker compose -f docker-compose.dev.yml up             # start app + db with hot reload

# Prisma
docker compose -f docker-compose.dev.yml run --rm app npx prisma migrate dev --name <name>
docker compose -f docker-compose.dev.yml run --rm app npx prisma generate
docker compose -f docker-compose.dev.yml run --rm app npx prisma studio

# Typecheck / lint / test
docker compose -f docker-compose.dev.yml run --rm app npx tsc --noEmit
docker compose -f docker-compose.dev.yml run --rm app npm run lint
docker compose -f docker-compose.dev.yml run --rm app npx vitest run                  # all tests
docker compose -f docker-compose.dev.yml run --rm app npx vitest run src/lib/balance-engine.test.ts  # single file

# Production-style build/run (uses the real multi-stage Dockerfile)
docker compose -f docker-compose.yml up -d --build
```

**Only two services exist in dev/prod compose**: `app` and `db`. `db` is Postgres 16; `app`'s entrypoint (`docker/entrypoint.sh`) runs `prisma migrate deploy` automatically before starting the server — migrations never need a separate manual step in normal operation.

### The NODE_ENV build gotcha

`docker-compose.dev.yml` sets `NODE_ENV=development` for the `app` service (needed for `next dev`). If you ever need to run a **production** `next build` through the dev container/image (e.g. to debug a build-only issue), you must override it — `docker compose -f docker-compose.dev.yml run --rm -e NODE_ENV=production app npm run build` — otherwise the build enters a broken hybrid dev/prod state and fails with a cryptic `<Html> should not be imported outside of pages/_document` error on `/404`/`/500` prerendering. This is not a real bug in the app; it's purely an artifact of the env mismatch. The actual multi-stage `Dockerfile` never sets `NODE_ENV` in the builder stage, so `docker compose -f docker-compose.yml build` is unaffected.

## Architecture

### Balance engine is pure and DB-free — keep it that way

`src/lib/balance-engine.ts` (`calculateBalances`, `simplifyDebts`) takes plain arrays of expenses/splits/settlements and returns net positions + a minimal debt-simplification transaction list (greedy max-debtor-to-max-creditor). It has zero DB imports and is unit-tested directly (`balance-engine.test.ts`). Any DB-touching caller (`src/lib/household-balances.ts`) fetches rows and maps them into the engine's plain input types — don't let Prisma types leak into the engine, and don't add DB calls inside it.

Money is handled as integer cents internally (`src/lib/money.ts`: `toCents`/`fromCents`) to avoid float drift, surfaced as plain numbers rounded to 2 decimals. `src/lib/split-calculator.ts` builds on this for percent/fixed split resolution (`distributePercentSplit` hands out rounding remainder deterministically, largest share first).

### Real vs. projected expenses — never conflate them

Recurring templates (`RecurringExpense` + `RecurringSplitOverride`) generate real `Expense` rows lazily, on read — there is no background job or cron. `src/lib/recurring-generator.ts` exports `ensureRecurringGenerated(householdId)` (catches up every active template in a household, called from the dashboard, expenses page, and `household-balances.ts` before any balance/expense read) and `ensureTemplateGenerated(recurringId)` (scoped to one template, called right after create/update/reactivate so a new template doesn't wait for someone to hit a read path). Both walk month-by-month from a template's `startDate` up to today (bounded by `endDate`) and are idempotent — before creating a row for a given template+month, they check whether one already exists for that `(recurringId, month)`. If a household goes unvisited for months, the catch-up simply runs in one batch next time it's opened instead of trickling in daily; each month's check is still a cheap no-op once generated.

### Recurring review — no push, just a lazy check on next visit

`RecurringExpense.lastConfirmedAt` + `reviewIntervalMonths` (default 6) track whether a template's amount is still accurate, independent of the user-facing `endDate`. `src/lib/recurring-review.ts` (`isReviewOverdue`) is checked when the recurring list page renders; overdue templates get a "still accurate?" badge with a Confirm action (`POST .../recurring/[recurringId]/confirm`, bumps `lastConfirmedAt`). A full-form edit (title/amount/split change) also bumps `lastConfirmedAt`, since editing the template is itself a confirmation. There is no scheduled reminder — the prompt only appears the next time someone opens the recurring list.

Future/unarrived months are previewed via `src/lib/projected-expenses.ts` (`getProjectedExpenses`), which **synthesizes non-persisted expense-shaped objects on the fly** — same split-resolution logic, but tagged `projected: true`, never written to the DB, and automatically excluded from any month where a real `Expense` already exists for that template (so a "current month partway through" view naturally mixes real + projected without double-counting). Projected items must never be fed into `calculateBalances` or settlement flows — the UI (`expense-list.tsx`) renders them with a distinct "Scheduled" badge and no edit/delete actions.

Editing or pausing a `RecurringExpense` template only affects future generation/projection; already-generated `Expense` rows are historical and untouched (this is enforced by generation being copy-on-write, not by any explicit guard).

### Soft delete only

`Expense.deletedAt` — never hard-delete. All balance/list queries filter `deletedAt: null` explicitly; there's no global Prisma middleware doing this, so any new query against `Expense` must add the filter itself.

### Auth/session carries `locale`; household carries `currency`

- `User.locale` (`en`/`sv`) is threaded through NextAuth's JWT/session (`src/lib/auth.ts`, `src/types/next-auth.d.ts`). Server components get it via `getServerSession`; client-only routes (login/signup, pre-auth) use `usePreAuthLocale()` (localStorage + browser-language detection); other client components use `useSessionLocale()`. Changing locale in `/account` calls `next-auth`'s `update()` to refresh the JWT without a full re-login.
- `Household.currency` (`USD`/`SEK`) is set at household creation and is **not** part of the user session — it's fetched per-household and passed down as a prop wherever money is rendered.
- i18n is a hand-rolled dictionary (`src/lib/i18n/translations.ts`, keyed `en`/`sv`) with a dot-path `t(locale, "namespace.key", params)` lookup (`src/lib/i18n/t.ts`) — no external i18n library. Both `en` and `sv` dictionaries must stay structurally identical (`sv` is typed as `typeof en`). Money formatting (`src/lib/currency.ts: formatMoney`/`currencySymbol`) uses `Intl.NumberFormat` with the currency's code but the *user's* locale for number conventions (so a Swedish user viewing a USD household still sees Swedish digit-grouping).
- Note: only static UI chrome is translated. Dynamic server-side validation/error message *strings* (e.g. "Split percentages must sum to 100%") are currently English-only regardless of locale.

### Household access control

`src/lib/household-access.ts` (`requireMembership`, `requireAdmin`) is the single gate every `/api/households/[id]/...` route calls before touching data — membership is `HouseholdMember` with `leftAt: null`; roles are `ADMIN`/`MEMBER`. There's no middleware-level authorization for these routes beyond session presence (`src/middleware.ts` only gates route access, not per-resource permission) — each route handler must call `requireMembership`/`requireAdmin` itself.

### Business-rule validation lives in `*-service.ts` files, not routes or the DB

- `src/lib/expense-service.ts` (`resolveExpenseSplits`) — percent splits must sum to 100%, fixed splits must sum to the expense amount.
- `src/lib/recurring-service.ts` (`validateRecurringSplit`) — for recurring templates, *effective* splits (per-member override, else household default) must satisfy the same constraints.
- `src/lib/household-access.ts` generates invite codes; the household-members PATCH route enforces that `default_split_percent` across all active RECURRING-household members sums to 100%.

These throw typed errors (`ExpenseValidationError`, `RecurringValidationError`) that route handlers catch and turn into 400s — follow that pattern for new validation rather than inlining checks in routes.

### Next.js 15 App Router specifics

All dynamic route `params` (and `searchParams`) are `Promise`s in this Next version. The convention used throughout is to destructure the prop as `params: paramsPromise` and `await` it as the first line of the function body into a locally-scoped `params` — this means the rest of the function body reads exactly like the old sync-params code. Follow this pattern for new routes/pages rather than inlining `await params` at every usage site.

Every page effectively needs a live session lookup (no static content), so don't add `generateStaticParams` or otherwise try to statically render household/auth routes.
