-- AlterTable
ALTER TABLE "Snapshot" ADD COLUMN     "stayAdults" INTEGER,
ADD COLUMN     "stayCheckin" DATE,
ADD COLUMN     "stayCheckout" DATE,
ADD COLUMN     "stayChildAges" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- Backfill: every existing snapshot belongs to its vacation's current stay,
-- because the dates were not editable until now.
UPDATE "Snapshot" s
SET "stayCheckin"  = v."checkin",
    "stayCheckout" = v."checkout",
    "stayAdults"   = v."adults",
    "stayChildAges" = v."childAges"
FROM "Option" o
JOIN "Vacation" v ON v."id" = o."vacationId"
WHERE o."id" = s."optionId";
