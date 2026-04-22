-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "actorRole" TEXT,
    "actorPersonId" TEXT,
    "reason" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'success',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorPersonId_fkey" FOREIGN KEY ("actorPersonId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AuditLog" ("action", "actorPersonId", "actorRole", "afterJson", "beforeJson", "createdAt", "entityId", "entityType", "id", "reason") SELECT "action", "actorPersonId", "actorRole", "afterJson", "beforeJson", "createdAt", "entityId", "entityType", "id", "reason" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE TABLE "new_OrderDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT,
    "recommendationId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'generic',
    "title" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "payload" TEXT,
    "impactPreviewJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderDraft_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrderDraft_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "RateChangeRecommendation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OrderDraft" ("bodyText", "createdAt", "id", "impactPreviewJson", "personId", "recommendationId", "title") SELECT "bodyText", "createdAt", "id", "impactPreviewJson", "personId", "recommendationId", "title" FROM "OrderDraft";
DROP TABLE "OrderDraft";
ALTER TABLE "new_OrderDraft" RENAME TO "OrderDraft";
CREATE TABLE "new_PayrollLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payrollRunId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "lineType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "rate" DECIMAL NOT NULL DEFAULT 0,
    "amount" DECIMAL NOT NULL,
    "direction" TEXT NOT NULL,
    "formulaText" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL DEFAULT '',
    "countsTowardMrot" BOOLEAN NOT NULL DEFAULT false,
    "flexOrFix" TEXT NOT NULL,
    "explanationJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollLine_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayrollLine_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PayrollLine" ("amount", "countsTowardMrot", "createdAt", "direction", "explanationJson", "flexOrFix", "formulaText", "id", "lineType", "payrollRunId", "personId", "quantity", "rate", "sourceReference", "title") SELECT "amount", "countsTowardMrot", "createdAt", "direction", "explanationJson", "flexOrFix", "formulaText", "id", "lineType", "payrollRunId", "personId", "quantity", "rate", "sourceReference", "title" FROM "PayrollLine";
DROP TABLE "PayrollLine";
ALTER TABLE "new_PayrollLine" RENAME TO "PayrollLine";
CREATE INDEX "PayrollLine_payrollRunId_personId_sortOrder_idx" ON "PayrollLine"("payrollRunId", "personId", "sortOrder");
CREATE TABLE "new_PayrollRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "settingsSnapshot" TEXT,
    "calcError" TEXT,
    "calculatedAt" DATETIME,
    "finalizedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollRun_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PayrollRun" ("calculatedAt", "createdAt", "id", "notes", "periodId", "status") SELECT "calculatedAt", "createdAt", "id", "notes", "periodId", "status" FROM "PayrollRun";
DROP TABLE "PayrollRun";
ALTER TABLE "new_PayrollRun" RENAME TO "PayrollRun";
CREATE TABLE "new_Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL,
    "workFormat" TEXT NOT NULL,
    "officialCategoryId" TEXT,
    "internalCategoryId" TEXT,
    "currentPKLevelId" TEXT,
    "fixedPKLevelId" TEXT,
    "recommendedPKLevelId" TEXT,
    "prLevelId" TEXT,
    "opLevelId" TEXT,
    "branchRuleId" TEXT,
    "baseHourRateOverride" DECIMAL,
    "isVisibleInAccounting" BOOLEAN NOT NULL DEFAULT true,
    "canReceiveHourEntries" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "userRoleId" TEXT,
    CONSTRAINT "Person_officialCategoryId_fkey" FOREIGN KEY ("officialCategoryId") REFERENCES "CategoryOfficial" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Person_internalCategoryId_fkey" FOREIGN KEY ("internalCategoryId") REFERENCES "CategoryInternal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Person_currentPKLevelId_fkey" FOREIGN KEY ("currentPKLevelId") REFERENCES "PKLevel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Person_fixedPKLevelId_fkey" FOREIGN KEY ("fixedPKLevelId") REFERENCES "PKLevel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Person_recommendedPKLevelId_fkey" FOREIGN KEY ("recommendedPKLevelId") REFERENCES "PKLevel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Person_prLevelId_fkey" FOREIGN KEY ("prLevelId") REFERENCES "PRLevel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Person_opLevelId_fkey" FOREIGN KEY ("opLevelId") REFERENCES "OPLevel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Person_branchRuleId_fkey" FOREIGN KEY ("branchRuleId") REFERENCES "CandidateBranchRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Person_userRoleId_fkey" FOREIGN KEY ("userRoleId") REFERENCES "UserRole" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Person" ("baseHourRateOverride", "branchRuleId", "currentPKLevelId", "email", "employmentType", "fixedPKLevelId", "fullName", "id", "internalCategoryId", "isVisibleInAccounting", "notes", "officialCategoryId", "opLevelId", "phone", "prLevelId", "recommendedPKLevelId", "status", "userRoleId", "workFormat") SELECT "baseHourRateOverride", "branchRuleId", "currentPKLevelId", "email", "employmentType", "fixedPKLevelId", "fullName", "id", "internalCategoryId", "isVisibleInAccounting", "notes", "officialCategoryId", "opLevelId", "phone", "prLevelId", "recommendedPKLevelId", "status", "userRoleId", "workFormat" FROM "Person";
DROP TABLE "Person";
ALTER TABLE "new_Person" RENAME TO "Person";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "HourEntry_personId_year_month_key" ON "HourEntry"("personId", "year", "month");
