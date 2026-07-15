import { toCents, fromCents } from "@/lib/money";

export interface BalanceExpenseInput {
  id: string;
  amount: number;
  paidBy: string;
  splits: { userId: string; amountOwed: number }[];
}

export interface BalanceSettlementInput {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface NetPosition {
  userId: string;
  paid: number;
  owed: number;
  settlementsPaid: number;
  settlementsReceived: number;
  /** paid - owed + settlementsPaid - settlementsReceived. Positive = owed money, negative = owes money. */
  netBalance: number;
}

export interface SimplifiedTransaction {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface BalanceResult {
  netPositions: NetPosition[];
  transactions: SimplifiedTransaction[];
}

/**
 * Pure balance calculation — no DB access. Given a household's (optionally
 * month-scoped) expenses, splits, and settlements, computes each member's
 * net position and the minimal set of payments that would settle everyone up.
 */
export function calculateBalances(
  expenses: BalanceExpenseInput[],
  settlements: BalanceSettlementInput[]
): BalanceResult {
  const cents = new Map<
    string,
    { paid: number; owed: number; settlementsPaid: number; settlementsReceived: number }
  >();

  function ensure(userId: string) {
    if (!cents.has(userId)) {
      cents.set(userId, { paid: 0, owed: 0, settlementsPaid: 0, settlementsReceived: 0 });
    }
    return cents.get(userId)!;
  }

  for (const expense of expenses) {
    ensure(expense.paidBy).paid += toCents(expense.amount);
    for (const split of expense.splits) {
      ensure(split.userId).owed += toCents(split.amountOwed);
    }
  }

  for (const settlement of settlements) {
    ensure(settlement.fromUserId).settlementsPaid += toCents(settlement.amount);
    ensure(settlement.toUserId).settlementsReceived += toCents(settlement.amount);
  }

  const netPositions: NetPosition[] = Array.from(cents.entries()).map(([userId, v]) => ({
    userId,
    paid: fromCents(v.paid),
    owed: fromCents(v.owed),
    settlementsPaid: fromCents(v.settlementsPaid),
    settlementsReceived: fromCents(v.settlementsReceived),
    netBalance: fromCents(v.paid - v.owed + v.settlementsPaid - v.settlementsReceived),
  }));

  const transactions = simplifyDebts(netPositions);

  return { netPositions, transactions };
}

/**
 * Greedy debt-simplification: repeatedly matches the largest creditor with
 * the largest debtor until all balances are zero. Produces the fewest
 * possible payments for arbitrary net positions.
 */
export function simplifyDebts(netPositions: NetPosition[]): SimplifiedTransaction[] {
  type Balance = { userId: string; cents: number };

  const balances: Balance[] = netPositions
    .map((p) => ({ userId: p.userId, cents: toCents(p.netBalance) }))
    .filter((b) => b.cents !== 0);

  const transactions: SimplifiedTransaction[] = [];

  while (true) {
    let creditorIdx = -1;
    let debtorIdx = -1;
    for (let i = 0; i < balances.length; i++) {
      if (creditorIdx === -1 || balances[i].cents > balances[creditorIdx].cents) {
        if (balances[i].cents > 0) creditorIdx = i;
      }
      if (debtorIdx === -1 || balances[i].cents < balances[debtorIdx].cents) {
        if (balances[i].cents < 0) debtorIdx = i;
      }
    }

    if (creditorIdx === -1 || debtorIdx === -1) break;

    const creditor = balances[creditorIdx];
    const debtor = balances[debtorIdx];
    const amountCents = Math.min(creditor.cents, -debtor.cents);
    if (amountCents <= 0) break;

    transactions.push({
      fromUserId: debtor.userId,
      toUserId: creditor.userId,
      amount: fromCents(amountCents),
    });

    creditor.cents -= amountCents;
    debtor.cents += amountCents;

    // Remove settled parties; re-filter to keep indices simple next loop.
    for (let i = balances.length - 1; i >= 0; i--) {
      if (balances[i].cents === 0) balances.splice(i, 1);
    }
  }

  return transactions;
}
