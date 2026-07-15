import { z } from "zod";

export const expenseSplitInputSchema = z.object({
  userId: z.string(),
  percent: z.number().min(0).max(100).optional(),
  amountOwed: z.number().nonnegative().optional(),
});

export const expenseInputSchema = z.object({
  title: z.string().min(1).max(140),
  amount: z.number().positive(),
  categoryId: z.string().nullable().optional(),
  paidBy: z.string(),
  date: z.string(), // ISO date
  splitType: z.enum(["PERCENT", "FIXED"]),
  notes: z.string().max(2000).nullable().optional(),
  splits: z.array(expenseSplitInputSchema).min(1),
});

export type ExpenseInput = z.infer<typeof expenseInputSchema>;
