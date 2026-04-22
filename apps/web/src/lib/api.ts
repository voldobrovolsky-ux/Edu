import type { OfficeConfig } from "../types/office";
import type { User } from "../types/user";
import type { CandidateAnalytics, CandidateApplication, CandidateFile, CandidateListItem } from "../types/candidates";
import { playServiceSound } from "../audio/systemSounds";

export type AuthResponse = {
  accessToken: string;
  user: User;
};

type ApiJsonInit = RequestInit & {
  token?: string;
  suppressSuccessSound?: boolean;
};

function shouldPlaySuccessFeedback(path: string, method: string, suppressSuccessSound?: boolean): boolean {
  if (suppressSuccessSound) return false;
  const normalized = path.split("?")[0];
  if (normalized === "/api/auth/login") return false;
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

export async function apiJson<T>(
  path: string,
  init?: ApiJsonInit,
): Promise<T> {
  const method = String(init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  if (init?.token) headers.set("authorization", `Bearer ${init.token}`);

  const res = await fetch(path, { ...init, headers });
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    throw new Error(
      typeof data === "object" && data && "error" in (data as any)
        ? String((data as any).error)
        : `HTTP_${res.status}`,
    );
  }
  if (shouldPlaySuccessFeedback(path, method, init?.suppressSuccessSound)) {
    playServiceSound("success");
  }
  return data as T;
}

export async function apiForm<T>(
  path: string,
  init: { method: "POST" | "PUT" | "PATCH"; token: string; form: FormData },
): Promise<T> {
  const headers = new Headers();
  headers.set("authorization", `Bearer ${init.token}`);
  const res = await fetch(path, { method: init.method, headers, body: init.form });
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    throw new Error(
      typeof data === "object" && data && "error" in (data as any)
        ? String((data as any).error)
        : `HTTP_${res.status}`,
    );
  }
  playServiceSound("success");
  return data as T;
}

export type ChatApiMessage = Record<string, unknown> & {
  id: string;
  fromUserId?: string;
  toUserId?: string;
  senderUserId?: string;
  text?: string;
  createdAt: string;
  deletedForAll?: boolean;
};

