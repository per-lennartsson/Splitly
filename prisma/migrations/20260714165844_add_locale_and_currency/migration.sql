-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('en', 'sv');

-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('USD', 'SEK');

-- AlterTable
ALTER TABLE "households" ADD COLUMN     "currency" "CurrencyCode" NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locale" "Locale" NOT NULL DEFAULT 'en';
