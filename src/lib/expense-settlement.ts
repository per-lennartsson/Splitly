import { toCents, fromCents } from "@/lib/money";

// Pure, DB-free: works out which individual expense shares are paid off, given
// the household's expenses and settlements (some tagged with the expenses they cover).
//
// Settlements stay the source of truth for balances (see balance-engine.ts);
// this module only *distributes* that money across expense shares so the UI
// can show per-expense status. Rules, per debtor→creditor pair:
//   1. A settlement tagged with expenses (the user checked them when paying)
//      covers those expenses first, oldest first, up to its amount.
//   2. Everything else — unlinked payments, and the creditor's own shares owed
//      back to the debtor (mutual debts cancel out) — covers the remaining
//      shares oldest to newest.
// The total covered always matches the pair's net debt, and a final pass caps
// each debtor's open total at their overall household debt (debt
// simplification can route a payment through a third person).

export interface SettlementExpenseInput {
  id: string;
  date: Date;
  paidBy: string;
  splits: { userId: string; amountOwed: number }[];
}

export interface SettlementPaymentInput {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  /** Expenses the payer checked off for this payment; empty for a plain custom amount. */
  expenseIds?: string[];
}

export interface ExpenseShareStatus {
  expenseId: string;
  debtorId: string;
  creditorId: string;
  owed: number;
  paid: number;
  remaining: number;
}

interface Share {
  expenseId: string;
  date: number;
  debtorId: string;
  creditorId: string;
  owed: number; // cents
  paid: number; // cents
}

const pairKey = (debtorId: string, creditorId: string) => `${debtorId}\u0000${creditorId}`;

function byAge(a: Share, b: Share) {
  return a.date - b.date || a.expenseId.localeCompare(b.expenseId);
}

export function allocateSettlements(
  expenses: SettlementExpenseInput[],
  settlements: SettlementPaymentInput[]
): ExpenseShareStatus[] {
  const shares: Share[] = [];
  const sharesByPair = new Map<string, Share[]>();
  for (const expense of expenses) {
    for (const split of expense.splits) {
      const owed = toCents(split.amountOwed);
      if (split.userId === expense.paidBy || owed <= 0) continue;
      const share: Share = {
        expenseId: expense.id,
        date: expense.date.getTime(),
        debtorId: split.userId,
        creditorId: expense.paidBy,
        owed,
        paid: 0,
      };
      shares.push(share);
      const key = pairKey(share.debtorId, share.creditorId);
      if (!sharesByPair.has(key)) sharesByPair.set(key, []);
      sharesByPair.get(key)!.push(share);
    }
  }
  for (const list of sharesByPair.values()) list.sort(byAge);

  const paidByPair = new Map<string, number>();
  const net = new Map<string, number>(); // positive = owed money, negative = owes
  const addNet = (userId: string, cents: number) => net.set(userId, (net.get(userId) ?? 0) + cents);
  for (const s of settlements) {
    const cents = toCents(s.amount);
    const key = pairKey(s.fromUserId, s.toUserId);
    paidByPair.set(key, (paidByPair.get(key) ?? 0) + cents);
    addNet(s.fromUserId, cents);
    addNet(s.toUserId, -cents);
  }
  for (const share of shares) {
    addNet(share.creditorId, share.owed);
    addNet(share.debtorId, -share.owed);
  }

  const taggedByPair = new Map<string, SettlementPaymentInput[]>();
  for (const s of settlements) {
    if (!s.expenseIds || s.expenseIds.length === 0) continue;
    const key = pairKey(s.fromUserId, s.toUserId);
    if (!taggedByPair.has(key)) taggedByPair.set(key, []);
    taggedByPair.get(key)!.push(s);
  }

  const sum = (list: Share[] | undefined) => (list ?? []).reduce((acc, s) => acc + s.owed, 0);

  for (const [key, list] of sharesByPair) {
    const { debtorId, creditorId } = list[0];
    const reverseKey = pairKey(creditorId, debtorId);
    const debtorOwes =
      sum(list) - sum(sharesByPair.get(reverseKey)) - (paidByPair.get(key) ?? 0) + (paidByPair.get(reverseKey) ?? 0);
    let cover = Math.min(sum(list), Math.max(0, sum(list) - Math.max(0, debtorOwes)));

    for (const settlement of taggedByPair.get(key) ?? []) {
      const tagged = new Set(settlement.expenseIds);
      let budget = toCents(settlement.amount);
      for (const share of list) {
        if (budget <= 0 || cover <= 0) break;
        if (!tagged.has(share.expenseId)) continue;
        const amount = Math.min(share.owed - share.paid, budget, cover);
        share.paid += amount;
        budget -= amount;
        cover -= amount;
      }
    }
    for (const share of list) {
      if (cover <= 0) break;
      const amount = Math.min(share.owed - share.paid, cover);
      share.paid += amount;
      cover -= amount;
    }
  }

  // Cap each debtor's open total at what they owe the household overall.
  const byDebtor = new Map<string, Share[]>();
  for (const share of shares) {
    if (!byDebtor.has(share.debtorId)) byDebtor.set(share.debtorId, []);
    byDebtor.get(share.debtorId)!.push(share);
  }
  for (const [debtorId, list] of byDebtor) {
    const open = list.reduce((acc, s) => acc + s.owed - s.paid, 0);
    let excess = open - Math.max(0, -(net.get(debtorId) ?? 0));
    for (const share of list.sort(byAge)) {
      if (excess <= 0) break;
      const amount = Math.min(share.owed - share.paid, excess);
      share.paid += amount;
      excess -= amount;
    }
  }

  return shares.map((s) => ({
    expenseId: s.expenseId,
    debtorId: s.debtorId,
    creditorId: s.creditorId,
    owed: fromCents(s.owed),
    paid: fromCents(s.paid),
    remaining: fromCents(s.owed - s.paid),
  }));
}
