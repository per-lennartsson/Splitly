# Splitly — Example Use Cases

Concrete scenarios you can click through in the browser to verify core flows, especially "add a new person to the household" and "retroactively include them in an existing expense." Each scenario states exact expected numbers so you can eyeball whether the app matches. The same scenarios are covered by automated integration tests — see the appendix.

## Prerequisites

```bash
docker compose -f docker-compose.dev.yml up -d db
docker compose -f docker-compose.dev.yml run --rm app npx prisma migrate deploy
docker compose -f docker-compose.dev.yml up
docker compose -f docker-compose.dev.yml run --rm app npm run seed
```

The seed script prints invite codes and logs. All demo users share the password `demo12345`:
- `alice@splitly.demo`, `bob@splitly.demo`, `charlie@splitly.demo`

Re-running `npm run seed` is safe — it clears out prior `@splitly.demo` data first and recreates it.

---

## Scenario 1: Add a new member to a household, then to an existing expense's split

**Household:** Demo Household (Recurring). **Starting state:** Alice (ADMIN, 60% default split) and Bob (MEMBER, 40%) are members. A "Groceries" expense ($120, FIXED, split $60/$60 Alice/Bob) already exists. Charlie is **not yet a member**.

1. Log in as Charlie. Go to "Join household," enter the Demo Household (Recurring) invite code shown by the seed script.
2. Log in as Alice. Open the household's Expenses list, find "Groceries", click Edit.
3. In the split editor, add Charlie as a participant and adjust amounts so the expense is split evenly: Alice $40, Bob $40, Charlie $40 (FIXED). Save.
4. Go to Balances.

**Expected result:** Bob owes Alice $40.00, and Charlie owes Alice $40.00 (two lines, Alice net +$80.00). The Groceries expense now shows exactly 3 participants — editing replaced the whole split, it didn't just append Charlie.

---

## Scenario 2: EVENT trip — guest participant + settle-up

**Household:** Demo Trip (Event). **Starting state:** Alice, Bob, Charlie are members; Dana was added as a **guest** (no login). "Cabin rental" ($400, split $100 each across all 4) exists. "Lift tickets" ($150, split $50 Alice/Bob/Charlie) exists **without Dana**. Charlie already paid Alice $50 (a partial settlement).

1. Log in as Alice, open "Lift tickets," edit the split to include Dana: $37.50 each across all 4 (or keep it simple and re-split the three $50 shares into four $37.50 shares).
2. Go to Balances and note who owes whom.
3. As the person shown to owe the most, record a settlement for that exact amount via "Settle up."
4. Refresh Balances.

**Expected result:** After step 3, the settled pair's balance reaches $0, and the remaining simplified debt list only lists whoever is still unsettled — never more transactions than the number of people with a nonzero balance minus one.

---

## Scenario 3: Guest participants are EVENT-only and admin-only (negative case)

**Household:** Demo Household (Recurring) — a RECURRING household.

1. Log in as Alice (admin of this household). Open the household's member/invite page.
2. Try to add a guest participant (if the RECURRING household's UI exposes the option at all — it should not).

**Expected result:** The guest-add action is unavailable in the UI for a RECURRING household. If exercised directly via `POST /api/households/{id}/members/guests`, the API returns **400** with `"Guests can only be added to event groups."` and creates no new user or member row. Separately, a non-admin member attempting a guest-add on a valid EVENT household gets **403**.

---

## Scenario 4: Recurring template — new member via per-member override, future-only

**Household:** Demo Household (Recurring). **Starting state:** A "Rent" recurring template ($1000/month, PERCENT, 60% Alice / 40% Bob, no overrides) has already backfilled real Expense rows for the last few months.

1. Log in as Charlie, join the Demo Household (Recurring) via invite code.
2. Log in as Alice, open the Rent recurring template, edit it, and add a per-member override so the effective split becomes Alice 50% / Bob 30% / Charlie 20%. Save.
3. Open the Expenses list and check the **already-generated** past months' Rent expenses.
4. Wait for (or simulate) the next month's Rent to generate.

**Expected result:** Every already-generated past Rent expense is untouched — still 2-way split, $600 Alice / $400 Bob, no Charlie. Only the *next* month's Rent (generated after the template edit) uses the new 3-way split: $500 Alice / $300 Bob / $200 Charlie. This proves editing a recurring template only changes future generation, never historical `Expense` rows.

---

## Appendix: doc ↔ seed ↔ test mapping

| Scenario | Seed starting state | Integration test |
|---|---|---|
| 1. Add member, retroactively edit expense | Demo Household (Recurring): Groceries expense, Charlie not yet joined | `src/test/integration/add-member-to-expense.test.ts` |
| 2. EVENT guest + settle-up | Demo Trip (Event): Dana as guest, Lift tickets missing Dana | `src/test/integration/event-guest-settle-up.test.ts` |
| 3. Guest-add rejected on RECURRING / non-admin forbidden | Demo Household (Recurring) | `src/test/integration/guest-add-recurring-rejected.test.ts` |
| 4. Recurring override, future-only | Demo Household (Recurring): Rent template, backfilled months | `src/test/integration/recurring-override-future-only.test.ts` |

Run the automated versions with:

```bash
docker compose -f docker-compose.dev.yml run --rm app npx vitest run src/test/integration
```
