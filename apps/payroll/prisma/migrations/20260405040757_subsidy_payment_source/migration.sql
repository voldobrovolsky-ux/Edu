-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Subsidy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isFixComponent" BOOLEAN NOT NULL DEFAULT false,
    "countsTowardMrot" BOOLEAN NOT NULL DEFAULT false,
    "isHourly" BOOLEAN NOT NULL DEFAULT false,
    "isManual" BOOLEAN NOT NULL DEFAULT true,
    "paymentSource" TEXT NOT NULL DEFAULT 'school_budget'
);
INSERT INTO "new_Subsidy" ("code", "countsTowardMrot", "id", "isFixComponent", "isHourly", "isManual", "name") SELECT "code", "countsTowardMrot", "id", "isFixComponent", "isHourly", "isManual", "name" FROM "Subsidy";
DROP TABLE "Subsidy";
ALTER TABLE "new_Subsidy" RENAME TO "Subsidy";
CREATE UNIQUE INDEX "Subsidy_code_key" ON "Subsidy"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
