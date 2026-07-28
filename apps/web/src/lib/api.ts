import {
  API_ROUTES,
  type TeacherClass,
  type TeacherProfile,
  type LessonStation,
  type LessonDetail,
  type JournalData,
  type JournalRow,
  type SetGradeRequest,
  type VoiceGradeRequest,
  type VoiceGradeResponse,
  type NotificationDto,
} from "@edustore/shared";

const DEV_TEACHER = "teacher-anna"; // dev-аутентификация: подставляем сид-учителя

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "content-type": "application/json",
      "x-florus-user-id": DEV_TEACHER,
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const api = {
  getProfile: () => http<TeacherProfile>(API_ROUTES.teacherProfile),
  getClasses: () => http<TeacherClass[]>(API_ROUTES.teacherClasses),
  getLessons: (classId: string, subjectId?: string) =>
    http<LessonStation[]>(
      API_ROUTES.lessons(classId) + (subjectId ? `?subjectId=${subjectId}` : ""),
    ),
  getLesson: (lessonId: string) => http<LessonDetail>(API_ROUTES.lesson(lessonId)),
  getJournal: (classId: string, subjectId?: string) =>
    http<JournalData>(
      API_ROUTES.journal(classId) + (subjectId ? `?subjectId=${subjectId}` : ""),
    ),
  setGrade: (body: SetGradeRequest) =>
    http<JournalRow>(API_ROUTES.grade, { method: "POST", body: JSON.stringify(body) }),
  voiceGrade: (body: VoiceGradeRequest) =>
    http<VoiceGradeResponse>(API_ROUTES.voiceGrade, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getNotifications: () => http<NotificationDto[]>(API_ROUTES.notifications),
};
