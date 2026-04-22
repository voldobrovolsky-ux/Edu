-- CreateTable
CREATE TABLE "HourEventType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payFactor" DECIMAL NOT NULL DEFAULT 1,
    "countsTowardMrot" BOOLEAN NOT NULL DEFAULT false,
    "countsTowardLoad" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "HourEventType_code_key" ON "HourEventType"("code");

-- Seed defaults (stable ids for FK backfill)
INSERT INTO "HourEventType" ("id", "code", "name", "payFactor", "countsTowardMrot", "countsTowardLoad", "sortOrder") VALUES
('het_lh', 'lesson_held', 'Урок проведён', 1, true, true, 10),
('het_lcs', 'lesson_cancelled_by_school', 'Отмена по школе', 1, true, true, 20),
('het_lcst', 'lesson_cancelled_by_student', 'Отмена по ученику', 0, false, false, 30),
('het_nst', 'no_show_teacher', 'Неявка педагога', 0, false, true, 40),
('het_fc', 'free_class', 'Бесплатное занятие', 0, false, true, 50),
('het_sub', 'substitution', 'Замена', 1, true, true, 60);

-- Drop unique index on old HourEntry (multiple rows per month allowed)
DROP INDEX IF EXISTS "HourEntry_personId_year_month_key";

-- Redefine HourEntry with hourEventTypeId
PRAGMA foreign_keys=OFF;

CREATE TABLE "HourEntry_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "lessonHours" DECIMAL NOT NULL DEFAULT 0,
    "hourEventTypeId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HourEntry_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HourEntry_hourEventTypeId_fkey" FOREIGN KEY ("hourEventTypeId") REFERENCES "HourEventType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "HourEntry_new" ("id", "personId", "year", "month", "lessonHours", "hourEventTypeId", "notes", "createdAt", "updatedAt")
SELECT "id", "personId", "year", "month", "lessonHours", 'het_lh', "notes", "createdAt", "updatedAt" FROM "HourEntry";

DROP TABLE "HourEntry";
ALTER TABLE "HourEntry_new" RENAME TO "HourEntry";

CREATE INDEX "HourEntry_personId_year_month_idx" ON "HourEntry"("personId", "year", "month");

CREATE TABLE "SubstitutionEntry_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "substitutingPersonId" TEXT NOT NULL,
    "replacedPersonId" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "hours" DECIMAL NOT NULL,
    "hourEventTypeId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubstitutionEntry_substitutingPersonId_fkey" FOREIGN KEY ("substitutingPersonId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubstitutionEntry_replacedPersonId_fkey" FOREIGN KEY ("replacedPersonId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SubstitutionEntry_hourEventTypeId_fkey" FOREIGN KEY ("hourEventTypeId") REFERENCES "HourEventType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "SubstitutionEntry_new" ("id", "substitutingPersonId", "replacedPersonId", "year", "month", "hours", "hourEventTypeId", "notes", "createdAt")
SELECT "id", "substitutingPersonId", "replacedPersonId", "year", "month", "hours", 'het_sub', "notes", "createdAt" FROM "SubstitutionEntry";

DROP TABLE "SubstitutionEntry";
ALTER TABLE "SubstitutionEntry_new" RENAME TO "SubstitutionEntry";

CREATE INDEX "SubstitutionEntry_substitutingPersonId_year_month_idx" ON "SubstitutionEntry"("substitutingPersonId", "year", "month");

PRAGMA foreign_keys=ON;
