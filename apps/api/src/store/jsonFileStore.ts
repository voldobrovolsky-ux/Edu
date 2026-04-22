import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export function readJsonArrayFile<T>(path: string): T[] {
  ensureJsonFile(path, "[]");
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function writeJsonArrayFile<T>(path: string, data: T[]): void {
  ensureJsonFile(path, "[]");
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

export function readJsonFile<T>(path: string, fallback: T): T {
  ensureJsonFile(path, "{}");
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFile<T>(path: string, data: T): void {
  ensureJsonFile(path, "{}");
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

function ensureJsonFile(path: string, initialContent: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(path)) writeFileSync(path, initialContent, "utf-8");
}

