import type { User } from "../types/user";

export type UploadSourceId = "journal_lesson" | "methospace_discipline" | "documents_panel";

export type UploadTargetRef =
  | { type: "folder"; folderId: string }
  | { type: "section_loose"; sectionId: string }
  | { type: "panel_loose" };

export type ClientUploadRoute = {
  source: UploadSourceId;
  targets: UploadTargetRef[];
};

export const UPLOAD_SOURCE_OPTIONS: { id: UploadSourceId; label: string }[] = [
  { id: "journal_lesson", label: "Загрузить документ в Журнал (урок)" },
  { id: "methospace_discipline", label: "Загрузить документ в Методпространство" },
  { id: "documents_panel", label: "Загрузить документ в Документы (панель)" },
];

export function canManageDocumentUploadRoutes(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.username.trim().toLowerCase() === "admin") return true;
  return user.primaryRole === "sysadmin" || user.primaryRole === "director" || user.primaryRole === "head_teacher";
}

export function targetLabel(
  t: UploadTargetRef,
  sections: { id: string; name: string }[],
  folders: { id: string; name: string }[],
): string {
  if (t.type === "panel_loose") return "Архив: отдельные документы (корень панели)";
  if (t.type === "section_loose") {
    const s = sections.find((x) => x.id === t.sectionId);
    return `Документы раздела «${s?.name ?? t.sectionId}» (без папки)`;
  }
  const f = folders.find((x) => x.id === t.folderId);
  return `Папка «${f?.name ?? t.folderId}»`;
}
