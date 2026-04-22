-- Align OrderDraft with Prisma: updatedAt NOT NULL + DEFAULT (SQLite INSERT safety).
-- Root cause: prior redefine left "updatedAt" NOT NULL without DEFAULT; Prisma adapter may omit @updatedAt-only on INSERT.
-- Prisma schema: updatedAt DateTime @default(now()) @updatedAt
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
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderDraft_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrderDraft_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "RateChangeRecommendation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OrderDraft" ("bodyText", "createdAt", "id", "impactPreviewJson", "payload", "personId", "recommendationId", "title", "type") SELECT "bodyText", "createdAt", "id", "impactPreviewJson", "payload", "personId", "recommendationId", "title", "type" FROM "OrderDraft";
DROP TABLE "OrderDraft";
ALTER TABLE "new_OrderDraft" RENAME TO "OrderDraft";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
