import fs from "node:fs";
import path from "node:path";

function walkUpForSchema(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 16; i++) {
    if (fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Resolves the app root that contains prisma/schema.prisma (Next workers may use cwd under .next/).
 */
export function findPrismaSchemaRoot(): string {
  const candidates = [
    process.cwd(),
    path.join(process.cwd(), "edumed-payroll"),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "..", "edumed-payroll"),
    path.resolve(process.cwd(), "..", ".."),
  ];

  for (const c of candidates) {
    const found = walkUpForSchema(c);
    if (found) return found;
  }

  return process.cwd();
}
