/*
  Warnings:

  - Added the required column `updatedAt` to the `OrderDraft` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrderDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT,
    "recommendationId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'generic',
    "title" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "payload" TEXT,
    "impactPreviewJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderDraft_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrderDraft_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "RateChangeRecommendation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OrderDraft" ("bodyText", "createdAt", "id", "impactPreviewJson", "payload", "personId", "recommendationId", "title", "type") SELECT "bodyText", "createdAt", "id", "impactPreviewJson", "payload", "personId", "recommendationId", "title", "type" FROM "OrderDraft";
DROP TABLE "OrderDraft";
ALTER TABLE "new_OrderDraft" RENAME TO "OrderDraft";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