const chatsApi = {
  users: (token: string, q?: string) => {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return apiJson<{
      users: Array<{
        id: string;
        fio: string;
        username: string;
        role: string;
        avatarUrl: string | null;
        allowDirectGroupAdd?: boolean;
        lastSeenAt?: string | null;
      }>;
    }>(`/api/chats/users${qs}`, { method: "GET", token });
  },
  usersBatch: (token: string, ids: string[]) =>
    apiJson<{
      users: Array<{ id: string; fio: string; username: string; avatarUrl: string | null }>;
    }>("/api/chats/users/batch", {
      method: "POST",
      token,
      body: JSON.stringify({ ids }),
      suppressSuccessSound: true,
    }),
  inbox: (token: string) =>
    apiJson<{
      items: Array<
        | {
            kind: "direct";
            peerUserId: string;
            title: string;
            username: string;
            lastMessagePreview: string;
            lastMessageAt: string;
            unread: number;
            important: boolean;
            muted: boolean;
            muteExpiresAt?: string | null;
            incomingSoundId?: string | null;
          }
        | {
            kind: "group";
            groupId: string;
            title: string;
            description: string | null;
            avatarEmoji: string | null;
            avatarImageUrl: string | null;
            isSystemGroup?: boolean;
            lastMessagePreview: string;
            lastMessageAt: string;
            unread: number;
            important: boolean;
            muted: boolean;
            muteExpiresAt?: string | null;
            incomingSoundId?: string | null;
          }
      >;
    }>("/api/chats/inbox", { method: "GET", token }),
  messages: (token: string, args: { userId: string }) => {
    const q = new URLSearchParams({ userId: args.userId });
    return apiJson<{ messages: ChatApiMessage[] }>(`/api/chats/messages?${q.toString()}`, { method: "GET", token });
  },
  sendMessage: (
    token: string,
    body: {
      toUserId: string;
      text: string;
      attachments?: unknown[];
      poll?: unknown;
      mentionUserIds?: string[];
      replyToMessageId?: string;
    },
  ) =>
    apiJson<{ message: ChatApiMessage }>("/api/chats/messages", {
      method: "POST",
      token,
      body: JSON.stringify(body),
      suppressSuccessSound: true,
    }),
  markAsRead: (token: string, body: { userId: string }) =>
    apiJson<{ updatedCount: number; messages: ChatApiMessage[] }>("/api/chats/messages/read", {
      method: "POST",
      token,
      body: JSON.stringify(body),
      suppressSuccessSound: true,
    }),
  unreadCount: (token: string) => apiJson<{ total: number }>("/api/chats/unread-count", { method: "GET", token }),
  deleteDirectMessage: (token: string, messageId: string) =>
    apiJson<{ message: ChatApiMessage }>(`/api/chats/messages/${encodeURIComponent(messageId)}/delete`, {
      method: "POST",
      token,
      body: JSON.stringify({}),
    }),
  reactionDirect: (token: string, messageId: string, emoji: string) =>
    apiJson<{ message: ChatApiMessage }>(`/api/chats/messages/${encodeURIComponent(messageId)}/reactions`, {
      method: "POST",
      token,
      body: JSON.stringify({ emoji }),
    }),
  pinDirect: (token: string, messageId: string, pinned: boolean) =>
    apiJson<{ message: ChatApiMessage }>(`/api/chats/messages/${encodeURIComponent(messageId)}/pin`, {
      method: "POST",
      token,
      body: JSON.stringify({ pinned }),
    }),
  pollVoteDirect: (token: string, messageId: string, optionId: string) =>
    apiJson<{ message: ChatApiMessage }>(`/api/chats/messages/${encodeURIComponent(messageId)}/poll-vote`, {
      method: "POST",
      token,
      body: JSON.stringify({ optionId }),
    }),
  pollCloseDirect: (token: string, messageId: string) =>
    apiJson<{ message: ChatApiMessage }>(`/api/chats/messages/${encodeURIComponent(messageId)}/poll-close`, {
      method: "POST",
      token,
      body: JSON.stringify({}),
    }),
  pinnedDirect: (token: string, peerUserId: string) =>
    apiJson<{ messages: ChatApiMessage[] }>(
      `/api/chats/direct/pinned?peerUserId=${encodeURIComponent(peerUserId)}`,
      { method: "GET", token },
    ),
  uploadFiles: (token: string, files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    return apiForm<{ attachments: Array<{ id: string; fileName: string; mime: string; url: string; size: number }> }>(
      "/api/chats/upload",
      { method: "POST", token, form },
    );
  },
  patchPrefs: (
    token: string,
    body: {
      convKey: string;
      muted?: boolean;
      important?: boolean;
      showDeletedMod?: boolean;
      muteExpiresAt?: string | null;
      incomingSoundId?: string | null;
    },
  ) => apiJson<{ prefs: Record<string, unknown> }>("/api/chats/prefs", { method: "PATCH", token, body: JSON.stringify(body) }),
  presence: (token: string, userId: string) =>
    apiJson<{ lastSeenAt: string | null; online: boolean; presenceHidden?: boolean }>(
      `/api/chats/presence/${encodeURIComponent(userId)}`,
      {
        method: "GET",
        token,
      },
    ),
  postTyping: (token: string, body: { channel: "direct" | "group"; peerUserId?: string; groupId?: string; active: boolean }) =>
    apiJson<{ ok: boolean }>("/api/chats/typing", {
      method: "POST",
      token,
      body: JSON.stringify(body),
      suppressSuccessSound: true,
    }),
  getTyping: (token: string, q: { peerUserId?: string; groupId?: string }) => {
    const p = new URLSearchParams();
    if (q.peerUserId) p.set("peerUserId", q.peerUserId);
    if (q.groupId) p.set("groupId", q.groupId);
    return apiJson<{ userIds: string[] }>(`/api/chats/typing?${p.toString()}`, { method: "GET", token });
  },
  botReplacementToggleSlot: (token: string, promptId: string, slotIndex: number) =>
    apiJson<{ ok: boolean }>(`/api/chats/bot/replacement-prompts/${encodeURIComponent(promptId)}/toggle-slot`, {
      method: "POST",
      token,
      body: JSON.stringify({ slotIndex }),
    }),
  botReplacementRequestConfirm: (token: string, promptId: string) =>
    apiJson<{ ok: boolean }>(`/api/chats/bot/replacement-prompts/${encodeURIComponent(promptId)}/request-confirm`, {
      method: "POST",
      token,
      body: JSON.stringify({}),
    }),
  botReplacementConfirm: (token: string, promptId: string, ok: boolean) =>
    apiJson<{ ok: boolean }>(`/api/chats/bot/replacement-prompts/${encodeURIComponent(promptId)}/confirm`, {
      method: "POST",
      token,
      body: JSON.stringify({ ok }),
    }),
  searchMessages: (token: string, q: { q: string; peerUserId?: string; groupId?: string; topicId?: string }) => {
    const p = new URLSearchParams({ q: q.q });
    if (q.peerUserId) p.set("peerUserId", q.peerUserId);
    if (q.groupId) p.set("groupId", q.groupId);
    if (q.topicId) p.set("topicId", q.topicId);
    return apiJson<{ messages: ChatApiMessage[] }>(`/api/chats/search/messages?${p.toString()}`, { method: "GET", token });
  },
  createGroup: (
    token: string,
    body: { title: string; description?: string | null; avatarEmoji?: string | null; avatarImageUrl?: string | null; memberUserIds: string[] },
  ) =>
    apiJson<{ group: Record<string, unknown>; defaultTopic: { id: string; name: string } }>("/api/chats/groups", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  patchGroup: (token: string, groupId: string, body: Record<string, unknown>) =>
    apiJson<{ group: Record<string, unknown> }>(`/api/chats/groups/${encodeURIComponent(groupId)}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),
  getGroup: (token: string, groupId: string) =>
    apiJson<{
      group: {
        id: string;
        title: string;
        description?: string | null;
        avatarEmoji?: string | null;
        avatarImageUrl?: string | null;
        createdByUserId?: string;
        invitePolicy?: string;
        inviteToken?: string;
        groupMeta?: Record<string, unknown>;
      };
      prefs: {
        showDeletedMod?: boolean;
        muted?: boolean;
        muteExpiresAt?: string | null;
        incomingSoundId?: string | null;
        important?: boolean;
      };
    }>(`/api/chats/groups/${encodeURIComponent(groupId)}`, { method: "GET", token }),
  groupInvite: (token: string, groupId: string) =>
    apiJson<{ token: string; url: string }>(`/api/chats/groups/${encodeURIComponent(groupId)}/invite`, { method: "GET", token }),
  createGroupInviteLink: (
    token: string,
    groupId: string,
    body: { label?: string; password?: string | null },
  ) =>
    apiJson<{
      link: { id: string; label?: string; token: string; createdAt: string; url: string; hasPassword: boolean };
    }>(`/api/chats/groups/${encodeURIComponent(groupId)}/invite-links`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  leaveGroup: (token: string, groupId: string, body: { mode: "leave" | "delete_all" }) =>
    apiJson<{ ok: boolean; deleted?: boolean }>(`/api/chats/groups/${encodeURIComponent(groupId)}/leave`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  groupMembers: (token: string, groupId: string) =>
    apiJson<{ members: Array<{ userId: string; fio: string; username: string; localDisplayName?: string | null; role: string; mutedUntil: string | null }> }>(
      `/api/chats/groups/${encodeURIComponent(groupId)}/members`,
      { method: "GET", token },
    ),
  addGroupMember: (token: string, groupId: string, body: { userId: string; role?: "admin" | "member" }) =>
    apiJson<{ member: unknown }>(`/api/chats/groups/${encodeURIComponent(groupId)}/members`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  removeGroupMember: (token: string, groupId: string, userId: string) =>
    apiJson<{ ok: boolean }>(`/api/chats/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      token,
    }),
  patchGroupMember: (token: string, groupId: string, userId: string, body: { role?: string; mutedUntil?: string | null }) =>
    apiJson<{ member: unknown }>(`/api/chats/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),
  groupTopics: (token: string, groupId: string) =>
    apiJson<{ topics: Array<{ id: string; name: string; emoji: string; archived: boolean; isDefault: boolean }> }>(
      `/api/chats/groups/${encodeURIComponent(groupId)}/topics`,
      { method: "GET", token },
    ),
  createTopic: (token: string, groupId: string, body: { name: string; description?: string | null; emoji?: string }) =>
    apiJson<{ topic: { id: string } }>(`/api/chats/groups/${encodeURIComponent(groupId)}/topics`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  archiveTopic: (token: string, groupId: string, topicId: string) =>
    apiJson<{ topic: unknown }>(`/api/chats/groups/${encodeURIComponent(groupId)}/topics/${encodeURIComponent(topicId)}/archive`, {
      method: "POST",
      token,
      body: JSON.stringify({}),
    }),
  deleteTopic: (token: string, groupId: string, topicId: string) =>
    apiJson<{ ok: boolean }>(`/api/chats/groups/${encodeURIComponent(groupId)}/topics/${encodeURIComponent(topicId)}`, {
      method: "DELETE",
      token,
    }),
  setGroupLocalDisplayName: (token: string, groupId: string, userId: string, localDisplayName: string | null) =>
    apiJson<{ localDisplayNames: Record<string, string> }>(
      `/api/chats/groups/${encodeURIComponent(groupId)}/local-display-names/${encodeURIComponent(userId)}`,
      { method: "PATCH", token, body: JSON.stringify({ localDisplayName }) },
    ),
  groupMessages: (token: string, groupId: string, topicId: string) => {
    const q = new URLSearchParams({ topicId });
    return apiJson<{ messages: ChatApiMessage[] }>(
      `/api/chats/groups/${encodeURIComponent(groupId)}/messages?${q.toString()}`,
      { method: "GET", token },
    );
  },
  sendGroupMessage: (
    token: string,
    groupId: string,
    body: {
      topicId: string;
      text: string;
      attachments?: unknown[];
      poll?: unknown;
      mentionUserIds?: string[];
      replyToMessageId?: string;
    },
  ) =>
    apiJson<{ message: ChatApiMessage }>(`/api/chats/groups/${encodeURIComponent(groupId)}/messages`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
      suppressSuccessSound: true,
    }),
  groupRead: (token: string, groupId: string, body: { topicId: string; at: string }) =>
    apiJson<{ ok: boolean }>(`/api/chats/groups/${encodeURIComponent(groupId)}/read`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
      suppressSuccessSound: true,
    }),
  deleteGroupMessage: (token: string, groupId: string, messageId: string) =>
    apiJson<{ message: ChatApiMessage }>(
      `/api/chats/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}/delete`,
      { method: "POST", token, body: JSON.stringify({}) },
    ),
  reactionGroup: (token: string, groupId: string, messageId: string, emoji: string) =>
    apiJson<{ message: ChatApiMessage }>(
      `/api/chats/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      { method: "POST", token, body: JSON.stringify({ emoji }) },
    ),
  pinGroup: (token: string, groupId: string, messageId: string, pinned: boolean) =>
    apiJson<{ message: ChatApiMessage }>(
      `/api/chats/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}/pin`,
      { method: "POST", token, body: JSON.stringify({ pinned }) },
    ),
  pollVoteGroup: (token: string, groupId: string, messageId: string, optionId: string) =>
    apiJson<{ message: ChatApiMessage }>(
      `/api/chats/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}/poll-vote`,
      { method: "POST", token, body: JSON.stringify({ optionId }) },
    ),
  pollCloseGroup: (token: string, groupId: string, messageId: string) =>
    apiJson<{ message: ChatApiMessage }>(
      `/api/chats/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}/poll-close`,
      { method: "POST", token, body: JSON.stringify({}) },
    ),
  pinnedGroup: (token: string, groupId: string) =>
    apiJson<{ messages: ChatApiMessage[] }>(`/api/chats/groups/${encodeURIComponent(groupId)}/pinned`, { method: "GET", token }),
  joinGroup: (token: string, inviteToken: string, body?: { password?: string }) =>
    apiJson<{ groupId: string }>(`/api/chats/join/${encodeURIComponent(inviteToken)}`, {
      method: "POST",
      token,
      body: JSON.stringify({ password: body?.password ?? "" }),
    }),
  communitiesList: (token: string) =>
    apiJson<{
      communities: Array<{
        id: string;
        name: string;
        description: string | null;
        avatarEmoji: string | null;
        avatarImageUrl: string | null;
        metaType: string;
        linkedGroupCount: number;
        isAdmin: boolean;
      }>;
    }>("/api/chats/communities", { method: "GET", token }),
  createCommunity: (
    token: string,
    body: {
      name: string;
      description?: string | null;
      avatarEmoji?: string | null;
      metaType?: string;
      existingGroupIds?: string[];
      linkedClassId?: string | null;
      linkedSubjectId?: string | null;
      linkedProjectId?: string | null;
    },
  ) =>
    apiJson<{ community: Record<string, unknown>; announcementGroupId: string }>("/api/chats/communities", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  getCommunity: (token: string, communityId: string) =>
    apiJson<{
      community: Record<string, unknown>;
      groups: Array<{ groupId: string; title: string; description: string | null; isAnnouncement: boolean }>;
      canManage: boolean;
    }>(`/api/chats/communities/${encodeURIComponent(communityId)}`, { method: "GET", token }),
  patchCommunity: (token: string, communityId: string, body: Record<string, unknown>) =>
    apiJson<{ community: Record<string, unknown> }>(`/api/chats/communities/${encodeURIComponent(communityId)}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),
  createCommunityInviteLink: (token: string, communityId: string, body: Record<string, unknown>) =>
    apiJson<{ link: Record<string, unknown> }>(
      `/api/chats/communities/${encodeURIComponent(communityId)}/invite-links`,
      { method: "POST", token, body: JSON.stringify(body) },
    ),
  joinCommunity: (token: string, inviteToken: string, body?: { password?: string }) =>
    apiJson<{ communityId: string }>(`/api/chats/communities/join/${encodeURIComponent(inviteToken)}`, {
      method: "POST",
      token,
      body: JSON.stringify(body ?? {}),
    }),
  broadcastCommunity: (
    token: string,
    communityId: string,
    body: { text: string; groupIds: string[]; sender?: "user" | "bot" },
  ) =>
    apiJson<{ ok: boolean; sentToGroupIds: string[] }>(
      `/api/chats/communities/${encodeURIComponent(communityId)}/broadcast`,
      { method: "POST", token, body: JSON.stringify(body) },
    ),
};

export const api = {
  register: (
    body:
      | {
          lastName: string;
          firstName: string;
          patronymic: string;
          username: string;
          password: string;
          primaryRole: "student";
          grade: number;
          group: number;
        }
      | {
          lastName: string;
          firstName: string;
          patronymic: string;
          username: string;
          password: string;
          primaryRole: "teacher";
        }
      | {
          lastName: string;
          firstName: string;
          patronymic: string;
          username: string;
          password: string;
          primaryRole: "parent";
        },
  ) =>
    apiJson<{ accessToken: string; user: User }>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),

  login: (body: { username: string; password: string }) =>
    apiJson<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  me: (token: string) =>
    apiJson<{ user: User }>("/api/auth/me", {
      method: "GET",
      token,
    }),

  patchProfile: (token: string, body: Record<string, unknown>) =>
    apiJson<{ user: User }>("/api/auth/profile", { method: "PATCH", token, body: JSON.stringify(body) }),

  uploadProfileAvatar: (token: string, file: Blob, filename = "avatar.jpg") => {
    const form = new FormData();
    form.append("avatar", file, filename);
    return apiForm<{ user: User }>("/api/auth/profile/avatar", { method: "POST", token, form });
  },

  changePassword: (token: string, body: { currentPassword: string; newPassword: string }) =>
    apiJson<{ ok: boolean; user: User }>("/api/auth/change-password", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  office: () => apiJson<{ office: OfficeConfig }>("/api/config/office", { method: "GET" }),

  // Admin users
  adminUsers: {
    list: (token: string) => apiJson<{ users: User[] }>("/api/admin/users", { method: "GET", token }),
    details: (token: string, id: string) =>
      apiJson<{
        user: User;
        teachingAssignments: Array<{
          disciplineCode: string;
          disciplineName?: string;
          grade: number;
          groupNumber?: number | null;
          classLabel?: string;
          part: "whole_class" | "group1" | "group2";
        }>;
        teachingClassCards?: Array<{ classLabel: string; disciplineCodes: string[]; disciplineNames: string[] }>;
        childrenUserIds: string[];
      }>(`/api/admin/users/${encodeURIComponent(id)}/details`, { method: "GET", token }),
    create: (
      token: string,
      body:
        | {
            lastName: string;
            firstName: string;
            patronymic: string;
            username: string;
            password: string;
            primaryRole: "student";
            grade: number;
            group: number;
          }
        | {
            lastName: string;
            firstName: string;
            patronymic: string;
            username: string;
            password: string;
            primaryRole: "teacher";
            teachingAssignments: {
              disciplineCode: string;
              grade: number;
              part: "whole_class" | "group1" | "group2";
            }[];
          }
        | {
            lastName: string;
            firstName: string;
            patronymic: string;
            username: string;
            password: string;
            primaryRole: Exclude<User["primaryRole"], "student" | "teacher">;
          },
    ) =>
      apiJson<{ user: User }>("/api/admin/users", {
        method: "POST",
        token,
        body: JSON.stringify(body),
      }),
    updateRoles: (
      token: string,
      id: string,
      body: { primaryRole: User["primaryRole"]; secondaryRoles: User["secondaryRoles"] },
    ) =>
      apiJson<{ user: User }>(`/api/admin/users/${encodeURIComponent(id)}/roles`, {
        method: "PATCH",
        token,
        body: JSON.stringify(body),
      }),
    update: (
      token: string,
      id: string,
      body: {
        lastName?: string;
        firstName?: string;
        patronymic?: string;
        username?: string;
        password?: string;
        primaryRole?: User["primaryRole"];
        secondaryRoles?: User["secondaryRoles"];
        teachingAssignments?: Array<{ disciplineCode: string; grade: number; part: "whole_class" | "group1" | "group2" }>;
        childrenUserIds?: string[];
        homeroomGrade?: number | null;
        homeroomGroupNumber?: number | null;
        pedagogicalExperienceYears?: number | null;
        teacherQualificationCategory?: "highest" | "first" | "second" | "none" | null;
      },
    ) =>
      apiJson<{ user: User }>(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(body),
      }),
    delete: (token: string, id: string, confirmPhrase: string) =>
      apiJson<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: "DELETE",
        token,
        body: JSON.stringify({ confirmPhrase }),
      }),
    unlinkChild: (token: string, parentUserId: string, studentUserId: string) =>
      apiJson<{ ok: boolean }>(
        `/api/admin/parents/${encodeURIComponent(parentUserId)}/children/${encodeURIComponent(studentUserId)}`,
        { method: "DELETE", token },
      ),
    clearDatabase: (token: string, body: { confirmPhrase: string }) =>
      apiJson<{ ok: boolean; message: string }>("/api/admin/clear-database", {
        method: "POST",
        token,
        body: JSON.stringify(body),
      }),
  },

  // Candidates (public application is handled separately in UI)
  candidates: {
    list: (token: string) => apiJson<{ candidates: CandidateListItem[] }>("/api/candidates", { method: "GET", token }),
    create: (token: string) => apiJson<{ candidateId: string }>("/api/candidates", { method: "POST", token, body: JSON.stringify({}) as any }),
    delete: (token: string, candidateId: string) =>
      apiJson<{ ok: boolean }>(`/api/candidates/${encodeURIComponent(candidateId)}`, {
        method: "DELETE",
        token,
      }),
    details: (
      token: string,
      candidateId: string,
    ) =>
      apiJson<{
        candidateId: string;
        status: "invited" | "submitted";
        application: CandidateApplication | null;
        analytics: CandidateAnalytics | null;
        files: CandidateFile[];
      }>(`/api/candidates/${encodeURIComponent(candidateId)}/details`, { method: "GET", token }),
    calculateAnalytics: (token: string, candidateId: string) =>
      apiJson<any>(`/api/candidates/${encodeURIComponent(candidateId)}/calculate-analytics`, {
        method: "POST",
        token,
        body: JSON.stringify({}),
      }),
    updateAnalytics: (
      token: string,
      candidateId: string,
      body: {
        hiringStage?: string;
        desiredRoleOverride?: "teacher" | null;
        interviewScoreDiscipline0to5?: number | null;
        interviewScoreParents0to5?: number | null;
        demoLessonScore0to5?: number | null;
        artifactScore0to5?: number | null;
        artifactNotes?: string;
      },
    ) =>
      apiJson<any>(`/api/candidates/${encodeURIComponent(candidateId)}/analytics`, {
        method: "PATCH",
        token,
        body: JSON.stringify(body),
      }),
    hire: (token: string, candidateId: string) =>
      apiJson<any>(`/api/candidates/${encodeURIComponent(candidateId)}/hire`, {
        method: "POST",
        token,
        body: JSON.stringify({}),
      }),
  },

  // Teacher loads
  myTeacherPanels: (token: string) =>
    apiJson<{ panels: Array<{ grade: number; disciplineCode: string; disciplineName: string }> }>(
      "/api/teacher-loads/me",
      { method: "GET", token },
    ),
  teacherLoadOptions: (token: string, grade: number) =>
    apiJson<{ disciplines: Array<{ code: string; name: string; grade: number }> }>(
      `/api/teacher-loads/options?grade=${encodeURIComponent(String(grade))}`,
      { method: "GET", token },
    ),

  // School
  schoolClasses: (token: string) =>
    apiJson<{ classes: Array<{ id: string; grade: number; groups: Array<{ id: string; grade: number; groupNumber: number }> }> }>(
      "/api/school/classes",
      { method: "GET", token },
    ),
  schoolClassGroups: (token: string, grade: number) =>
    apiJson<{ groups: Array<{ id: string; grade: number; groupNumber: number }> }>(`/api/school/classes/${grade}/groups`, {
      method: "GET",
      token,
    }),
  schoolTeachers: (token: string) =>
    apiJson<{ teachers: Array<{ id: string; fio: string; primaryRole: string; secondaryRoles: string[] }> }>(
      "/api/school/teachers",
      { method: "GET", token },
    ),

  // Journal
  journalTable: (
    token: string,
    args: { from: string; to: string; grade: number; disciplineCode: string },
  ) => {
    const q = new URLSearchParams({
      from: args.from,
      to: args.to,
      grade: String(args.grade),
      disciplineCode: args.disciplineCode,
    });
    return apiJson<any>(`/api/journal/table?${q.toString()}`, { method: "GET", token });
  },
  upsertJournalMark: (
    token: string,
    body: { timetableLessonId: string; studentUserId: string; mark?: number | null; absent?: boolean },
  ) => apiJson<any>("/api/journal/marks", { method: "PUT", token, body: JSON.stringify(body) }),
  upsertJournalLessonMeta: (
    token: string,
    body: { timetableLessonId: string; topic?: string; attachedDocumentIds?: string[]; journalLessonTypeId?: string | null },
  ) => apiJson<any>("/api/journal/lesson-meta", { method: "PUT", token, body: JSON.stringify(body) }),
  journalUploadLessonDocument: (
    token: string,
    args: { file: File; timetableLessonId: string; journalDocumentTypeId: string; disciplineCode?: string },
  ) => {
    const form = new FormData();
    form.append("file", args.file);
    form.append("timetableLessonId", args.timetableLessonId);
    form.append("journalDocumentTypeId", args.journalDocumentTypeId);
    if (args.disciplineCode) form.append("disciplineEntityId", args.disciplineCode);
    return apiForm<{ documentId: string; meta: unknown }>("/api/journal/lesson-documents", { method: "POST", token, form });
  },
  journalDetachLessonDocument: (token: string, documentId: string, timetableLessonId: string) =>
    apiJson<{ ok: boolean }>(
      `/api/journal/lesson-documents/${encodeURIComponent(documentId)}?${new URLSearchParams({ timetableLessonId }).toString()}`,
      { method: "DELETE", token },
    ),

  // Timetable
  timetableConfig: (token: string) =>
    apiJson<{ config: any }>("/api/timetable/config", { method: "GET", token }),
  updateTimetableConfig: (
    token: string,
    body: {
      defaultLessonMinutes?: number;
      dayStartTime?: string;
      workdayStartTime?: string;
      workdayEndTime?: string;
      lunchTime?: string;
      lessonTimesBySlotIndex?: Record<string, { startTime: string; endTime: string }>;
    },
  ) =>
    apiJson<{ config: any }>("/api/timetable/config", { method: "PATCH", token, body: JSON.stringify(body) }),
  timetableSlots: (token: string) =>
    apiJson<{ slots: any[]; byDay: Record<string, any[]>; computedByDay: Record<string, any[]> }>("/api/timetable/slots", {
      method: "GET",
      token,
    }),
  updateTimetableSlot: (
    token: string,
    id: string,
    body: {
      weekStart?: string | null;
      kind?: "lesson" | "service";
      serviceType?: string | null;
      serviceDescription?: string | null;
      blockLabel?: string | null;
      blockColorIndex?: number | null;
    },
  ) =>
    apiJson<{ slot: any }>(`/api/timetable/slots/${encodeURIComponent(id)}`, {
      method: "PUT",
      token,
      body: JSON.stringify(body),
    }),
  createTimetableSlot: (token: string, body: { dayOfWeek: number; weekStart?: string | null }) =>
    apiJson<{ slot: any }>("/api/timetable/slots", { method: "POST", token, body: JSON.stringify(body) }),
  deleteTimetableSlot: (token: string, id: string, weekStart?: string | null) =>
    apiJson<{ slot: any }>(
      `/api/timetable/slots/${encodeURIComponent(id)}${weekStart ? `?weekStart=${encodeURIComponent(weekStart)}` : ""}`,
      { method: "DELETE", token },
    ),
  resetTimetableSlotRows: (token: string, args: { weekStart: string; slotPatternIds: string[] }) =>
    apiJson<{ ok: true }>(`/api/timetable/slot-rows/reset`, {
      method: "POST",
      token,
      body: JSON.stringify({ weekStart: args.weekStart, slotPatternIds: args.slotPatternIds }),
    }),
  deleteTimetableSlotRows: (token: string, args: { weekStart: string; slotPatternIds: string[] }) =>
    apiJson<{ ok: true }>(`/api/timetable/slot-rows/delete`, {
      method: "POST",
      token,
      body: JSON.stringify({ weekStart: args.weekStart, slotPatternIds: args.slotPatternIds }),
    }),
  mergeTimetableSlot: (token: string, id: string, weekStart?: string | null) =>
    apiJson<{ slot: any }>(`/api/timetable/slots/${encodeURIComponent(id)}/merge`, {
      method: "PUT",
      token,
      body: JSON.stringify({ weekStart: weekStart ?? null }),
    }),
  mergeTimetableSlotRange: (token: string, id: string, args: { weekStart?: string | null; endSlotIndex: number }) =>
    apiJson<{ slot: any }>(`/api/timetable/slots/${encodeURIComponent(id)}/merge-range`, {
      method: "PUT",
      token,
      body: JSON.stringify({ weekStart: args.weekStart ?? null, endSlotIndex: args.endSlotIndex }),
    }),
  splitTimetableSlot: (token: string, id: string, weekStart?: string | null) =>
    apiJson<{ slots: any[] }>(`/api/timetable/slots/${encodeURIComponent(id)}/split`, {
      method: "PUT",
      token,
      body: JSON.stringify({ weekStart: weekStart ?? null }),
    }),
  timetableLessonOptions: (
    token: string,
    args: { grade: number; groupNumber?: number | null; teacherUserId?: string | null },
  ) => {
    const q = new URLSearchParams({ grade: String(args.grade) });
    if (args.groupNumber != null) q.set("groupNumber", String(args.groupNumber));
    if (args.teacherUserId) q.set("teacherUserId", args.teacherUserId);
    return apiJson<{ options: any[] }>(`/api/timetable/lesson-options?${q.toString()}`, { method: "GET", token });
  },
  timetableDayView: (token: string, args: { date: string; grades: number[] }) =>
    apiJson<any>(`/api/timetable/day-view?date=${encodeURIComponent(args.date)}&grades=${encodeURIComponent(args.grades.join(","))}`, {
      method: "GET",
      token,
    }),
  timetableWeekView: (token: string, args: { weekStart: string; grades: number[] }) =>
    apiJson<any>(
      `/api/timetable/week-view?weekStart=${encodeURIComponent(args.weekStart)}&grades=${encodeURIComponent(args.grades.join(","))}`,
      { method: "GET", token },
    ),
  createTimetableLesson: (
    token: string,
    body: {
      date: string;
      slotIndex: number;
      grade: number;
      groupNumber?: number | null;
      disciplineCode: string;
      teacherUserId: string;
      teacherLoadId?: string | null;
    },
  ) => apiJson<{ lesson: any }>("/api/timetable/lessons", { method: "POST", token, body: JSON.stringify(body) }),
  updateTimetableLesson: (
    token: string,
    id: string,
    body: { disciplineCode?: string; teacherUserId?: string; teacherLoadId?: string | null },
  ) => apiJson<{ lesson: any }>(`/api/timetable/lessons/${encodeURIComponent(id)}`, { method: "PATCH", token, body: JSON.stringify(body) }),
  deleteTimetableLesson: (token: string, id: string) =>
    apiJson<{ ok: true }>(`/api/timetable/lessons/${encodeURIComponent(id)}`, { method: "DELETE", token }),
  copyTimetableWeek: (token: string, targetWeekStart: string) =>
    apiJson<any>("/api/timetable/copy-week", {
      method: "POST",
      token,
      body: JSON.stringify({ targetWeekStart }),
    }),
  clearTimetableWeek: (token: string, args: { weekStart: string; grades?: number[] }) =>
    apiJson<{ ok: true }>("/api/timetable/week/clear", {
      method: "POST",
      token,
      body: JSON.stringify(args),
    }),
  duplicateTimetablePreviousWeek: (token: string, args: { targetWeekStart: string; grades?: number[] }) =>
    apiJson<any>("/api/timetable/week/duplicate-previous", {
      method: "POST",
      token,
      body: JSON.stringify(args),
    }),
  timetableTeacherColors: (token: string) =>
    apiJson<{ colors: Record<string, number> }>("/api/timetable/teacher-colors", { method: "GET", token }),
  updateTimetableTeacherColors: (token: string, colors: Record<string, number>) =>
    apiJson<{ colors: Record<string, number> }>("/api/timetable/teacher-colors", {
      method: "PATCH",
      token,
      body: JSON.stringify({ colors }),
    }),
  createTimetableVisualBlock: (
    token: string,
    body: {
      weekStart: string;
      dayOfWeek: number;
      grade: number;
      /** Если не задан — одна колонка (равно `grade`). */
      gradeEnd?: number;
      slotIndexStart: number;
      slotIndexEnd: number;
      label: string;
      colorIndex: number;
      kind: "service" | "blocked";
      serviceType?: string;
      serviceDescription?: string | null;
    },
  ) =>
    apiJson<{ block: any }>("/api/timetable/visual-blocks", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  updateTimetableVisualBlock: (
    token: string,
    id: string,
    body: {
      label?: string;
      colorIndex?: number;
      kind?: "service" | "blocked";
      serviceType?: string;
      serviceDescription?: string | null;
    },
  ) =>
    apiJson<{ block: any }>(`/api/timetable/visual-blocks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),
  deleteTimetableVisualBlock: (token: string, id: string) =>
    apiJson<{ ok: true }>(`/api/timetable/visual-blocks/${encodeURIComponent(id)}`, { method: "DELETE", token }),
  effectiveLessons: (
    token: string,
    args: { from: string; to: string; grade?: number; disciplineCode?: string; teacherUserId?: string; groupNumber?: number },
  ) => {
    const q = new URLSearchParams({ from: args.from, to: args.to });
    if (args.grade != null) q.set("grade", String(args.grade));
    if (args.disciplineCode) q.set("disciplineCode", args.disciplineCode);
    if (args.teacherUserId) q.set("teacherUserId", args.teacherUserId);
    if (args.groupNumber != null) q.set("groupNumber", String(args.groupNumber));
    return apiJson<{ lessons: any[] }>(`/api/timetable/effective-lessons?${q.toString()}`, { method: "GET", token });
  },

  // Calendar
  calendarMonth: (token: string, month: string) =>
    apiJson<any>(`/api/calendar/month?month=${encodeURIComponent(month)}`, { method: "GET", token }),
  calendarEvents: (token: string, args: { date?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (args.date) q.set("date", args.date);
    if (args.from) q.set("from", args.from);
    if (args.to) q.set("to", args.to);
    return apiJson<any>(`/api/calendar/events?${q.toString()}`, { method: "GET", token });
  },
  createCalendarEvent: (
    token: string,
    body: {
      title: string;
      date: string;
      description?: string;
      startTime?: string | null;
      endTime?: string | null;
      grades: number[];
      groups: Array<{ grade: number; groupNumber: number }>;
      kind?: "general" | "service";
      serviceType?: "lunch" | "walk" | "self_study" | "other" | null;
      status?: "planned" | "held" | "cancelled";
    },
  ) =>
    apiJson<any>("/api/calendar/events", { method: "POST", token, body: JSON.stringify(body) }),
  updateCalendarEvent: (token: string, id: string, body: any) =>
    apiJson<any>(`/api/calendar/events/${encodeURIComponent(id)}`, { method: "PATCH", token, body: JSON.stringify(body) }),
  deleteCalendarEvent: (token: string, id: string) =>
    apiJson<any>(`/api/calendar/events/${encodeURIComponent(id)}`, { method: "DELETE", token }),

  // Analytics
  analyticsOverview: (
    token: string,
    args: { from: string; to: string; minAverage?: number; minAttendancePercent?: number },
  ) => {
    const q = new URLSearchParams({ from: args.from, to: args.to });
    if (args.minAverage != null) q.set("minAverage", String(args.minAverage));
    if (args.minAttendancePercent != null) q.set("minAttendancePercent", String(args.minAttendancePercent));
    return apiJson<any>(`/api/analytics/overview?${q.toString()}`, { method: "GET", token });
  },
  analyticsTeacher: (token: string, args: { from: string; to: string }) => {
    const q = new URLSearchParams({ from: args.from, to: args.to });
    return apiJson<any>(`/api/analytics/teacher?${q.toString()}`, { method: "GET", token });
  },
  analyticsHiring: (token: string, args: { from: string; to: string; subject?: string; level?: string }) => {
    const q = new URLSearchParams({ from: args.from, to: args.to });
    if (args.subject) q.set("subject", args.subject);
    if (args.level) q.set("level", args.level);
    return apiJson<any>(`/api/analytics/hiring?${q.toString()}`, { method: "GET", token });
  },

  financeParentOverview: (token: string) =>
    apiJson<{
      ok: boolean;
      summary: { totalPaidRub: number; totalDueRub: number; currency: string };
      byChild: Array<{ childLabel: string; paidRub: number; dueRub: number }>;
      byService: Array<{ serviceName: string; amountRub: number }>;
      recentPayments: Array<{ at: string; title: string; amountRub: number }>;
      note: string;
    }>("/api/finance/parent/overview", { method: "GET", token }),

  financeStudentOverview: (token: string) =>
    apiJson<{
      ok: boolean;
      schoolAccount: { balanceRub: number; currency: string; accountLabel: string };
      recent: Array<{ at: string; title: string; deltaRub: number }>;
      note: string;
    }>("/api/finance/student/overview", { method: "GET", token }),

  analyticsQuality: (token: string) => apiJson<any>("/api/analytics/quality", { method: "GET", token }),
  analyticsCadreProfile: (token: string, args: { from?: string; to?: string; subject?: string; level?: string }) => {
    const q = new URLSearchParams();
    if (args.from) q.set("from", args.from);
    if (args.to) q.set("to", args.to);
    if (args.subject) q.set("subject", args.subject);
    if (args.level) q.set("level", args.level);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return apiJson<any>(`/api/analytics/cadre-profile${suffix}`, { method: "GET", token });
  },
  analyticsProjects: (token: string, args: { from: string; to: string; teacherUserId?: string }) => {
    const q = new URLSearchParams({ from: args.from, to: args.to });
    if (args.teacherUserId) q.set("teacherUserId", args.teacherUserId);
    return apiJson<any>(`/api/analytics/projects?${q.toString()}`, { method: "GET", token });
  },
  analyticsTeacherProfile: (token: string, args: { teacherUserId: string; from: string; to: string }) => {
    const q = new URLSearchParams({ from: args.from, to: args.to });
    return apiJson<any>(`/api/analytics/teacher-profile/${encodeURIComponent(args.teacherUserId)}?${q.toString()}`, {
      method: "GET",
      token,
    });
  },
  analyticsTeacherCadreAttributes: (token: string, teacherUserId: string) =>
    apiJson<any>(`/api/analytics/teacher-cadre-attributes/${encodeURIComponent(teacherUserId)}`, { method: "GET", token }),
  analyticsTeacherAttachCandidate: (token: string, teacherUserId: string, args: { candidateId: string }) =>
    apiJson<any>(`/api/analytics/teacher-profile/${encodeURIComponent(teacherUserId)}/attach-candidate`, {
      method: "POST",
      token,
      body: JSON.stringify({ candidateId: args.candidateId }),
    }),
  analyticsTeacherSetManualBranch: (
    token: string,
    teacherUserId: string,
    args: {
      branchCode: string;
      branchTitle: string;
      startCategory: "highest" | "first" | "none";
      recommendedRateMin: number | null;
      recommendedRateMax: number | null;
    },
  ) =>
    apiJson<any>(`/api/analytics/teacher-profile/${encodeURIComponent(teacherUserId)}/set-manual-branch`, {
      method: "POST",
      token,
      body: JSON.stringify({
        branchCode: args.branchCode,
        branchTitle: args.branchTitle,
        startCategory: args.startCategory,
        recommendedRateMin: args.recommendedRateMin,
        recommendedRateMax: args.recommendedRateMax,
      }),
    }),
  analyticsTeacherQualityUpdate: (
    token: string,
    teacherUserId: string,
    body: {
      interviewDiscipline0to5?: number;
      interviewParents0to5?: number;
      lessonObservation?: { date: string; score0to5: number; comment?: string };
      diagnostic?: { date: string; successPercent: number; comment?: string };
    },
  ) =>
    apiJson<any>(`/api/analytics/teacher-profile/${encodeURIComponent(teacherUserId)}/quality`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  analyticsRevisionClasses: (token: string) =>
    apiJson<{
      classes: Array<{
        grade: number;
        label: string;
        rows: Array<{
          disciplineCode: string;
          disciplineName: string;
          teacherUserId: string;
          teacherFio: string;
          key: string;
        }>;
      }>;
    }>("/api/analytics/revision/classes", { method: "GET", token }),
  analyticsRevisionJournalDocTypes: (token: string) =>
    apiJson<{ types: Array<{ id: string; name: string; description: string }> }>(
      "/api/analytics/revision/journal-document-types",
      { method: "GET", token },
    ),
  analyticsRevisionDocumentation: (
    token: string,
    body: {
      grades: number[];
      excludedKeys: string[];
      journalDocumentTypeIds: string[];
      scheduledAt: string;
      lessonDateFrom?: string;
      lessonDateTo?: string;
    },
  ) =>
    apiJson<{ job: unknown }>("/api/analytics/revision/documentation", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  analyticsRevisionJournal: (
    token: string,
    body: {
      grades: number[];
      excludedKeys: string[];
      scheduledAt: string;
      lessonDateFrom?: string;
      lessonDateTo?: string;
      checks: {
        lessons: boolean;
        topics: boolean;
        marks: boolean;
      };
    },
  ) =>
    apiJson<{ job: unknown }>("/api/analytics/revision/journal", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  // Diary
  diaryPanels: (token: string) =>
    apiJson<{ panels: Array<{ studentUserId: string; fio: string; grade: number; groupNumber: number }> }>(
      "/api/diary/panels",
      { method: "GET", token },
    ),
  diaryView: (token: string, args: { from: string; to: string; studentUserId?: string }) => {
    const q = new URLSearchParams({ from: args.from, to: args.to });
    if (args.studentUserId) q.set("studentUserId", args.studentUserId);
    return apiJson<{
      from: string;
      to: string;
      student: { userId: string; fio: string; grade: number; groupNumber: number };
      lessons: Array<{
        timetableLessonId: string;
        date: string;
        slotIndex: number;
        disciplineCode: string;
        disciplineName: string;
        mark: number | null;
        absent: boolean;
      }>;
      daySlots?: Array<{
        slotIndex: number;
        slotIndexEnd: number;
        timetableLessonId: string | null;
        disciplineCode: string | null;
        disciplineName: string | null;
        mark: number | null;
        absent: boolean;
      }>;
    }>(`/api/diary/view?${q.toString()}`, { method: "GET", token });
  },
  diaryFinalGrades: (token: string, args: { from: string; to: string; studentUserId?: string }) => {
    const q = new URLSearchParams({ from: args.from, to: args.to });
    if (args.studentUserId) q.set("studentUserId", args.studentUserId);
    return apiJson<{
      from: string;
      to: string;
      studentUserId: string;
      subjects: Array<{
        disciplineCode: string;
        disciplineName: string;
        average: number | null;
        finalMark: number | null;
      }>;
    }>(`/api/diary/final-grades?${q.toString()}`, { method: "GET", token });
  },

  // Documents
  documentsList: (
    token: string,
    args?: {
      disciplineCode?: string;
      grade?: number;
      officeSection?: string;
      roles?: string[];
      periods?: string[];
      iomTeacherUserId?: string;
    },
  ) => {
    const q = new URLSearchParams();
    if (args?.disciplineCode) q.set("disciplineCode", args.disciplineCode);
    if (args?.officeSection) q.set("officeSection", args.officeSection);
    if (args?.grade != null) q.set("grade", String(args.grade));
    if (args?.roles?.length) q.set("roles", args.roles.join(","));
    if (args?.periods?.length) q.set("periods", args.periods.join(","));
    if (args?.iomTeacherUserId) q.set("iomTeacherUserId", args.iomTeacherUserId);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return apiJson<{ documents: any[] }>(`/api/documents${suffix}`, { method: "GET", token });
  },
  uploadDocument: (
    token: string,
    args: {
      file: File;
      tags?: any;
      folder?: any;
      sectionId?: string | null;
      folderId?: string | null;
      disciplineCode?: string;
      isStandardizing?: boolean;
    },
  ) => {
    const form = new FormData();
    form.append("file", args.file);
    if (args.tags) form.append("tags", JSON.stringify(args.tags));
    if (args.folder) form.append("folder", JSON.stringify(args.folder));
    if (args.sectionId) form.append("sectionId", args.sectionId);
    if (args.folderId) form.append("folderId", args.folderId);
    if (args.disciplineCode) form.append("disciplineCode", args.disciplineCode);
    if (args.isStandardizing != null) form.append("isStandardizing", args.isStandardizing ? "true" : "false");
    return apiForm<{ document: any; url: string }>("/api/documents/upload", { method: "POST", token, form });
  },
  deleteDocument: (token: string, id: string) =>
    apiJson<{ ok: true }>(`/api/documents/${encodeURIComponent(id)}`, { method: "DELETE", token }),
  patchDocument: (
    token: string,
    id: string,
    body: {
      tags?: any;
      folder?: any;
      sectionId?: string | null;
      folderId?: string | null;
      originalName?: string;
      inTrash?: boolean;
    },
  ) =>
    apiJson<{ document: any }>(`/api/documents/${encodeURIComponent(id)}`, { method: "PATCH", token, body: JSON.stringify(body) }),
  restoreDocument: (token: string, id: string) =>
    apiJson<{ document: any }>(`/api/documents/${encodeURIComponent(id)}/restore`, { method: "POST", token }),
  copyDocument: (token: string, id: string, body?: { targetFolderId?: string | null }) =>
    apiJson<{ document: any }>(`/api/documents/${encodeURIComponent(id)}/copy`, {
      method: "POST",
      token,
      body: JSON.stringify(body ?? {}),
    }),
  documentVersions: {
    list: (token: string, id: string) =>
      apiJson<{ versions: any[] }>(`/api/documents/${encodeURIComponent(id)}/versions`, { method: "GET", token }),
    upload: (token: string, id: string, args: { file: File; comment?: string }) => {
      const form = new FormData();
      form.append("file", args.file);
      if (args.comment != null && args.comment.trim()) form.append("comment", args.comment.trim());
      return apiForm<{ document: any; version: any }>(`/api/documents/${encodeURIComponent(id)}/versions`, {
        method: "POST",
        token,
        form,
      });
    },
    makeCurrent: (token: string, id: string, versionId: string) =>
      apiJson<{ ok: true; document?: any }>(`/api/documents/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/make-current`, {
        method: "POST",
        token,
      }),
  },
  documentComments: {
    list: (token: string, id: string) => apiJson<{ comments: any[] }>(`/api/documents/${encodeURIComponent(id)}/comments`, { method: "GET", token }),
    add: (token: string, id: string, body: string) =>
      apiJson<{ comment: any }>(`/api/documents/${encodeURIComponent(id)}/comments`, {
        method: "POST",
        token,
        body: JSON.stringify({ body }),
      }),
  },
  documentBindings: {
    list: (token: string, id: string) =>
      apiJson<{ bindings: any[] }>(`/api/documents/${encodeURIComponent(id)}/bindings`, { method: "GET", token }),
    add: (token: string, id: string, binding: { type: string; refId: string }) =>
      apiJson<{ binding: any }>(`/api/documents/${encodeURIComponent(id)}/bindings`, {
        method: "POST",
        token,
        body: JSON.stringify({ binding }),
      }),
  },
  documentsTrash: (token: string) => apiJson<{ documents: any[] }>("/api/documents/trash", { method: "GET", token }),
  documentsUploadRoutes: {
    get: (token: string, args?: { role?: string | null; userId?: string | null }) => {
      const q = new URLSearchParams();
      if (args?.role) q.set("role", args.role);
      if (args?.userId) q.set("userId", args.userId);
      const suffix = q.toString() ? `?${q.toString()}` : "";
      return apiJson<{
        baseRoutes: any[];
        userRoutes: Array<{ ownerUserId: string; role: string | null; userId: string | null; routes: any[] }>;
        effectiveRoutes: any[];
        canEditBase: boolean;
        isAdminLike: boolean;
      }>(`/api/documents/upload-routes${suffix}`, { method: "GET", token });
    },
    put: (
      token: string,
      body: { scope: "base" | "user"; role?: string | null; userId?: string | null; routes: any[] },
    ) =>
      apiJson<{ ok: boolean }>("/api/documents/upload-routes", {
        method: "PUT",
        token,
        body: JSON.stringify(body),
      }),
    clear: (token: string, args?: { role?: string | null; userId?: string | null }) => {
      const q = new URLSearchParams();
      if (args?.role) q.set("role", args.role);
      if (args?.userId) q.set("userId", args.userId);
      const suffix = q.toString() ? `?${q.toString()}` : "";
      return apiJson<{ ok: boolean }>(`/api/documents/upload-routes/clear${suffix}`, { method: "DELETE", token });
    },
  },
  documentsTree: (token: string) =>
    apiJson<{ sections: any[]; folders: any[]; documents: any[] }>("/api/documents/tree", { method: "GET", token }),
  createDocumentSection: (token: string, name: string) =>
    apiJson<{ section: any }>("/api/documents/sections", { method: "POST", token, body: JSON.stringify({ name }) }),
  patchDocumentSection: (
    token: string,
    sectionId: string,
    body: { name?: string; hasPassword?: boolean; password?: string },
  ) =>
    apiJson<{ section: any }>(`/api/documents/sections/${encodeURIComponent(sectionId)}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),
  unlockDocumentSection: (token: string, sectionId: string, password: string) =>
    apiJson<{ ok: boolean }>(`/api/documents/sections/${encodeURIComponent(sectionId)}/unlock`, {
      method: "POST",
      token,
      body: JSON.stringify({ password }),
    }),
  deleteDocumentSection: (token: string, sectionId: string) =>
    apiJson<{ ok: true }>(`/api/documents/sections/${encodeURIComponent(sectionId)}`, { method: "DELETE", token }),
  createDocumentFolder: (token: string, body: { name: string; sectionId?: string | null; parentFolderId?: string | null }) =>
    apiJson<{ folder: any }>("/api/documents/folders", { method: "POST", token, body: JSON.stringify(body) }),
  patchDocumentFolder: (
    token: string,
    folderId: string,
    body: {
      name?: string;
      sectionId?: string | null;
      parentFolderId?: string | null;
      shared?: boolean;
      sharedWithUserIds?: string[];
      sharedWithRoleIds?: string[];
      accessType?: "private" | "org" | "selected";
      hasPassword?: boolean;
      password?: string;
    },
  ) =>
    apiJson<{ folder: any }>(`/api/documents/folders/${encodeURIComponent(folderId)}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),
  deleteDocumentFolder: (token: string, folderId: string) =>
    apiJson<{ ok: true }>(`/api/documents/folders/${encodeURIComponent(folderId)}`, { method: "DELETE", token }),
  unlockDocumentFolder: (token: string, folderId: string, password: string) =>
    apiJson<{ ok: boolean }>(`/api/documents/folders/${encodeURIComponent(folderId)}/unlock`, {
      method: "POST",
      token,
      body: JSON.stringify({ password }),
    }),
  mergeFoldersToSection: (token: string, body: { folderIds: string[]; name: string }) =>
    apiJson<{ section: any; folderIds: string[] }>("/api/documents/merge-folders-to-section", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  moveDocumentsToFolder: (token: string, body: { documentIds: string[]; targetFolderId: string }) =>
    apiJson<{ documents: any[] }>("/api/documents/move-documents", { method: "POST", token, body: JSON.stringify(body) }),
  linkDocumentToDiscipline: (token: string, id: string, disciplineCode: string) =>
    apiJson<any>(`/api/documents/${encodeURIComponent(id)}/link`, {
      method: "POST",
      token,
      body: JSON.stringify({ disciplineCode }),
    }),

  // Chats
  chats: chatsApi,
  chatsUsers: (token: string, q?: string) => chatsApi.users(token, q),
  chatsMessages: (token: string, args: { userId: string }) => chatsApi.messages(token, args),
  sendChatMessage: (token: string, body: { toUserId: string; text: string }) => chatsApi.sendMessage(token, body),

  // Methospace
  methospaceDisciplinesList: (token: string) =>
    apiJson<{ disciplines: Array<{ code: string; name: string; grade: number }> }>("/api/methospace/disciplines", { method: "GET", token }),
  methospaceDisciplineSummary: (token: string, mine?: boolean) =>
    apiJson<{ items: any[] }>(`/api/methospace/disciplines/summary${mine ? "?mine=1" : ""}`, { method: "GET", token }),
  methospaceDisciplineByBase: (token: string, baseCode: string) =>
    apiJson<any>(`/api/methospace/disciplines/by-base/${encodeURIComponent(baseCode)}`, { method: "GET", token }),
  createDiscipline: (
    token: string,
    body: {
      name: string;
      grades: number[];
      baseCode?: string;
      documents?: Array<{ id: string; name: string; url: string }>;
      gradeRanges?: any;
    },
  ) => apiJson<any>("/api/methospace/disciplines", { method: "POST", token, body: JSON.stringify(body) }),
  updateDiscipline: (token: string, code: string, body: any) =>
    apiJson<any>(`/api/methospace/disciplines/${encodeURIComponent(code)}`, { method: "PATCH", token, body: JSON.stringify(body) }),
  deleteDiscipline: (token: string, code: string) =>
    apiJson<{ ok: true }>(`/api/methospace/disciplines/${encodeURIComponent(code)}`, { method: "DELETE", token }),

  methospaceClasses: (token: string) =>
    apiJson<{ classes: Array<{ grade: number; studentCount: number }> }>("/api/methospace/classes", { method: "GET", token }),
  methospaceClassStudents: (token: string, grade: number) =>
    apiJson<{ students: Array<{ userId: string; fio: string; groupNumber: number }> }>(
      `/api/methospace/classes/${encodeURIComponent(String(grade))}/students`,
      { method: "GET", token },
    ),

  methospaceJournalDocumentTypes: (token: string) =>
    apiJson<{ types: Array<{ id: string; name: string; description: string; requiredForLessonTypeIds?: string[] }> }>("/api/methospace/journal-document-types", {
      method: "GET",
      token,
    }),
  createJournalDocumentType: (token: string, body: { name: string; description?: string; requiredForLessonTypeIds?: string[] }) =>
    apiJson<any>("/api/methospace/journal-document-types", { method: "POST", token, body: JSON.stringify(body) }),
  updateJournalDocumentType: (token: string, id: string, body: { name?: string; description?: string; requiredForLessonTypeIds?: string[] }) =>
    apiJson<any>(`/api/methospace/journal-document-types/${encodeURIComponent(id)}`, { method: "PATCH", token, body: JSON.stringify(body) }),
  deleteJournalDocumentType: (token: string, id: string) =>
    apiJson<{ ok: true }>(`/api/methospace/journal-document-types/${encodeURIComponent(id)}`, { method: "DELETE", token }),

  methospaceJournalLessonTypes: (token: string) =>
    apiJson<{
      types: Array<{
        id: string;
        name: string;
        description: string;
        disciplineCodes: string[];
        standardDocumentId: string | null;
        colorKey: string;
        createdAt: string;
        updatedAt: string;
      }>;
      colorPalette: Array<{ key: string; hex: string }>;
    }>("/api/methospace/journal-lesson-types", { method: "GET", token }),
  createJournalLessonType: (
    token: string,
    body: { name: string; description?: string; disciplineCodes?: string[]; colorKey: string },
  ) => apiJson<any>("/api/methospace/journal-lesson-types", { method: "POST", token, body: JSON.stringify(body) }),
  updateJournalLessonType: (
    token: string,
    id: string,
    body: { name?: string; description?: string; disciplineCodes?: string[]; colorKey?: string; standardDocumentId?: string | null },
  ) => apiJson<any>(`/api/methospace/journal-lesson-types/${encodeURIComponent(id)}`, { method: "PATCH", token, body: JSON.stringify(body) }),
  deleteJournalLessonType: (token: string, id: string) =>
    apiJson<{ ok: true }>(`/api/methospace/journal-lesson-types/${encodeURIComponent(id)}`, { method: "DELETE", token }),
  uploadJournalLessonTypeStandardDocument: (token: string, args: { lessonTypeId: string; disciplineCode: string; file: File }) => {
    const form = new FormData();
    form.append("file", args.file);
    form.append("disciplineCode", args.disciplineCode);
    return apiForm<any>(`/api/methospace/journal-lesson-types/${encodeURIComponent(args.lessonTypeId)}/standard-document`, {
      method: "POST",
      token,
      form,
    });
  },

  methospaceQuarters: (token: string) =>
    apiJson<{ quarters: Array<{ index: 1 | 2 | 3 | 4; startDate: string; endDate: string }>; vacations: Array<{ from: string; to: string }> }>(
      "/api/methospace/quarters",
      { method: "GET", token },
    ),
  updateMethospaceQuarters: (
    token: string,
    quarters: Array<{ index: 1 | 2 | 3 | 4; startDate: string; endDate: string }>,
  ) =>
    apiJson<{ quarters: Array<{ index: 1 | 2 | 3 | 4; startDate: string; endDate: string }>; vacations: Array<{ from: string; to: string }> }>(
      "/api/methospace/quarters",
      { method: "PUT", token, body: JSON.stringify({ quarters }) },
    ),

  methodPacks: (token: string, disciplineCode?: string) => {
    const q = disciplineCode ? `?disciplineCode=${encodeURIComponent(disciplineCode)}` : "";
    return apiJson<{ methodPacks: any[] }>(`/api/methospace/method-packs${q}`, { method: "GET", token });
  },
  createMethodPack: (token: string, body: any) =>
    apiJson<any>("/api/methospace/method-packs", { method: "POST", token, body: JSON.stringify(body) }),
  updateMethodPack: (token: string, id: string, body: any) =>
    apiJson<any>(`/api/methospace/method-packs/${encodeURIComponent(id)}`, { method: "PATCH", token, body: JSON.stringify(body) }),
  deleteMethodPack: (token: string, id: string) =>
    apiJson<any>(`/api/methospace/method-packs/${encodeURIComponent(id)}`, { method: "DELETE", token }),
};

