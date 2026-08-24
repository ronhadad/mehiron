-- CreateEnum
CREATE TYPE "OptionKind" AS ENUM ('FLIGHT', 'HOTEL');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('OK', 'EMPTY', 'FAILED');

-- CreateTable
CREATE TABLE "Vacation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "destinationLabel" TEXT NOT NULL,
    "destinationMid" TEXT NOT NULL,
    "wikidataId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "originAirport" TEXT NOT NULL DEFAULT 'TLV',
    "checkin" DATE NOT NULL,
    "checkout" DATE NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 2,
    "childAges" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "maxStops" INTEGER,
    "freeCancellationOnly" BOOLEAN NOT NULL DEFAULT false,
    "minRating" DOUBLE PRECISION,
    "minStars" INTEGER,
    "maxNightly" INTEGER,
    "imageUrl" TEXT,
    "imageAttribution" TEXT,
    "imageProvider" TEXT,
    "intervalSeconds" INTEGER NOT NULL DEFAULT 3600,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" TIMESTAMP(3),

    CONSTRAINT "Vacation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Option" (
    "id" TEXT NOT NULL,
    "vacationId" TEXT NOT NULL,
    "kind" "OptionKind" NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchKey" TEXT,
    "airline" TEXT,
    "departTime" TEXT,
    "arriveTime" TEXT,
    "durationMinutes" INTEGER,
    "stops" INTEGER,
    "route" TEXT,
    "hotelQuery" TEXT,
    "stars" INTEGER,
    "rating" DOUBLE PRECISION,
    "ratingCount" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "targetPrice" INTEGER,
    "lastCheckedAt" TIMESTAMP(3),
    "lastStatus" "CheckStatus",
    "lastPrice" INTEGER,
    "previousPrice" INTEGER,
    "lowestPrice" INTEGER,
    "lowestAt" TIMESTAMP(3),

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "CheckStatus" NOT NULL,
    "price" INTEGER,
    "currency" TEXT,
    "cheapestCompany" TEXT,
    "note" TEXT,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "nightly" INTEGER,
    "currency" TEXT NOT NULL,
    "conditions" TEXT,
    "freeCancellation" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vacation_archived_paused_idx" ON "Vacation"("archived", "paused");

-- CreateIndex
CREATE INDEX "Option_vacationId_kind_idx" ON "Option"("vacationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Option_vacationId_kind_matchKey_key" ON "Option"("vacationId", "kind", "matchKey");

-- CreateIndex
CREATE INDEX "Snapshot_optionId_checkedAt_idx" ON "Snapshot"("optionId", "checkedAt");

-- CreateIndex
CREATE INDEX "Quote_snapshotId_idx" ON "Quote"("snapshotId");

-- CreateIndex
CREATE INDEX "Quote_company_idx" ON "Quote"("company");

-- AddForeignKey
ALTER TABLE "Option" ADD CONSTRAINT "Option_vacationId_fkey" FOREIGN KEY ("vacationId") REFERENCES "Vacation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
