import type { OfficeSection } from "../types/office";

export type PersonalizationSidebarSectionId = OfficeSection | "tasks";

export const PERSONALIZATION_SIDEBAR_SYNC_EVENT = "edumed:personalization-sidebar-sync";

export type PersonalizationSidebarSyncPayload = {
  selected?: PersonalizationSidebarSectionId | null;
  hovered?: PersonalizationSidebarSectionId | null;
};

export function emitPersonalizationSidebarSync(payload: PersonalizationSidebarSyncPayload) {
  window.dispatchEvent(
    new CustomEvent<PersonalizationSidebarSyncPayload>(PERSONALIZATION_SIDEBAR_SYNC_EVENT, {
      detail: payload,
    }),
  );
}
