import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function getProfileFilesRoot(): string {
  return join(__dirname, "..", "..", "data", "profile-files");
}
