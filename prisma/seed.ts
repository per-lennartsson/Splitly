import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { ensureTemplateGenerated } from "../src/lib/recurring-generator";

const DEMO_DOMAIN = "splitly.demo";
const DEMO_PASSWORD = "demo12345";

function monthsAgo(n: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

async function clearPriorDemoData() {
  const priorDemoUsers = await prisma.user.findMany({ where: { email: { endsWith: `@${DEMO_DOMAIN}` } } });
  if (priorDemoUsers.length === 0) return;

  const priorUserIds = priorDemoUsers.map((u) => u.id);
  const priorHouseholds = await prisma.household.findMany({ where: { createdBy: { in: priorUserIds } } });
  if (priorHouseholds.length > 0) {
    // Cascades HouseholdMember/Category/Expense(+ExpenseSplit)/RecurringExpense(+overrides)/Settlement.
    await prisma.household.deleteMany({ where: { id: { in: priorHouseholds.map((h) => h.id) } } });
  }
  await prisma.user.deleteMany({ where: { id: { in: priorUserIds } } });
}

async function createDemoUser(name: string) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  return prisma.user.create({
    data: { email: `${name.toLowerCase()}@${DEMO_DOMAIN}`, passwordHash, name },
  });
}

async function createDemoGuest(name: string, label: string) {
  // Mirrors the shape created by POST /api/households/[id]/members/guests:
  // a placeholder User that can never log in, tied to a household like any other member.
  const passwordHash = await bcrypt.hash(randomUUID(), 10);
  return prisma.user.create({
    data: {
      email: `${label}-${randomUUID()}@${DEMO_DOMAIN}.invalid`,
      passwordHash,
      name,
      isPlaceholder: true,
    },
  });
}

async function main() {
  await clearPriorDemoData();

  const alice = await createDemoUser("Alice");
  const bob = await createDemoUser("Bob");
  const charlie = await createDemoUser("Charlie");

  // --- RECURRING household ---
  // Charlie is deliberately NOT a member yet, and Rent has no Charlie split yet
  // — this is the starting state for the "join, then retroactively add to an
  // existing expense" scenario in docs/example-use-cases.md.
  const recurringHousehold = await prisma.household.create({
    data: {
      name: "Demo Household (Recurring)",
      householdType: "RECURRING",
      currency: "USD",
      inviteCode: `DEMO${randomUUID().slice(0, 4).toUpperCase()}`,
      createdBy: alice.id,
      members: {
        create: [
          { userId: alice.id, role: "ADMIN", defaultSplitPercent: 60 },
          { userId: bob.id, role: "MEMBER", defaultSplitPercent: 40 },
        ],
      },
    },
  });

  const groceries = await prisma.expense.create({
    data: {
      householdId: recurringHousehold.id,
      title: "Groceries",
      amount: 120,
      paidBy: alice.id,
      date: new Date(),
      splitType: "FIXED",
      splits: {
        create: [
          { userId: alice.id, amountOwed: 60 },
          { userId: bob.id, amountOwed: 60 },
        ],
      },
    },
  });

  const rent = await prisma.recurringExpense.create({
    data: {
      householdId: recurringHousehold.id,
      title: "Rent",
      amount: 1000,
      dayOfMonth: 1,
      paidBy: alice.id,
      splitType: "PERCENT",
      startDate: new Date(monthsAgo(2)),
      overrides: { create: [] },
    },
  });
  await ensureTemplateGenerated(rent.id);

  // --- EVENT household ---
  // Dana (guest) is deliberately left off the "Lift tickets" expense — the
  // starting state for the EVENT version of "add someone to an existing expense".
  const eventHousehold = await prisma.household.create({
    data: {
      name: "Demo Trip (Event)",
      householdType: "EVENT",
      currency: "USD",
      inviteCode: `TRIP${randomUUID().slice(0, 4).toUpperCase()}`,
      createdBy: alice.id,
      members: {
        create: [
          { userId: alice.id, role: "ADMIN" },
          { userId: bob.id, role: "MEMBER" },
          { userId: charlie.id, role: "MEMBER" },
        ],
      },
    },
  });

  const dana = await createDemoGuest("Dana", "guest");
  await prisma.householdMember.create({
    data: { householdId: eventHousehold.id, userId: dana.id, role: "MEMBER" },
  });

  await prisma.expense.create({
    data: {
      householdId: eventHousehold.id,
      title: "Cabin rental",
      amount: 400,
      paidBy: alice.id,
      date: new Date(),
      splitType: "FIXED",
      splits: {
        create: [
          { userId: alice.id, amountOwed: 100 },
          { userId: bob.id, amountOwed: 100 },
          { userId: charlie.id, amountOwed: 100 },
          { userId: dana.id, amountOwed: 100 },
        ],
      },
    },
  });

  await prisma.expense.create({
    data: {
      householdId: eventHousehold.id,
      title: "Lift tickets",
      amount: 150,
      paidBy: bob.id,
      date: new Date(),
      splitType: "FIXED",
      splits: {
        create: [
          { userId: alice.id, amountOwed: 50 },
          { userId: bob.id, amountOwed: 50 },
          { userId: charlie.id, amountOwed: 50 },
          // Dana intentionally left off — add her via the expense edit flow.
        ],
      },
    },
  });

  await prisma.settlement.create({
    data: { householdId: eventHousehold.id, fromUserId: charlie.id, toUserId: alice.id, amount: 50 },
  });

  console.log("\nSeeded demo data:");
  console.log(`  Login (password "${DEMO_PASSWORD}" for all): ${alice.email}, ${bob.email}, ${charlie.email}`);
  console.log(`  Demo Household (Recurring) invite code: ${recurringHousehold.inviteCode}`);
  console.log(`  Demo Trip (Event) invite code: ${eventHousehold.inviteCode}`);
  console.log(`  Groceries expense id (Recurring household): ${groceries.id}`);
  console.log(`  Guest "Dana" (Event household) user id: ${dana.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
