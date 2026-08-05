import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { vi } from "vitest";
import { prisma } from "@/lib/prisma";

/** Email domain used to tag every user created by integration tests, so cleanup never touches real data. */
export const TEST_EMAIL_DOMAIN = "splitly.test";

/** Name prefix used to tag every household created by integration tests. */
export const TEST_HOUSEHOLD_PREFIX = "[IT] ";

export interface TestSessionUser {
  id: string;
  name: string;
  email: string;
}

/** Points next-auth's mocked getServerSession at the given user for the current test. */
export async function mockSessionAs(user: TestSessionUser) {
  const { getServerSession } = await import("next-auth");
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: user.id, name: user.name, email: user.email, locale: "en" },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  } as never);
}

/** Builds a Request suitable for passing directly to a route handler. */
export function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Creates a real, loggable-in test user tagged with the test email domain. */
export async function createTestUser(overrides?: { name?: string }): Promise<TestSessionUser> {
  const passwordHash = await bcrypt.hash("integration-test-password", 4);
  const user = await prisma.user.create({
    data: {
      email: `it-${randomUUID()}@${TEST_EMAIL_DOMAIN}`,
      passwordHash,
      name: overrides?.name ?? "Test User",
    },
  });
  return { id: user.id, name: user.name, email: user.email };
}

const trackedHouseholdIds = new Set<string>();
const trackedUserIds = new Set<string>();

export function trackHousehold(id: string) {
  trackedHouseholdIds.add(id);
}

export function trackUser(id: string) {
  trackedUserIds.add(id);
}

/**
 * Deletes every household/user this test file created, in FK-safe order:
 * households first (cascades members/expenses/splits/recurring/settlements),
 * then the users themselves (Expense.payer/Settlement have no cascade from User).
 */
export async function cleanupTracked() {
  if (trackedHouseholdIds.size > 0) {
    await prisma.household.deleteMany({ where: { id: { in: [...trackedHouseholdIds] } } });
    trackedHouseholdIds.clear();
  }
  if (trackedUserIds.size > 0) {
    await prisma.user.deleteMany({ where: { id: { in: [...trackedUserIds] } } });
    trackedUserIds.clear();
  }
}

export async function asJson<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export function paramsOf<T extends object>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}
