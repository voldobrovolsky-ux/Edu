-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "CategoryOfficial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "CategoryInternal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "PKLevel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "PKAddonRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pkLevelId" TEXT NOT NULL,
    "hourlyAddonRub" DECIMAL NOT NULL DEFAULT 0,
    CONSTRAINT "PKAddonRule_pkLevelId_fkey" FOREIGN KEY ("pkLevelId") REFERENCES "PKLevel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PRLevel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "PRAddonRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prLevelId" TEXT NOT NULL,
    "hourlyAddonRub" DECIMAL NOT NULL DEFAULT 0,
    CONSTRAINT "PRAddonRule_prLevelId_fkey" FOREIGN KEY ("prLevelId") REFERENCES "PRLevel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OPLevel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "OPAddonRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opLevelId" TEXT NOT NULL,
    "hourlyAddonRub" DECIMAL NOT NULL DEFAULT 0,
    CONSTRAINT "OPAddonRule_opLevelId_fkey" FOREIGN KEY ("opLevelId") REFERENCES "OPLevel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CandidateBranchRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "matchJson" TEXT NOT NULL,
    "eligibility" TEXT NOT NULL,
    "recommendedInternalCategoryCode" TEXT NOT NULL,
    "pkCorridorMinCode" TEXT,
    "pkCorridorMaxCode" TEXT,
    "commentTemplate" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "CandidateProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "educationLevel" TEXT NOT NULL,
    "hasPedagogicalQualification" BOOLEAN NOT NULL DEFAULT false,
    "hasRetraining" BOOLEAN NOT NULL DEFAULT false,
    "subjectRelevance" TEXT NOT NULL DEFAULT 'relevant',
    "schoolExperienceYears" DECIMAL NOT NULL DEFAULT 0,
    "tutoringExperienceYears" DECIMAL NOT NULL DEFAULT 0,
    "questionnaireAnswers" TEXT,
    "lastRecommendationJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CandidateProfile_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CandidateAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateProfileId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "score" DECIMAL,
    "notes" TEXT,
    "assessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateAssessment_candidateProfileId_fkey" FOREIGN KEY ("candidateProfileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmployeeProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "guaranteedMonthlyFixRub" DECIMAL NOT NULL DEFAULT 0,
    "hireDate" DATETIME,
    "positionTitle" TEXT,
    CONSTRAINT "EmployeeProfile_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmploymentContract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "notes" TEXT,
    CONSTRAINT "EmploymentContract_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Person" (
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

-- CreateTable
CREATE TABLE "PrOpHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "prLevelId" TEXT,
    "opLevelId" TEXT,
    "effectiveFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrOpHistory_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrOpHistory_prLevelId_fkey" FOREIGN KEY ("prLevelId") REFERENCES "PRLevel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PrOpHistory_opLevelId_fkey" FOREIGN KEY ("opLevelId") REFERENCES "OPLevel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HourEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "lessonHours" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HourEntry_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubstitutionEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "substitutingPersonId" TEXT NOT NULL,
    "replacedPersonId" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "hours" DECIMAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubstitutionEntry_substitutingPersonId_fkey" FOREIGN KEY ("substitutingPersonId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubstitutionEntry_replacedPersonId_fkey" FOREIGN KEY ("replacedPersonId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "calculatedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollRun_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payrollRunId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "lineType" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "Subsidy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isFixComponent" BOOLEAN NOT NULL DEFAULT false,
    "countsTowardMrot" BOOLEAN NOT NULL DEFAULT false,
    "isHourly" BOOLEAN NOT NULL DEFAULT false,
    "isManual" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Adjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "subsidyTypeId" TEXT,
    "payrollRunId" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "direction" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Adjustment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Adjustment_subsidyTypeId_fkey" FOREIGN KEY ("subsidyTypeId") REFERENCES "Subsidy" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Adjustment_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "MrotSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "federalMrotMonthly" DECIMAL NOT NULL,
    "regionalOverrideMonthly" DECIMAL,
    "effectiveDate" DATETIME NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RateChangeRecommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "proposedPKLevelId" TEXT,
    "analystLabel" TEXT NOT NULL DEFAULT 'ai_analyst',
    "reasonText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RateChangeRecommendation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RateChangeRecommendation_proposedPKLevelId_fkey" FOREIGN KEY ("proposedPKLevelId") REFERENCES "PKLevel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RateChangeApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recommendationId" TEXT NOT NULL,
    "approverPersonId" TEXT,
    "approverRole" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "decidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    CONSTRAINT "RateChangeApproval_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "RateChangeRecommendation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RateChangeApproval_approverPersonId_fkey" FOREIGN KEY ("approverPersonId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT,
    "recommendationId" TEXT,
    "title" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "impactPreviewJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderDraft_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrderDraft_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "RateChangeRecommendation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "actorRole" TEXT,
    "actorPersonId" TEXT,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorPersonId_fkey" FOREIGN KEY ("actorPersonId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_code_key" ON "UserRole"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryOfficial_code_key" ON "CategoryOfficial"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryInternal_code_key" ON "CategoryInternal"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PKLevel_code_key" ON "PKLevel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PKAddonRule_pkLevelId_key" ON "PKAddonRule"("pkLevelId");

-- CreateIndex
CREATE UNIQUE INDEX "PRLevel_code_key" ON "PRLevel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PRAddonRule_prLevelId_key" ON "PRAddonRule"("prLevelId");

-- CreateIndex
CREATE UNIQUE INDEX "OPLevel_code_key" ON "OPLevel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "OPAddonRule_opLevelId_key" ON "OPAddonRule"("opLevelId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateBranchRule_code_key" ON "CandidateBranchRule"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateProfile_personId_key" ON "CandidateProfile"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_personId_key" ON "EmployeeProfile"("personId");

-- CreateIndex
CREATE INDEX "HourEntry_personId_year_month_idx" ON "HourEntry"("personId", "year", "month");

-- CreateIndex
CREATE INDEX "SubstitutionEntry_substitutingPersonId_year_month_idx" ON "SubstitutionEntry"("substitutingPersonId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_year_month_key" ON "PayrollPeriod"("year", "month");

-- CreateIndex
CREATE INDEX "PayrollLine_payrollRunId_personId_idx" ON "PayrollLine"("payrollRunId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "Subsidy_code_key" ON "Subsidy"("code");

-- CreateIndex
CREATE INDEX "Adjustment_personId_year_month_idx" ON "Adjustment"("personId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
