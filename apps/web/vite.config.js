import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Звуки лежат в корне монорепы `edumed-v0.1/system_sounds/`; Vite раздаёт только `public/`. Копируем перед dev/build. */
function syncSystemSoundsFromRepoRoot() {
  const src = path.resolve(__dirname, "../../system_sounds");
  const dest = path.resolve(__dirname, "public/system_sounds");
  if (!fs.existsSync(src)) {
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function systemSoundsSyncPlugin() {
  return {
    name: "system-sounds-sync",
    buildStart() {
      syncSystemSoundsFromRepoRoot();
    },
  };
}

/** Прокси на Next payroll (:3002). При `base=/EDUMED/` iframe грузит `/EDUMED/payroll` — на Next уходит только `/payroll` (иначе Next с `basePath` отдаёт 404). */
function payrollProxyConfig(basePath) {
  const next = "http://127.0.0.1:3002";
  const common = { target: next, changeOrigin: true, ws: true };

  const out = {
    "/payroll": common,
  };

  const normalized = (basePath || "/").replace(/\/$/, "");
  if (normalized && normalized !== "") {
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out[`^${escaped}/payroll`] = {
      ...common,
      rewrite: (p) => {
        const path = typeof p === "string" ? p : "/";
        const payrollUnderBase = `${normalized}/payroll`;
        if (path.startsWith(payrollUnderBase)) {
          return path.slice(normalized.length) || "/";
        }
        return path;
      },
    };
  }

  return out;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const raw = env.VITE_BASE_PATH ?? "/";
  const base = raw.endsWith("/") ? raw : `${raw}/`;

  const devProxy = {
    "/api": {
      target: "http://127.0.0.1:3001",
      changeOrigin: true,
    },
    "/messenger-files": {
      target: "http://127.0.0.1:3001",
      changeOrigin: true,
    },
    "/profile-files": {
      target: "http://127.0.0.1:3001",
      changeOrigin: true,
    },
    ...payrollProxyConfig(base),
  };

  return {
    base,
    plugins: [systemSoundsSyncPlugin(), react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: devProxy,
    },
    preview: {
      proxy: devProxy,
    },
  };
});
