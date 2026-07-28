// Клиент структуры школы (классы/подгруппы/дисциплины/распределение).
export interface StSubGroup { id: string; name: string }
export interface StClass { id: string; label: string; parallel: number; letter: string; students: number; subGroups: StSubGroup[] }
export interface StSubject { id: string; name: string; color: string }
export interface StAssignment { id: string; classId: string; classLabel: string; subjectId: string; subjectName: string; subGroupId: string | null }
export interface StTeacher { id: string; name: string; assignments: StAssignment[] }
export interface StDevice { id: string; name: string; boundBy: string | null; boundAt: string }

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    credentials: "include",
    headers: { "content-type": "application/json", "x-florus-user-id": "teacher-anna", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!r.ok) throw new Error(await r.text().catch(() => r.statusText));
  return r.status === 204 ? (undefined as T) : ((await r.json()) as T);
}

export const structureApi = {
  classes: () => j<StClass[]>("/api/structure/classes"),
  createClass: (parallel: number, letter: string) =>
    j<StClass>("/api/structure/classes", { method: "POST", body: JSON.stringify({ parallel, letter }) }),
  deleteClass: (id: string) => j<void>(`/api/structure/classes/${id}`, { method: "DELETE" }),
  addSubGroup: (classId: string, name: string) =>
    j<StSubGroup>(`/api/structure/classes/${classId}/subgroups`, { method: "POST", body: JSON.stringify({ name }) }),
  deleteSubGroup: (id: string) => j<void>(`/api/structure/subgroups/${id}`, { method: "DELETE" }),

  subjects: () => j<StSubject[]>("/api/structure/subjects"),
  createSubject: (name: string, color: string) =>
    j<StSubject>("/api/structure/subjects", { method: "POST", body: JSON.stringify({ name, color }) }),
  deleteSubject: (id: string) => j<void>(`/api/structure/subjects/${id}`, { method: "DELETE" }),

  teachers: () => j<StTeacher[]>("/api/structure/teachers"),
  assign: (b: { teacherId: string; classId: string; subjectId: string; subGroupId?: string | null }) =>
    j<{ id: string }>("/api/structure/assignments", { method: "POST", body: JSON.stringify(b) }),
  unassign: (id: string) => j<void>(`/api/structure/assignments/${id}`, { method: "DELETE" }),

  devices: () => j<StDevice[]>("/api/structure/devices"),
  deleteDevice: (id: string) => j<void>(`/api/structure/devices/${id}`, { method: "DELETE" }),
};
