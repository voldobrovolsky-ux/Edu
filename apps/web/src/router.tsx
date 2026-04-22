import { createBrowserRouter, Navigate } from "react-router-dom";
import { PrivateRoute } from "./routes/PrivateRoute";
import { FloriumShell } from "./florium/FloriumShell";
import { LoginPage } from "./pages/LoginPage";
import { AppLayout } from "./layout/AppLayout";
import { RootShell } from "./layout/RootShell";
import { HomePage } from "./pages/HomePage";
import { SectionPage } from "./pages/SectionPage";
import { MainPage } from "./pages/MainPage";
import { JournalPanelsPage } from "./pages/JournalPanelsPage";
import { JournalTablePage } from "./pages/JournalTablePage";
import { DiaryEntryPage } from "./pages/DiaryEntryPage";
import { DiaryViewPage } from "./pages/DiaryViewPage";
import { DocumentsFoldersPage } from "./pages/DocumentsFoldersPage";
import { DocumentsRoutesMapScreen } from "./pages/DocumentsRoutesMapScreen";
import { TimetablePage } from "./pages/TimetablePage";
import { MethospaceDisciplinesPage } from "./pages/MethospaceDisciplinesPage";
import { MethospaceDisciplinePage } from "./pages/MethospaceDisciplinePage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { RoleRoute } from "./routes/RoleRoute";
import { ParentFinancePage } from "./pages/ParentFinancePage";
import { StudentFinancePage } from "./pages/StudentFinancePage";
import { UsersAdminPage } from "./pages/UsersAdminPage";
import { TeacherAdminProfilePage } from "./pages/TeacherAdminProfilePage";
import { CandidateApplyPage } from "./pages/CandidateApplyPage";
import { CandidateAdminProfilePage } from "./pages/CandidateAdminProfilePage";
import { JoinGroupChatPage } from "./pages/JoinGroupChatPage";
import { ProfilePage } from "./pages/ProfilePage";
import { JournalClassPage } from "./pages/JournalClassPage";
import { PersonalizationPage } from "./pages/PersonalizationPage";
import { TaskTrackerPage } from "./pages/TaskTrackerPage";
import { TimetablePrintPage } from "./pages/TimetablePrintPage";
import { PayrollHostPage } from "./pages/PayrollHostPage";

/** С `base: /EDUMED/` иначе URL `/EDUMED/section/payroll` не совпадает с маршрутами → RR 404. */
const basename =
  import.meta.env.BASE_URL === "/" || import.meta.env.BASE_URL === ""
    ? undefined
    : import.meta.env.BASE_URL.replace(/\/$/, "");

export const router = createBrowserRouter(
  [
  {
    element: <RootShell />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "candidate/apply/:candidateId", element: <CandidateApplyPage /> },
      {
        path: "/timetable/print",
        element: (
          <PrivateRoute>
            <TimetablePrintPage />
          </PrivateRoute>
        ),
      },
      {
        path: "/",
        element: (
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        ),
        children: [
          { index: true, element: <HomePage /> },
          { path: "florium", element: <FloriumShell /> },
          { path: "section/main", element: <MainPage /> },
          { path: "section/tasks", element: <TaskTrackerPage /> },
          { path: "section/timetable", element: <TimetablePage /> },
          { path: "section/analytics", element: <AnalyticsPage /> },
          {
            path: "section/parent_finance",
            element: (
              <RoleRoute allow={["parent"]}>
                <ParentFinancePage />
              </RoleRoute>
            ),
          },
          {
            path: "section/student_finance",
            element: (
              <RoleRoute allow={["student"]}>
                <StudentFinancePage />
              </RoleRoute>
            ),
          },
          { path: "section/journal", element: <JournalPanelsPage /> },
          { path: "section/journal/class/:grade", element: <JournalClassPage /> },
          { path: "section/journal/:grade/:disciplineCode", element: <JournalTablePage /> },
          { path: "section/diary", element: <DiaryEntryPage /> },
          { path: "section/diary/:studentUserId", element: <DiaryViewPage /> },
          { path: "section/document_archive", element: <Navigate to="/documents" replace /> },
          { path: "documents", element: <DocumentsFoldersPage /> },
          { path: "documents/routes-map", element: <DocumentsRoutesMapScreen /> },
          { path: "documents/folder/:folderId", element: <DocumentsFoldersPage /> },
          { path: "documents/section/:sectionId", element: <DocumentsFoldersPage /> },
          { path: "documents/section/:sectionId/folder/:folderId", element: <DocumentsFoldersPage /> },
          { path: "section/methospace", element: <MethospaceDisciplinesPage /> },
          { path: "section/methospace/:baseCode", element: <MethospaceDisciplinePage /> },
          { path: "section/users_admin/teacher/:teacherUserId", element: <TeacherAdminProfilePage /> },
          { path: "section/users_admin/candidate/:candidateId", element: <CandidateAdminProfilePage /> },
          { path: "section/users_admin", element: <UsersAdminPage /> },
          { path: "section/chats/join/:token", element: <JoinGroupChatPage /> },
          { path: "section/chats", element: <Navigate to="/florium" replace /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "settings/personalization", element: <PersonalizationPage /> },
          { path: "section/payroll", element: <PayrollHostPage /> },
          { path: "section/:sectionId", element: <SectionPage /> },
        ],
      },
    ],
  },
  ],
  basename ? { basename } : {},
);
