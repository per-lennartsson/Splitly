-- AlterTable
ALTER TABLE "household_members" ADD COLUMN     "claim_token_created_at" TIMESTAMP(3),
ADD COLUMN     "claim_token_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "household_members_claim_token_hash_key" ON "household_members"("claim_token_hash");
