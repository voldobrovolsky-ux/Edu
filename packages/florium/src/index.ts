// Flörium product seed — copy `packages/florium` to a standalone repo when ready.
// TODO: Extract to standalone product: own build, CI, and identity provider; keep CRMConnector contract stable for embeds.

export { FlöriumProvider, useFlorium } from "./core/FlöriumProvider";
export type {
  FlorusSession,
  FloriumActiveModule,
  FloriumContextValue,
} from "./core/FlöriumProvider";
export { CRMConnector } from "./connector/CRMConnector";
export type { FlöriumCRMModule } from "./connector/CRMConnector";
export { FloriumLayout } from "./layout/FloriumLayout";
export type { FloriumLayoutProps } from "./layout/FloriumLayout";
export * from "./modules/communitoria";
export * from "./modules/fmail";
export * from "./modules/rivi";
