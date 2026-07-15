import { z } from "zod";

export const recurringOverrideInputSchema = z.object({
  userId: z.string(),
  percent: z.number().min(0).max(100).nullable().optional(),
  amountOwed: z.number().nonnegative().nullable().optional(),
});

export const recurringInputSchema = z.object({
  title: z.string().min(1).max(140),
  amount: z.number().positive(),
  categoryId: z.string().nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(31),
  paidBy: z.string(),
  splitType: z.enum(["PERCENT", "FIXED"]),
  startDate: z.string(),
  endDate: z.string().nullable().optional(),
  active: z.boolean().optional(),
  overrides: z.array(recurringOverrideInputSchema).optional().default([]),
});

export type RecurringInput = z.infer<typeof recurringInputSchema>;
