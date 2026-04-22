import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Hosted inside EDUMED web app under `/payroll` (Vite proxy → Next dev on :3002).
 * Pin Turbopack root to this package so the monorepo root is not inferred incorrectly.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/payroll",
  assetPrefix: "/payroll",
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
