-- AlterTable
ALTER TABLE "settlements" ADD COLUMN     "expense_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
