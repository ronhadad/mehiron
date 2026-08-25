-- AlterTable
ALTER TABLE "Option" ADD COLUMN     "bookedAt" TIMESTAMP(3),
ADD COLUMN     "bookedPrice" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Vacation" ADD COLUMN     "priceIndex" TEXT;
