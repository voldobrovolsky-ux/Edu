-- Связь карточки payroll с учётной записью EDUMED (users.json)
ALTER TABLE "Person" ADD COLUMN "systemUserId" TEXT;
ALTER TABLE "Person" ADD COLUMN "systemUsername" TEXT;
CREATE UNIQUE INDEX "Person_systemUserId_key" ON "Person"("systemUserId");
