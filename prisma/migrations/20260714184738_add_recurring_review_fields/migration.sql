-- AlterTable
ALTER TABLE "recurring_expenses" ADD COLUMN     "last_confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "review_interval_months" INTEGER NOT NULL DEFAULT 6;
