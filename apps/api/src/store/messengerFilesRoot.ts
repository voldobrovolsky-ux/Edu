import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function getMessengerFilesRoot(): string {
  return join(__dirname, "..", "..", "data", "messenger-files");
}
