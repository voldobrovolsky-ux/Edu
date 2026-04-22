import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { userStore } from "../store/userStore.js";
import { toPublicUser } from "../types/user.js";
import { messengerStore } from "../store/messengerStore.js";
import { getMessengerFilesRoot } from "../store/messengerFilesRoot.js";
import { officeConfig } from "../config/office.js";
import type { OfficeSection } from "../types/office.js";
import { isPrimaryRole, isSecondaryRole } from "../types/roles.js";
import type {
  DirectMessage,
  GroupMember,
  GroupMemberRole,
  GroupMessage,
  MessageAttachment,
  PerChatPrefs,
  PollOption,
  PollState,
} from "../types/messenger.js";
import {
  GROUP_SYSTEM_SENDER,
  type CommunitoriaCommunity,
  type CommunitoriaCommunityMetaType,
  type CommunitoriaGroupMeta,
} from "../types/messenger.js";
import { timetableLessonStore } from "../store/timetableLessonStore.js";
import { disciplineStore } from "../store/disciplineStore.js";
import { journalDocumentTypeStore } from "../store/journalDocumentTypeStore.js";
import { journalStore } from "../store/journalStore.js";
import { documentStore } from "../store/documentStore.js";
import {
  buildBotPromptAction,
  confirmPrompt,
  requestPromptConfirmation,
  runReplacementEscalationTick,
  startSickReplacementSession,
  togglePromptSlot,
} from "../services/botReplacementStateMachine.js";

export const chatsRouter = Router();

function paramId(v: string | string[] | undefined): string {
  if (v == null) return "";
  return Array.isArray(v) ? (v[0] ?? "") : v;
}

const CHAT_NOTIF_SOUND_IDS = new Set([
  "notification1",
  "notification2",
  "notification3",
  "notification4",
  "notification5",
  "notification6",
  "notification7",
]);

function effectiveNotifyMuted(prefs: PerChatPrefs): boolean {
  const exp = prefs.muteExpiresAt;
  if (typeof exp === "string" && exp.trim() && new Date(exp).getTime() > Date.now()) return true;
  return Boolean(prefs.muted);
}

function canManageCommunity(c: CommunitoriaCommunity, userId: string): boolean {
  return c.ownerId === userId || c.adminIds.includes(userId);
}

function serializeCommunityInviteLink(l: CommunitoriaCommunity["inviteLinks"][number]) {
  const { password: _p, ...rest } = l;
  return { ...rest, hasPassword: Boolean(l.password) };
}

function serializeCommunity(c: CommunitoriaCommunity) {
  return {
    ...c,
    inviteLinks: (c.inviteLinks ?? []).map(serializeCommunityInviteLink),
  };
}

const uploadRoot = getMessengerFilesRoot();
mkdirSync(uploadRoot, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadRoot),
    filename: (_req, file, cb) => {
      const ext = file.originalname.includes(".") ? file.originalname.slice(file.originalname.lastIndexOf(".")) : "";
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

type TypingEntry = { userId: string; until: number };
const typingByChannel = new Map<string, TypingEntry[]>();

function typingKeyDirect(a: string, b: string): string {
  const [x, y] = a < b ? [a, b] : [b, a];
  return `d:${x}:${y}`;
}

function pruneTyping(key: string): void {
  const now = Date.now();
  const list = typingByChannel.get(key) ?? [];
  typingByChannel.set(
    key,
    list.filter((e) => e.until > now),
  );
}

function uniqueSections(sections: OfficeSection[]): OfficeSection[] {
  const seen = new Set<OfficeSection>();
  const out: OfficeSection[] = [];
  for (const s of sections) {
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function computeUserSections(primaryRole: string, secondaryRoles: string[]): OfficeSection[] {
  const base = officeConfig.staffPrimaryRoles.includes(primaryRole as any) ? officeConfig.staffSections : officeConfig.clientSections;
  const extra = secondaryRoles.flatMap((r) => (isSecondaryRole(r) ? officeConfig.secondaryRoleSections[r] ?? [] : []));
  const primaryExtra = isPrimaryRole(primaryRole) ? (officeConfig.primaryRoleSections?.[primaryRole] ?? []) : [];
  return uniqueSections([...(base ?? []), ...extra, ...primaryExtra]);
}

function requireChatsAccess(req: AuthedRequest): boolean {
  const userId = req.auth?.userId;
  if (!userId) return false;
  const user = userStore.findById(userId);
  if (!user) return false;
  const sections = computeUserSections(user.primaryRole, user.secondaryRoles);
  return sections.includes("chats");
}

function fio(u: { lastName: string; firstName: string; patronymic: string }): string {
  return `${u.lastName} ${u.firstName} ${u.patronymic}`.trim();
}

function canManageGroup(m: GroupMember | undefined): boolean {
  return Boolean(m && (m.role === "owner" || m.role === "admin"));
}

function isMuted(m: GroupMember | undefined): boolean {
  if (!m?.mutedUntil) return false;
  return new Date(m.mutedUntil).getTime() > Date.now();
}

function authorDisplayName(userId: string): string {
  const u = userStore.findById(userId);
  return u ? fio(u) : userId.slice(0, 8);
}

function runBotQuickActionForText(fromUserId: string, toUserId: string, text: string): void {
  const bot = userStore.findSystemBot();
  if (!bot) return;
  if (toUserId !== bot.id) return;
  const cmd = text.trim().toLowerCase();
  if (cmd === "проверить часы работы") {
    const today = new Date().toISOString().slice(0, 10);
    const from = (() => {
      const d = new Date();
      const wd = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - wd);
      return d.toISOString().slice(0, 10);
    })();
    const lessons = timetableLessonStore.listByTeacher({ teacherUserId: fromUserId, from, to: today });
    const lines = lessons
      .sort((a, b) => `${a.date}-${a.slotIndex}`.localeCompare(`${b.date}-${b.slotIndex}`))
      .map((l) => `${l.date}: ${l.slotIndex} урок, ${disciplineStore.findByCode(l.disciplineCode)?.name ?? l.disciplineCode}, ${l.grade} класс`);
    messengerStore.createDirectMessage({
      fromUserId: bot.id,
      toUserId: fromUserId,
      text: lines.length ? `Ваши часы за период ${from} — ${today}:\n${lines.join("\n")}\n\nИтого за период: ${lines.length} уроков.` : `За период ${from} — ${today} у вас нет проведённых уроков.`,
    });
    return;
  }
  if (cmd === "провести саморевизию") {
    const today = new Date().toISOString().slice(0, 10);
    const from = (() => {
      const d = new Date();
      const wd = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - wd);
      return d.toISOString().slice(0, 10);
    })();
    const lessons = timetableLessonStore.listByTeacher({ teacherUserId: fromUserId, from, to: today });
    const metas = new Map(journalStore.getMetaByLessonIds(lessons.map((x) => x.id)).map((m) => [m.timetableLessonId, m] as const));
    const periods = new Set<string>();
    for (const d of documentStore.listAll()) for (const p of d.tags?.periods ?? []) if (typeof p === "string") periods.add(p);
    let required = 0;
    let uploaded = 0;
    const missing: string[] = [];
    for (const l of lessons) {
      const lessonType = metas.get(l.id)?.journalLessonTypeId ?? null;
      for (const dt of journalDocumentTypeStore.list()) {
        if (Array.isArray(dt.requiredForLessonTypeIds) && dt.requiredForLessonTypeIds.length > 0) {
          if (!lessonType || !dt.requiredForLessonTypeIds.includes(lessonType)) continue;
        }
        required += 1;
        const token = `jl:${l.id}:${dt.id}:${l.groupNumber ?? "all"}`;
        if (periods.has(token)) uploaded += 1;
        else missing.push(`${dt.name} для ${l.date}, ${l.slotIndex} урок, ${l.grade} класс`);
      }
    }
    if (required === 0 || uploaded === required) {
      messengerStore.createDirectMessage({ fromUserId: bot.id, toUserId: fromUserId, text: "Вы успешно прошли саморевизию, 100% документов на месте. Так держать!" });
    } else {
      const pct = Math.round((uploaded / required) * 100);
      messengerStore.createDirectMessage({
        fromUserId: bot.id,
        toUserId: fromUserId,
        text: `По результатам саморевизии: загружено ${uploaded} из ${required} требуемых документов (${pct}%).\nНеобходимо загрузить:\n- ${missing.slice(0, 25).join("\n- ")}`,
      });
    }
    return;
  }
  if (cmd === "я заболел(а)") {
    const result = startSickReplacementSession(fromUserId, bot.id);
    messengerStore.createDirectMessage({ fromUserId: bot.id, toUserId: fromUserId, text: result.message });
    runReplacementEscalationTick(bot.id);
  }
}

function ensureSystemGroupsSynced(): void {
  const bot = userStore.findSystemBot();
  if (!bot) return;
  messengerStore.syncSystemGroups(userStore.list(), bot.id);
}

function buildReplyPreviewForDirect(ref: DirectMessage | undefined): Record<string, unknown> {
  if (!ref) {
    return {
      messageId: "",
      authorUserId: "",
      authorName: "",
      previewText: "Сообщение недоступно",
      kind: "text",
      deleted: true,
    };
  }
  const authorUserId = ref.fromUserId;
  if (ref.deletedForAll) {
    return {
      messageId: ref.id,
      authorUserId,
      authorName: authorDisplayName(authorUserId),
      previewText: "Сообщение удалено",
      kind: "text",
      deleted: true,
    };
  }
  let previewText = "";
  let kind = ref.kind;
  if (ref.poll) {
    previewText = `Опрос: ${ref.poll.question.slice(0, 72)}`;
    kind = "poll";
  } else if (ref.attachments?.length) {
    previewText = ref.attachments.map((a) => a.fileName).join(", ").slice(0, 80);
    kind = "file";
  } else {
    previewText = ref.text.slice(0, 80);
  }
  return {
    messageId: ref.id,
    authorUserId,
    authorName: authorDisplayName(authorUserId),
    previewText,
    kind,
    deleted: false,
  };
}

function buildReplyPreviewForGroup(ref: GroupMessage | undefined): Record<string, unknown> {
  if (!ref) {
    return {
      messageId: "",
      authorUserId: "",
      authorName: "",
      previewText: "Сообщение недоступно",
      kind: "text",
      deleted: true,
    };
  }
  const authorUserId = ref.senderUserId;
  if (ref.senderUserId === GROUP_SYSTEM_SENDER) {
    return {
      messageId: ref.id,
      authorUserId,
      authorName: "Система",
      previewText: ref.text.slice(0, 80),
      kind: "text",
      deleted: false,
    };
  }
  if (ref.deletedForAll) {
    return {
      messageId: ref.id,
      authorUserId,
      authorName: authorDisplayName(authorUserId),
      previewText: "Сообщение удалено",
      kind: "text",
      deleted: true,
    };
  }
  let previewText = "";
  let kind = ref.kind;
  if (ref.poll) {
    previewText = `Опрос: ${ref.poll.question.slice(0, 72)}`;
    kind = "poll";
  } else if (ref.attachments?.length) {
    previewText = ref.attachments.map((a) => a.fileName).join(", ").slice(0, 80);
    kind = "file";
  } else {
    previewText = ref.text.slice(0, 80);
  }
  return {
    messageId: ref.id,
    authorUserId,
    authorName: authorDisplayName(authorUserId),
    previewText,
    kind,
    deleted: false,
  };
}

function replyToPayloadForDirect(m: DirectMessage): Record<string, unknown> | null {
  if (!m.replyToMessageId?.trim()) return null;
  const ref = messengerStore.findDirectMessageById(m.replyToMessageId);
  return buildReplyPreviewForDirect(ref);
}

function replyToPayloadForGroup(m: GroupMessage): Record<string, unknown> | null {
  if (!m.replyToMessageId?.trim()) return null;
  const ref = messengerStore.findGroupMessageById(m.replyToMessageId);
  return buildReplyPreviewForGroup(ref);
}

function serializePollForViewer(poll: PollState | undefined, _viewerUserId: string, isAdminViewer: boolean): (PollState & { voteCounts?: Record<string, number> }) | undefined {
  if (!poll) return undefined;
  const voteCounts: Record<string, number> = {};
  for (const opt of poll.options) voteCounts[opt.id] = 0;
  for (const oid of Object.values(poll.votes)) voteCounts[oid] = (voteCounts[oid] ?? 0) + 1;
  if (poll.anonymous && !isAdminViewer) {
    return {
      ...poll,
      votes: {},
      anonymous: true,
      options: poll.options.map((o) => ({ ...o })),
      voteCounts,
    };
  }
  return { ...poll, voteCounts };
}

function computeDirectDelivery(m: DirectMessage, viewerUserId: string): string | undefined {
  if (m.fromUserId !== viewerUserId) return undefined;
  if (m.isRead) return "read";
  if (m.deliveredToRecipient) return "delivered";
  return "sent";
}

function serializeDirectMessage(m: DirectMessage, viewerUserId: string): Record<string, unknown> {
  const replyTo = replyToPayloadForDirect(m);
  const botPromptAction = buildBotPromptAction(m.id, viewerUserId);
  const base = {
    id: m.id,
    fromUserId: m.fromUserId,
    toUserId: m.toUserId,
    createdAt: m.createdAt,
    kind: m.kind,
    isRead: m.isRead,
    readAt: m.readAt ?? null,
    deliveryStatus: computeDirectDelivery(m, viewerUserId),
    reactions: m.reactions ?? {},
    pinned: Boolean(m.pinned),
    mentionUserIds: m.mentionUserIds ?? [],
    pollClosed: Boolean(m.pollClosed),
    replyTo: replyTo ?? null,
    botPromptAction,
  };
  if (m.deletedForAll) {
    return { ...base, text: "", deletedForAll: true, poll: undefined, attachments: [] };
  }
  return {
    ...base,
    text: m.text,
    poll: m.poll ? serializePollForViewer(m.poll, viewerUserId, !m.poll.anonymous) : undefined,
    attachments: m.attachments ?? [],
  };
}

function serializeGroupMessage(
  m: GroupMessage,
  viewerUserId: string,
  member: GroupMember | undefined,
  showDeletedMod: boolean,
): Record<string, unknown> {
  const isAdmin = canManageGroup(member);
  const showMod = Boolean(showDeletedMod && isAdmin && m.deletedForAll);
  const replyTo = replyToPayloadForGroup(m);
  const base = {
    id: m.id,
    groupId: m.groupId,
    topicId: m.topicId,
    senderUserId: m.senderUserId,
    createdAt: m.createdAt,
    kind: m.kind,
    reactions: m.reactions ?? {},
    pinned: Boolean(m.pinned),
    mentionUserIds: m.mentionUserIds ?? [],
    pollClosed: Boolean(m.pollClosed),
    replyTo: replyTo ?? null,
  };
  if (m.deletedForAll && !showMod) {
    return { ...base, text: "", deletedForAll: true, poll: undefined, attachments: [] };
  }
  const poll = serializePollForViewer(m.poll, viewerUserId, isAdmin);
  if (showMod) {
    return {
      ...base,
      text: m.modText ?? "",
      deletedForAll: true,
      modVisible: true,
      attachments: m.modAttachments ?? [],
      poll: m.poll ? serializePollForViewer(m.poll, viewerUserId, true) : undefined,
    };
  }
  return {
    ...base,
    text: m.text,
    deletedForAll: Boolean(m.deletedForAll),
    attachments: m.attachments ?? [],
    poll,
  };
}

chatsRouter.get("/unread-count", requireAuth, (req: AuthedRequest, res) => {
  ensureSystemGroupsSynced();
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  let total = messengerStore.countUnreadIncomingForUser(meId);
  for (const g of messengerStore.listGroupsForUser(meId)) {
    total += messengerStore.countUnreadGroup(g.id, meId);
  }
  return res.json({ total });
});

chatsRouter.get("/users", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const users = userStore
    .list()
    .filter((u) => (meId ? u.id !== meId : true))
    .map((u) => {
      const pub = toPublicUser(u);
      return {
        id: u.id,
        fio: fio(u),
        username: u.username,
        role: u.primaryRole,
        avatarUrl: pub.avatarUrl,
        allowDirectGroupAdd: pub.profilePrefs.allowDirectGroupAdd,
        lastSeenAt: messengerStore.getPresence(u.id).lastSeenAt || null,
      };
    })
    .filter((u) => {
      if (!q) return true;
      return u.fio.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
    })
    .sort((a, b) => a.fio.localeCompare(b.fio, "ru"));
  return res.json({ users });
});

chatsRouter.post("/users/batch", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const raw = req.body?.ids;
  if (!Array.isArray(raw)) return res.status(400).json({ error: "INVALID_INPUT" });
  const ids = [...new Set(raw.filter((x: unknown): x is string => typeof x === "string" && x.length > 0))].slice(0, 200);
  const users = ids
    .map((id) => {
      const u = userStore.findById(id);
      if (!u) return null;
      const pub = toPublicUser(u);
      return {
        id: pub.id,
        fio: fio(u),
        username: pub.username,
        avatarUrl: pub.avatarUrl,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  return res.json({ users });
});

chatsRouter.post("/upload", requireAuth, upload.array("files", 10), (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files?.length) return res.status(400).json({ error: "FILES_REQUIRED" });
  const attachments: MessageAttachment[] = files.map((f) => ({
    id: randomUUID(),
    fileName: f.originalname,
    mime: f.mimetype,
    url: `/messenger-files/${f.filename}`,
    size: f.size,
  }));
  return res.json({ attachments });
});

chatsRouter.get("/inbox", requireAuth, (req: AuthedRequest, res) => {
  ensureSystemGroupsSynced();
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  messengerStore.touchPresence(meId);

  const directItems = messengerStore.listDirectPeerIds(meId).map((otherId) => {
    const u = userStore.findById(otherId);
    const last = messengerStore.lastDirectMessageBetween(meId, otherId);
    const unread = messengerStore.listDirectBetween(meId, otherId).filter((x) => x.toUserId === meId && !x.isRead).length;
    const convKey = `direct:${otherId}`;
    const prefs = messengerStore.getPrefs(meId, convKey);
    return {
      kind: "direct" as const,
      peerUserId: otherId,
      title: u ? fio(u) : otherId,
      username: u?.username ?? "",
      lastMessagePreview: last ? (last.deletedForAll ? "Сообщение удалено" : last.text || (last.poll ? "Опрос" : "Вложение")) : "",
      lastMessageAt: last?.createdAt ?? "",
      unread,
      important: Boolean(prefs.important),
      muted: effectiveNotifyMuted(prefs),
      muteExpiresAt: prefs.muteExpiresAt ?? null,
      incomingSoundId: prefs.incomingSoundId ?? null,
    };
  });

  const groupItems = messengerStore.listGroupsForUser(meId).map((g) => {
    const last = messengerStore.lastGroupMessage(g.id);
    const unread = messengerStore.countUnreadGroup(g.id, meId);
    const convKey = `group:${g.id}`;
    const prefs = messengerStore.getPrefs(meId, convKey);
    const comm = messengerStore.communityForGroup(g.id);
    return {
      kind: "group" as const,
      groupId: g.id,
      title: g.title,
      description: g.description,
      avatarEmoji: g.avatarEmoji,
      avatarImageUrl: g.avatarImageUrl,
      isSystemGroup: Boolean(g.isSystemGroup),
      communityId: comm?.id ?? null,
      communityName: comm?.name ?? null,
      lastMessagePreview: last
        ? last.deletedForAll
          ? "Сообщение удалено"
          : last.text || (last.poll ? "Опрос" : "Вложение")
        : "",
      lastMessageAt: last?.createdAt ?? g.createdAt,
      unread,
      important: Boolean(prefs.important),
      muted: effectiveNotifyMuted(prefs),
      muteExpiresAt: prefs.muteExpiresAt ?? null,
      incomingSoundId: prefs.incomingSoundId ?? null,
    };
  });

  const combined = [...directItems, ...groupItems].sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || ""));
  return res.json({ items: combined });
});

chatsRouter.patch("/prefs", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const { convKey, muted, important, showDeletedMod, muteExpiresAt, incomingSoundId } = req.body ?? {};
  if (typeof convKey !== "string" || !convKey.trim()) return res.status(400).json({ error: "CONV_KEY_REQUIRED" });
  let nextIncoming: string | null | undefined;
  if (incomingSoundId === null) nextIncoming = null;
  else if (typeof incomingSoundId === "string" && CHAT_NOTIF_SOUND_IDS.has(incomingSoundId)) nextIncoming = incomingSoundId;
  else if (incomingSoundId !== undefined) return res.status(400).json({ error: "INVALID_INCOMING_SOUND" });
  let nextMuteExp: string | null | undefined;
  if (muteExpiresAt === null) nextMuteExp = null;
  else if (typeof muteExpiresAt === "string" && muteExpiresAt.trim()) nextMuteExp = muteExpiresAt.trim();
  else if (muteExpiresAt !== undefined) return res.status(400).json({ error: "INVALID_MUTE_EXPIRES" });
  const patch: PerChatPrefs = {};
  if (typeof muted === "boolean") patch.muted = muted;
  if (typeof important === "boolean") patch.important = important;
  if (typeof showDeletedMod === "boolean") patch.showDeletedMod = showDeletedMod;
  if (nextMuteExp !== undefined) patch.muteExpiresAt = nextMuteExp;
  if (nextIncoming !== undefined) patch.incomingSoundId = nextIncoming;
  const prefs = messengerStore.setPrefs(meId, convKey.trim(), patch);
  return res.json({ prefs });
});

chatsRouter.get("/presence/:userId", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const targetId = paramId(req.params.userId);
  const target = userStore.findById(targetId);
  const hidePresence =
    target?.profilePrefs && typeof target.profilePrefs.showOnlineStatus === "boolean"
      ? !target.profilePrefs.showOnlineStatus
      : false;
  if (hidePresence) {
    return res.json({ lastSeenAt: null, online: false, presenceHidden: true });
  }
  const { lastSeenAt } = messengerStore.getPresence(targetId);
  const online = Boolean(lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < 120_000);
  return res.json({ lastSeenAt, online, presenceHidden: false });
});

chatsRouter.post("/typing", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const { channel, peerUserId, groupId, active } = req.body ?? {};
  let key = "";
  if (channel === "direct" && typeof peerUserId === "string") {
    key = typingKeyDirect(meId, peerUserId);
  } else if (channel === "group" && typeof groupId === "string") {
    key = `g:${groupId}`;
  } else {
    return res.status(400).json({ error: "INVALID_TYPING" });
  }
  pruneTyping(key);
  const list = typingByChannel.get(key) ?? [];
  const until = Date.now() + 6000;
  const next = list.filter((e) => e.userId !== meId);
  if (active) next.push({ userId: meId, until });
  typingByChannel.set(key, next);
  return res.json({ ok: true });
});

chatsRouter.get("/typing", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const peerUserId = typeof req.query.peerUserId === "string" ? req.query.peerUserId : "";
  const groupId = typeof req.query.groupId === "string" ? req.query.groupId : "";
  let key = "";
  if (peerUserId) key = typingKeyDirect(meId, peerUserId);
  else if (groupId) key = `g:${groupId}`;
  else return res.status(400).json({ error: "PARAM_REQUIRED" });
  pruneTyping(key);
  const list = (typingByChannel.get(key) ?? []).filter((e) => e.userId !== meId);
  return res.json({ userIds: list.map((e) => e.userId) });
});

chatsRouter.get("/messages", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const otherId = typeof req.query.userId === "string" ? req.query.userId : "";
  if (!otherId.trim()) return res.status(400).json({ error: "USER_ID_REQUIRED" });
  messengerStore.markDirectDeliveredWhenRecipientFetched(meId, otherId.trim());
  const raw = messengerStore.listDirectBetween(meId, otherId.trim());
  const messages = raw.map((m) => serializeDirectMessage(m, meId));
  return res.json({ messages });
});

chatsRouter.post("/messages", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const { toUserId, text, attachments, poll, mentionUserIds, replyToMessageId: replyToRaw } = req.body ?? {};
  if (typeof toUserId !== "string" || !toUserId.trim()) return res.status(400).json({ error: "TO_USER_ID_REQUIRED" });
  const bodyText = typeof text === "string" ? text : "";
  if (!poll && !attachments?.length && !bodyText.trim()) return res.status(400).json({ error: "TEXT_REQUIRED" });
  if (bodyText.length > 5000) return res.status(400).json({ error: "TEXT_TOO_LONG" });

  const peer = toUserId.trim();
  let replyToMessageId: string | undefined;
  if (replyToRaw !== undefined && replyToRaw !== null) {
    if (typeof replyToRaw !== "string" || !replyToRaw.trim()) return res.status(400).json({ error: "INVALID_REPLY" });
    const rid = replyToRaw.trim();
    const ref = messengerStore.findDirectMessageById(rid);
    if (!ref) return res.status(400).json({ error: "REPLY_MESSAGE_NOT_FOUND" });
    const samePair =
      (ref.fromUserId === meId && ref.toUserId === peer) || (ref.fromUserId === peer && ref.toUserId === meId);
    if (!samePair) return res.status(400).json({ error: "INVALID_REPLY" });
    replyToMessageId = rid;
  }

  let pollState: PollState | undefined;
  if (poll && typeof poll === "object") {
    const question = typeof poll.question === "string" ? poll.question.trim() : "";
    const options = Array.isArray(poll.options) ? poll.options : [];
    const cleanOpts: PollOption[] = options
      .filter((x: unknown) => typeof x === "string" && x.trim())
      .map((x: string) => ({ id: randomUUID(), text: x.trim() }));
    if (cleanOpts.length < 2 || !question) return res.status(400).json({ error: "POLL_INVALID" });
    pollState = {
      question,
      anonymous: Boolean(poll.anonymous),
      options: cleanOpts,
      votes: {},
    };
  }

  const atts = Array.isArray(attachments) ? (attachments as MessageAttachment[]) : undefined;

  const msg = messengerStore.createDirectMessage({
    fromUserId: meId,
    toUserId: peer,
    text: pollState ? pollState.question : bodyText.trim(),
    attachments: atts,
    poll: pollState,
    mentionUserIds: Array.isArray(mentionUserIds) ? mentionUserIds.filter((x: unknown) => typeof x === "string") : undefined,
    replyToMessageId: replyToMessageId ?? null,
  });
  runBotQuickActionForText(meId, peer, bodyText.trim());

  return res.status(201).json({ message: serializeDirectMessage(msg, meId) });
});

chatsRouter.post("/messages/read", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const { userId } = req.body ?? {};
  if (typeof userId !== "string" || !userId.trim()) return res.status(400).json({ error: "USER_ID_REQUIRED" });
  const result = messengerStore.markDirectRead(meId, userId.trim());
  const messages = result.messages.map((m) => serializeDirectMessage(m, meId));
  return res.json({ updatedCount: result.updatedCount, messages });
});

chatsRouter.post("/bot/replacement-prompts/:promptId/toggle-slot", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const slotIndex = Number(req.body?.slotIndex);
  if (!Number.isInteger(slotIndex) || slotIndex <= 0) return res.status(400).json({ error: "INVALID_SLOT" });
  const result = togglePromptSlot(paramId(req.params.promptId), meId, slotIndex);
  if (!result.ok) return res.status(400).json({ error: result.error ?? "FAILED" });
  return res.json({ ok: true });
});

chatsRouter.post("/bot/replacement-prompts/:promptId/request-confirm", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const bot = userStore.findSystemBot();
  if (!bot) return res.status(500).json({ error: "BOT_MISSING" });
  const result = requestPromptConfirmation(paramId(req.params.promptId), meId, bot.id);
  if (!result.ok) return res.status(400).json({ error: result.error ?? "FAILED" });
  return res.json({ ok: true });
});

chatsRouter.post("/bot/replacement-prompts/:promptId/confirm", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const bot = userStore.findSystemBot();
  if (!bot) return res.status(500).json({ error: "BOT_MISSING" });
  const ok = Boolean(req.body?.ok);
  const result = confirmPrompt(paramId(req.params.promptId), meId, bot.id, ok);
  if (!result.ok) return res.status(400).json({ error: result.error ?? "FAILED" });
  runReplacementEscalationTick(bot.id);
  return res.json({ ok: true });
});

chatsRouter.post("/messages/:messageId/delete", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const updated = messengerStore.softDeleteDirectMessage(paramId(req.params.messageId), meId);
  if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({ message: serializeDirectMessage(updated, meId) });
});

chatsRouter.post("/messages/:messageId/reactions", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const { emoji } = req.body ?? {};
  if (typeof emoji !== "string" || !emoji.trim()) return res.status(400).json({ error: "EMOJI_REQUIRED" });
  const updated = messengerStore.toggleDirectReaction(paramId(req.params.messageId), meId, emoji.trim());
  if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({ message: serializeDirectMessage(updated, meId) });
});

chatsRouter.post("/messages/:messageId/pin", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const { pinned } = req.body ?? {};
  const updated = messengerStore.pinDirectMessage(paramId(req.params.messageId), Boolean(pinned));
  if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({ message: serializeDirectMessage(updated, meId) });
});

chatsRouter.post("/messages/:messageId/poll-vote", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const { optionId } = req.body ?? {};
  if (typeof optionId !== "string") return res.status(400).json({ error: "OPTION_REQUIRED" });
  const updated = messengerStore.voteDirectPoll(paramId(req.params.messageId), meId, optionId);
  if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({ message: serializeDirectMessage(updated, meId) });
});

chatsRouter.post("/messages/:messageId/poll-close", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const mid = paramId(req.params.messageId);
  const found = messengerStore.findDirectMessageById(mid);
  if (!found?.poll) return res.status(404).json({ error: "NOT_FOUND" });
  if (found.fromUserId !== meId) return res.status(403).json({ error: "FORBIDDEN" });
  const updated = messengerStore.toggleDirectPollClosed(mid, true);
  if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({ message: serializeDirectMessage(updated, meId) });
});

chatsRouter.get("/direct/pinned", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const peerUserId = typeof req.query.peerUserId === "string" ? req.query.peerUserId : "";
  if (!peerUserId) return res.status(400).json({ error: "USER_ID_REQUIRED" });
  const list = messengerStore.listPinnedDirect(meId, peerUserId).map((m) => serializeDirectMessage(m, meId));
  return res.json({ messages: list });
});

/** --- Groups --- */

chatsRouter.post("/groups", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const { title, description, avatarEmoji, avatarImageUrl, memberUserIds } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) return res.status(400).json({ error: "TITLE_REQUIRED" });
  const members = Array.isArray(memberUserIds) ? memberUserIds.filter((x: unknown) => typeof x === "string") : [];
  const { group, topic } = messengerStore.createGroup({
    title: title.trim(),
    description: typeof description === "string" ? description : null,
    avatarEmoji: typeof avatarEmoji === "string" ? avatarEmoji : null,
    avatarImageUrl: typeof avatarImageUrl === "string" ? avatarImageUrl : null,
    creatorUserId: meId,
    memberUserIds: members,
  });
  return res.status(201).json({ group, defaultTopic: topic });
});

chatsRouter.get("/groups/:groupId", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  if (!messengerStore.getMember(groupId, meId)) return res.status(403).json({ error: "FORBIDDEN" });
  const g = messengerStore.findGroup(groupId);
  if (!g) return res.status(404).json({ error: "NOT_FOUND" });
  const prefs = messengerStore.getPrefs(meId, `group:${groupId}`);
  return res.json({ group: g, prefs });
});

chatsRouter.patch("/groups/:groupId", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const m = messengerStore.getMember(groupId, meId);
  if (!canManageGroup(m)) return res.status(403).json({ error: "FORBIDDEN" });
  const before = messengerStore.findGroup(groupId);
  const { title, description, avatarEmoji, avatarImageUrl, invitePolicy, groupMeta: rawGm } = req.body ?? {};
  const updated = messengerStore.updateGroup(groupId, {
    title: typeof title === "string" ? title : undefined,
    description: typeof description === "string" ? description : undefined,
    avatarEmoji: typeof avatarEmoji === "string" || avatarEmoji === null ? avatarEmoji : undefined,
    avatarImageUrl: typeof avatarImageUrl === "string" || avatarImageUrl === null ? avatarImageUrl : undefined,
    invitePolicy: invitePolicy === "all" || invitePolicy === "admins_only" || invitePolicy === "school_admins" ? invitePolicy : undefined,
  });
  if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
  let metaUpdated = updated;
  if (rawGm && typeof rawGm === "object") {
    const ob = rawGm as Record<string, unknown>;
    const patchMeta: Partial<CommunitoriaGroupMeta> = {};
    if (ob.groupType === "standard" || ob.groupType === "announcements") patchMeta.groupType = ob.groupType;
    if (
      ob.historyForNewMembers === "full" ||
      ob.historyForNewMembers === "month" ||
      ob.historyForNewMembers === "hidden"
    ) {
      patchMeta.historyForNewMembers = ob.historyForNewMembers;
    }
    if (ob.permissions && typeof ob.permissions === "object") {
      const p = ob.permissions as Record<string, unknown>;
      patchMeta.permissions = {
        sendMessages: p.sendMessages === "admins" ? "admins" : "all",
        sendDocuments: p.sendDocuments !== false,
        addMembers: p.addMembers !== false,
        pinMessages: p.pinMessages !== false,
        changeGroupSettings: p.changeGroupSettings !== false,
        changeGroupInfo: p.changeGroupInfo !== false,
      };
    }
    const gm = messengerStore.patchGroupMeta(groupId, patchMeta);
    if (gm) metaUpdated = gm;
  }
  if (before && typeof title === "string" && title.trim() && title.trim() !== before.title) {
    const topics = messengerStore.listTopics(groupId);
    const def = topics.find((t) => t.isDefault) ?? topics[0];
    if (def) {
      messengerStore.appendGroupSystemMessage({
        groupId,
        topicId: def.id,
        text: `Название группы изменено на «${metaUpdated.title}»`,
      });
    }
  }
  return res.json({ group: metaUpdated });
});

chatsRouter.get("/groups/:groupId/invite", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const g = messengerStore.findGroup(groupId);
  if (!g) return res.status(404).json({ error: "NOT_FOUND" });
  const m = messengerStore.getMember(groupId, meId);
  if (!canManageGroup(m)) return res.status(403).json({ error: "FORBIDDEN" });
  const base = typeof req.get === "function" ? `${req.protocol}://${req.get("host") ?? ""}` : "";
  const path = `/section/chats/join/${g.inviteToken}`;
  return res.json({ token: g.inviteToken, url: `${base}${path}` });
});

chatsRouter.post("/groups/:groupId/invite/regenerate", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const m = messengerStore.getMember(groupId, meId);
  if (!canManageGroup(m)) return res.status(403).json({ error: "FORBIDDEN" });
  const g = messengerStore.regenerateInviteToken(groupId);
  if (!g) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({ token: g.inviteToken });
});

chatsRouter.post("/groups/:groupId/invite-links", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const actor = messengerStore.getMember(groupId, meId);
  if (!canManageGroup(actor)) return res.status(403).json({ error: "FORBIDDEN" });
  const { label, password } = req.body ?? {};
  const created = messengerStore.addGroupInviteLink(groupId, {
    label: typeof label === "string" ? label : undefined,
    password: typeof password === "string" && password.trim() ? password : null,
  });
  if (!created) return res.status(404).json({ error: "NOT_FOUND" });
  const base = typeof req.get === "function" ? `${req.protocol}://${req.get("host") ?? ""}` : "";
  const path = `/section/chats/join/${created.link.token}`;
  const { password: _omitPw, ...linkRest } = created.link;
  return res.status(201).json({
    link: {
      ...linkRest,
      url: `${base}${path}`,
      hasPassword: Boolean(created.link.password),
    },
  });
});

chatsRouter.post("/groups/:groupId/leave", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const mode = req.body?.mode === "delete_all" ? "delete_all" : "leave";
  const group = messengerStore.findGroup(groupId);
  if (!group) return res.status(404).json({ error: "NOT_FOUND" });
  if (group.isSystemGroup) return res.status(403).json({ error: "SYSTEM_GROUP_PROTECTED" });
  const member = messengerStore.getMember(groupId, meId);
  if (!member) return res.status(403).json({ error: "FORBIDDEN" });
  if (mode === "delete_all") {
    if (member.role !== "owner") return res.status(403).json({ error: "FORBIDDEN" });
    messengerStore.deleteGroupCascade(groupId);
    return res.json({ ok: true, deleted: true });
  }
  if (member.role === "owner") {
    const rows = messengerStore.listGroupMemberRows(groupId).filter((r) => r.userId !== meId);
    const successor = rows.find((r) => r.role === "admin") ?? rows[0];
    if (!successor) return res.status(400).json({ error: "SOLE_OWNER" });
    messengerStore.reassignOwner(groupId, successor.userId);
  }
  const ok = messengerStore.removeMember(groupId, meId);
  if (!ok) return res.status(400).json({ error: "FAILED" });
  const topics = messengerStore.listTopics(groupId);
  const def = topics.find((t) => t.isDefault) ?? topics[0];
  const u = userStore.findById(meId);
  const name = u ? fio(u) : "Пользователь";
  if (def) {
    messengerStore.appendGroupSystemMessage({
      groupId,
      topicId: def.id,
      text: `${name} покинул(а) группу`,
    });
  }
  return res.json({ ok: true });
});

chatsRouter.get("/groups/:groupId/members", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const group = messengerStore.findGroup(groupId);
  if (!group) return res.status(404).json({ error: "NOT_FOUND" });
  if (!messengerStore.getMember(groupId, meId)) return res.status(403).json({ error: "FORBIDDEN" });
  const rows = messengerStore.listGroupMemberRows(groupId);
  const payload = rows.map((r) => {
    const u = userStore.findById(r.userId);
    return {
      userId: r.userId,
      fio: u ? fio(u) : r.userId,
      username: u?.username ?? "",
      localDisplayName: group.localDisplayNames?.[r.userId] ?? null,
      role: r.role,
      mutedUntil: r.mutedUntil,
    };
  });
  return res.json({ members: payload });
});

chatsRouter.post("/groups/:groupId/members", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const actor = messengerStore.getMember(groupId, meId);
  if (!canManageGroup(actor)) return res.status(403).json({ error: "FORBIDDEN" });
  const { userId, role } = req.body ?? {};
  if (typeof userId !== "string" || !userId.trim()) return res.status(400).json({ error: "USER_ID_REQUIRED" });
  const r: GroupMemberRole = role === "admin" ? "admin" : "member";
  const m = messengerStore.addMember(groupId, userId.trim(), r);
  if (!m) return res.status(400).json({ error: "FAILED" });
  return res.json({ member: m });
});

chatsRouter.delete("/groups/:groupId/members/:userId", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const group = messengerStore.findGroup(groupId);
  if (!group) return res.status(404).json({ error: "NOT_FOUND" });
  if (group.isSystemGroup) return res.status(403).json({ error: "SYSTEM_GROUP_PROTECTED" });
  const target = paramId(req.params.userId);
  const actor = messengerStore.getMember(groupId, meId);
  if (!canManageGroup(actor)) return res.status(403).json({ error: "FORBIDDEN" });
  if (target === meId) return res.status(400).json({ error: "CANNOT_REMOVE_SELF" });
  const removedUser = userStore.findById(target);
  const removedName = removedUser ? fio(removedUser) : target;
  const ok = messengerStore.removeMember(groupId, target);
  if (!ok) return res.status(400).json({ error: "FAILED" });
  const topics = messengerStore.listTopics(groupId);
  const def = topics.find((t) => t.isDefault) ?? topics[0];
  if (def) {
    messengerStore.appendGroupSystemMessage({
      groupId,
      topicId: def.id,
      text: `${removedName} удалён администратором из группы`,
    });
  }
  return res.json({ ok: true });
});

chatsRouter.patch("/groups/:groupId/members/:userId", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const target = paramId(req.params.userId);
  const actor = messengerStore.getMember(groupId, meId);
  if (!canManageGroup(actor)) return res.status(403).json({ error: "FORBIDDEN" });
  const { role, mutedUntil } = req.body ?? {};
  if (typeof mutedUntil === "string" || mutedUntil === null) {
    messengerStore.setMute(groupId, target, mutedUntil);
  }
  if (role === "admin" || role === "member") {
    messengerStore.setMemberRole(groupId, target, role);
  }
  const m = messengerStore.getMember(groupId, target);
  return res.json({ member: m });
});

chatsRouter.get("/groups/:groupId/topics", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  if (!messengerStore.getMember(groupId, meId)) return res.status(403).json({ error: "FORBIDDEN" });
  return res.json({ topics: messengerStore.listTopics(groupId) });
});

chatsRouter.post("/groups/:groupId/topics", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const actor = messengerStore.getMember(groupId, meId);
  if (!canManageGroup(actor)) return res.status(403).json({ error: "FORBIDDEN" });
  const { name, description, emoji } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "NAME_REQUIRED" });
  const t = messengerStore.createTopic(groupId, name, typeof description === "string" ? description : null, typeof emoji === "string" ? emoji : "📌");
  if (!t) return res.status(404).json({ error: "NOT_FOUND" });
  return res.status(201).json({ topic: t });
});

chatsRouter.post("/groups/:groupId/topics/:topicId/archive", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const actor = messengerStore.getMember(groupId, meId);
  if (!canManageGroup(actor)) return res.status(403).json({ error: "FORBIDDEN" });
  const t = messengerStore.archiveTopic(paramId(req.params.topicId), true);
  if (!t) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({ topic: t });
});

chatsRouter.delete("/groups/:groupId/topics/:topicId", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const actor = messengerStore.getMember(groupId, meId);
  if (!canManageGroup(actor)) return res.status(403).json({ error: "FORBIDDEN" });
  const ok = messengerStore.deleteTopic(paramId(req.params.topicId));
  if (!ok) return res.status(400).json({ error: "FAILED" });
  return res.json({ ok: true });
});

chatsRouter.patch("/groups/:groupId/local-display-names/:userId", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const userId = paramId(req.params.userId);
  const actor = messengerStore.getMember(groupId, meId);
  if (!canManageGroup(actor)) return res.status(403).json({ error: "FORBIDDEN" });
  const localDisplayNameRaw = req.body?.localDisplayName;
  const localDisplayName = typeof localDisplayNameRaw === "string" ? localDisplayNameRaw : null;
  const group = messengerStore.setLocalDisplayName(groupId, userId, localDisplayName);
  if (!group) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({ localDisplayNames: group.localDisplayNames ?? {} });
});

chatsRouter.get("/groups/:groupId/messages", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const member = messengerStore.getMember(groupId, meId);
  if (!member) return res.status(403).json({ error: "FORBIDDEN" });
  const topicId = typeof req.query.topicId === "string" ? req.query.topicId : "";
  if (!topicId) return res.status(400).json({ error: "TOPIC_ID_REQUIRED" });
  const convKey = `group:${groupId}`;
  const showDeletedMod = Boolean(messengerStore.getPrefs(meId, convKey).showDeletedMod && canManageGroup(member));
  const raw = messengerStore.listGroupMessages(groupId, topicId);
  const messages = raw.map((m) => serializeGroupMessage(m, meId, member, showDeletedMod));
  return res.json({ messages });
});

chatsRouter.post("/groups/:groupId/messages", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const member = messengerStore.getMember(groupId, meId);
  if (!member) return res.status(403).json({ error: "FORBIDDEN" });
  if (isMuted(member)) return res.status(403).json({ error: "MUTED" });
  const { topicId, text, attachments, poll, mentionUserIds, replyToMessageId: replyToRaw } = req.body ?? {};
  if (typeof topicId !== "string" || !topicId.trim()) return res.status(400).json({ error: "TOPIC_ID_REQUIRED" });
  const bodyText = typeof text === "string" ? text : "";
  if (!poll && !attachments?.length && !bodyText.trim()) return res.status(400).json({ error: "TEXT_REQUIRED" });

  let replyToMessageId: string | undefined;
  if (replyToRaw !== undefined && replyToRaw !== null) {
    if (typeof replyToRaw !== "string" || !replyToRaw.trim()) return res.status(400).json({ error: "INVALID_REPLY" });
    const rid = replyToRaw.trim();
    const ref = messengerStore.findGroupMessageById(rid);
    if (!ref || ref.groupId !== groupId) return res.status(400).json({ error: "INVALID_REPLY" });
    replyToMessageId = rid;
  }

  let pollState: PollState | undefined;
  if (poll && typeof poll === "object") {
    const question = typeof poll.question === "string" ? poll.question.trim() : "";
    const options = Array.isArray(poll.options) ? poll.options : [];
    const cleanOpts: PollOption[] = options
      .filter((x: unknown) => typeof x === "string" && x.trim())
      .map((x: string) => ({ id: randomUUID(), text: x.trim() }));
    if (cleanOpts.length < 2 || !question) return res.status(400).json({ error: "POLL_INVALID" });
    pollState = { question, anonymous: Boolean(poll.anonymous), options: cleanOpts, votes: {} };
  }

  const atts = Array.isArray(attachments) ? (attachments as MessageAttachment[]) : undefined;
  const msg = messengerStore.createGroupMessage({
    groupId,
    topicId: topicId.trim(),
    senderUserId: meId,
    text: pollState ? pollState.question : bodyText.trim(),
    attachments: atts,
    poll: pollState,
    mentionUserIds: Array.isArray(mentionUserIds) ? mentionUserIds.filter((x: unknown) => typeof x === "string") : undefined,
    replyToMessageId: replyToMessageId ?? null,
  });

  // Bot behavior (simplified):
  // - announcementsRelay: when an admin posts in community announcement group, bot duplicates announcement into linked groups.
  try {
    const comm = messengerStore.communityForGroup(groupId);
    const actorIsAdmin = member.role === "admin" || member.role === "owner";
    const botEnabled = Boolean(comm?.botEnabled && comm.botConfig?.announcementsRelay);
    const announcementGroupId = comm?.announcementGroupId ?? null;
    if (botEnabled && actorIsAdmin && announcementGroupId && announcementGroupId === groupId) {
      const bot = userStore.findSystemBot();
      if (bot) {
        const relayTargets = (comm?.linkedGroupIds ?? []).filter((gid) => gid !== announcementGroupId);
        const relayText = pollState ? pollState.question : bodyText;
        if (relayText) {
          for (const tg of relayTargets) {
            const topics = messengerStore.listTopics(tg);
            const def = topics.find((t) => t.isDefault) ?? topics[0];
            if (!def) continue;
            messengerStore.createGroupMessage({
              groupId: tg,
              topicId: def.id,
              senderUserId: bot.id,
              text: relayText,
            });
          }
        }
      }
    }
  } catch {
    // Bot duplication should never break main message send.
  }
  const showDeletedMod = Boolean(messengerStore.getPrefs(meId, `group:${groupId}`).showDeletedMod && canManageGroup(member));
  return res.status(201).json({ message: serializeGroupMessage(msg, meId, member, showDeletedMod) });
});

chatsRouter.post("/groups/:groupId/read", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const member = messengerStore.getMember(groupId, meId);
  if (!member) return res.status(403).json({ error: "FORBIDDEN" });
  const { topicId, at } = req.body ?? {};
  if (typeof topicId !== "string" || typeof at !== "string") return res.status(400).json({ error: "INVALID" });
  messengerStore.markGroupTopicRead(groupId, topicId, meId, at);
  return res.json({ ok: true });
});

chatsRouter.post("/groups/:groupId/messages/:messageId/delete", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const member = messengerStore.getMember(groupId, meId);
  if (!member) return res.status(403).json({ error: "FORBIDDEN" });
  const msgId = paramId(req.params.messageId);
  const gm = messengerStore.findGroupMessageById(msgId);
  if (!gm || gm.groupId !== groupId) return res.status(404).json({ error: "NOT_FOUND" });
  let updated: GroupMessage | null = null;
  if (gm.senderUserId === meId) {
    updated = messengerStore.softDeleteGroupMessage(msgId, meId);
  } else if (canManageGroup(member)) {
    updated = messengerStore.adminDeleteGroupMessage(msgId);
  } else {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
  const showDeletedMod = Boolean(messengerStore.getPrefs(meId, `group:${groupId}`).showDeletedMod && canManageGroup(member));
  return res.json({ message: serializeGroupMessage(updated, meId, member, showDeletedMod) });
});

chatsRouter.post("/groups/:groupId/messages/:messageId/reactions", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const member = messengerStore.getMember(groupId, meId);
  if (!member) return res.status(403).json({ error: "FORBIDDEN" });
  const { emoji } = req.body ?? {};
  if (typeof emoji !== "string" || !emoji.trim()) return res.status(400).json({ error: "EMOJI_REQUIRED" });
  const updated = messengerStore.toggleGroupReaction(paramId(req.params.messageId), meId, emoji.trim());
  if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
  const showDeletedMod = Boolean(messengerStore.getPrefs(meId, `group:${groupId}`).showDeletedMod && canManageGroup(member));
  return res.json({ message: serializeGroupMessage(updated, meId, member, showDeletedMod) });
});

chatsRouter.post("/groups/:groupId/messages/:messageId/pin", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const member = messengerStore.getMember(groupId, meId);
  if (!member) return res.status(403).json({ error: "FORBIDDEN" });
  if (!canManageGroup(member)) return res.status(403).json({ error: "FORBIDDEN" });
  const { pinned } = req.body ?? {};
  const updated = messengerStore.pinGroupMessage(paramId(req.params.messageId), Boolean(pinned));
  if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
  const showDeletedMod = Boolean(messengerStore.getPrefs(meId, `group:${groupId}`).showDeletedMod && canManageGroup(member));
  return res.json({ message: serializeGroupMessage(updated, meId, member, showDeletedMod) });
});

chatsRouter.post("/groups/:groupId/messages/:messageId/poll-vote", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const member = messengerStore.getMember(groupId, meId);
  if (!member) return res.status(403).json({ error: "FORBIDDEN" });
  const { optionId } = req.body ?? {};
  if (typeof optionId !== "string") return res.status(400).json({ error: "OPTION_REQUIRED" });
  const updated = messengerStore.voteGroupPoll(paramId(req.params.messageId), meId, optionId);
  if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
  const showDeletedMod = Boolean(messengerStore.getPrefs(meId, `group:${groupId}`).showDeletedMod && canManageGroup(member));
  return res.json({ message: serializeGroupMessage(updated, meId, member, showDeletedMod) });
});

chatsRouter.post("/groups/:groupId/messages/:messageId/poll-close", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const member = messengerStore.getMember(groupId, meId);
  if (!member || !canManageGroup(member)) return res.status(403).json({ error: "FORBIDDEN" });
  const updated = messengerStore.toggleGroupPollClosed(paramId(req.params.messageId), true);
  if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
  const u = userStore.findById(meId);
  const who = u ? fio(u) : "Администратор";
  messengerStore.appendGroupSystemMessage({
    groupId,
    topicId: updated.topicId,
    text: `Опрос «${updated.poll?.question ?? "…"}» закрыт (${who})`,
  });
  const showDeletedMod = Boolean(messengerStore.getPrefs(meId, `group:${groupId}`).showDeletedMod && canManageGroup(member));
  return res.json({ message: serializeGroupMessage(updated, meId, member, showDeletedMod) });
});

chatsRouter.get("/groups/:groupId/pinned", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const groupId = paramId(req.params.groupId);
  const member = messengerStore.getMember(groupId, meId);
  if (!member) return res.status(403).json({ error: "FORBIDDEN" });
  const showDeletedMod = Boolean(messengerStore.getPrefs(meId, `group:${groupId}`).showDeletedMod && canManageGroup(member));
  const list = messengerStore.listPinnedGroup(groupId).map((m) => serializeGroupMessage(m, meId, member, showDeletedMod));
  return res.json({ messages: list });
});

/** --- Communitoria communities --- */

chatsRouter.get("/communities", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const list = messengerStore.listCommunitiesForUser(meId).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    avatarEmoji: c.avatarEmoji,
    avatarImageUrl: c.avatarImageUrl,
    metaType: c.metaType,
    linkedGroupCount: c.linkedGroupIds.length,
    isAdmin: canManageCommunity(c, meId),
  }));
  return res.json({ communities: list });
});

chatsRouter.post("/communities", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const { name, description, avatarEmoji, metaType, existingGroupIds, linkedClassId, linkedSubjectId, linkedProjectId } =
    req.body ?? {};
  if (typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "NAME_REQUIRED" });
  const mt: CommunitoriaCommunityMetaType =
    metaType === "school" || metaType === "class" || metaType === "subject" || metaType === "project" ? metaType : "other";
  const extra = Array.isArray(existingGroupIds) ? existingGroupIds.filter((x: unknown) => typeof x === "string") : [];
  const created = messengerStore.createCommunity({
    creatorUserId: meId,
    name: name.trim(),
    description: typeof description === "string" ? description : null,
    avatarEmoji: typeof avatarEmoji === "string" ? avatarEmoji : "🏛️",
    metaType: mt,
    existingGroupIds: extra,
    linkedClassId: typeof linkedClassId === "string" ? linkedClassId : null,
    linkedSubjectId: typeof linkedSubjectId === "string" ? linkedSubjectId : null,
    linkedProjectId: typeof linkedProjectId === "string" ? linkedProjectId : null,
  });
  if (!created) return res.status(500).json({ error: "CREATE_FAILED" });
  return res.status(201).json({
    community: serializeCommunity(created.community),
    announcementGroupId: created.announcementGroupId,
  });
});

chatsRouter.get("/communities/:communityId", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const communityId = paramId(req.params.communityId);
  const c = messengerStore.findCommunity(communityId);
  if (!c) return res.status(404).json({ error: "NOT_FOUND" });
  const allowed = messengerStore.listCommunitiesForUser(meId).some((x) => x.id === communityId);
  if (!allowed) return res.status(403).json({ error: "FORBIDDEN" });
  const groups = c.linkedGroupIds.map((gid) => {
    const g = messengerStore.findGroup(gid);
    return g
      ? {
          groupId: g.id,
          title: g.title,
          description: g.description,
          isAnnouncement: gid === c.announcementGroupId,
        }
      : { groupId: gid, title: gid, description: null, isAnnouncement: false };
  });
  return res.json({
    community: serializeCommunity(c),
    groups,
    canManage: canManageCommunity(c, meId),
  });
});

chatsRouter.post("/communities/:communityId/broadcast", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const communityId = paramId(req.params.communityId);
  const c = messengerStore.findCommunity(communityId);
  if (!c) return res.status(404).json({ error: "NOT_FOUND" });
  if (!canManageCommunity(c, meId)) return res.status(403).json({ error: "FORBIDDEN" });
  const { text, groupIds, sender } = req.body ?? {};
  const bodyText = typeof text === "string" ? text.trim() : "";
  if (!bodyText) return res.status(400).json({ error: "TEXT_REQUIRED" });
  const ids = Array.isArray(groupIds) ? groupIds.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length === 0) return res.status(400).json({ error: "GROUP_IDS_REQUIRED" });
  const linked = new Set(c.linkedGroupIds);
  for (const gid of ids) {
    if (!linked.has(gid)) return res.status(400).json({ error: "INVALID_GROUP" });
    const mem = messengerStore.getMember(gid, meId);
    if (!mem) return res.status(403).json({ error: "NOT_MEMBER" });
  }
  let senderId = meId;
  if (sender === "bot") {
    if (!c.botEnabled) return res.status(400).json({ error: "BOT_DISABLED" });
    const bot = userStore.findSystemBot();
    if (!bot) return res.status(500).json({ error: "BOT_MISSING" });
    senderId = bot.id;
  } else if (sender !== undefined && sender !== null && sender !== "user") {
    return res.status(400).json({ error: "INVALID_SENDER" });
  }
  const sentToGroupIds: string[] = [];
  for (const gid of ids) {
    const topics = messengerStore.listTopics(gid);
    const def = topics.find((t) => t.isDefault) ?? topics[0];
    if (!def) continue;
    messengerStore.createGroupMessage({
      groupId: gid,
      topicId: def.id,
      senderUserId: senderId,
      text: bodyText,
    });
    sentToGroupIds.push(gid);
  }
  if (sentToGroupIds.length === 0) return res.status(500).json({ error: "NO_TOPICS" });
  return res.status(201).json({ ok: true, sentToGroupIds });
});

chatsRouter.patch("/communities/:communityId", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const communityId = paramId(req.params.communityId);
  const c = messengerStore.findCommunity(communityId);
  if (!c) return res.status(404).json({ error: "NOT_FOUND" });
  if (!canManageCommunity(c, meId)) return res.status(403).json({ error: "FORBIDDEN" });
  const {
    name,
    description,
    avatarEmoji,
    avatarImageUrl,
    botEnabled,
    botConfig,
    linkedGroupIds,
    metaType,
    adminIds,
  } = req.body ?? {};
  const patch: Parameters<typeof messengerStore.patchCommunity>[1] = {};
  if (typeof name === "string" && name.trim()) patch.name = name.trim();
  if (typeof description === "string") patch.description = description;
  if (typeof avatarEmoji === "string" || avatarEmoji === null) patch.avatarEmoji = avatarEmoji;
  if (typeof avatarImageUrl === "string" || avatarImageUrl === null) patch.avatarImageUrl = avatarImageUrl;
  if (typeof botEnabled === "boolean") patch.botEnabled = botEnabled;
  if (botConfig && typeof botConfig === "object") patch.botConfig = botConfig as CommunitoriaCommunity["botConfig"];
  if (Array.isArray(linkedGroupIds)) patch.linkedGroupIds = linkedGroupIds.filter((x: unknown) => typeof x === "string");
  if (metaType === "school" || metaType === "class" || metaType === "subject" || metaType === "project" || metaType === "other") {
    patch.metaType = metaType;
  }
  if (Array.isArray(adminIds)) patch.adminIds = adminIds.filter((x: unknown) => typeof x === "string");
  const next = messengerStore.patchCommunity(communityId, patch);
  if (!next) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({ community: serializeCommunity(next) });
});

chatsRouter.post("/communities/:communityId/invite-links", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const communityId = paramId(req.params.communityId);
  const c = messengerStore.findCommunity(communityId);
  if (!c || !canManageCommunity(c, meId)) return res.status(403).json({ error: "FORBIDDEN" });
  const { label, password, maxUses, expiresAt } = req.body ?? {};
  const r = messengerStore.addCommunityInviteLink(communityId, {
    label: typeof label === "string" ? label : undefined,
    password: typeof password === "string" && password.trim() ? password : null,
    maxUses: typeof maxUses === "number" ? maxUses : null,
    expiresAt: typeof expiresAt === "string" ? expiresAt : null,
  });
  if (!r) return res.status(404).json({ error: "NOT_FOUND" });
  const base = typeof req.get === "function" ? `${req.protocol}://${req.get("host") ?? ""}` : "";
  const { password: _omit, ...safe } = r.link;
  return res.status(201).json({
    link: {
      ...safe,
      url: `${base}/florium?communityJoin=${encodeURIComponent(r.link.token)}`,
      hasPassword: Boolean(r.link.password),
    },
  });
});

chatsRouter.post("/communities/join/:token", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const token = paramId(req.params.token);
  const bodyPassword = typeof req.body?.password === "string" ? req.body.password : "";
  const joined = messengerStore.joinCommunityWithLink(meId, token, bodyPassword);
  if (!joined) return res.status(403).json({ error: "JOIN_FAILED" });

  // Bot behavior (simplified):
  // - autoWelcome: when joining a community via invite link, post welcome into announcement group (default topic).
  try {
    if (joined.botEnabled && joined.botConfig?.autoWelcome) {
      const bot = userStore.findSystemBot();
      if (bot && joined.announcementGroupId) {
        const topics = messengerStore.listTopics(joined.announcementGroupId);
        const def = topics.find((t) => t.isDefault) ?? topics[0];
        if (def) {
          const welcomeText = joined.botConfig?.welcomeTemplate?.trim() || "Добро пожаловать в сообщество!";
          messengerStore.createGroupMessage({
            groupId: joined.announcementGroupId,
            topicId: def.id,
            senderUserId: bot.id,
            text: welcomeText,
          });
        }
      }
    }
  } catch {
    // ignore bot errors
  }

  return res.json({ communityId: joined.id });
});

chatsRouter.post("/join/:token", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const token = paramId(req.params.token);
  const resolved = messengerStore.resolveInviteForToken(token);
  if (!resolved) return res.status(404).json({ error: "NOT_FOUND" });
  const { group: g, expectedPassword } = resolved;
  const bodyPassword = typeof req.body?.password === "string" ? req.body.password : "";
  if (expectedPassword && bodyPassword !== expectedPassword) {
    return res.status(403).json({ error: "INVITE_PASSWORD_REQUIRED" });
  }
  messengerStore.addMember(g.id, meId, "member");
  const topics = messengerStore.listTopics(g.id);
  const def = topics.find((t) => t.isDefault) ?? topics[0];
  const u = userStore.findById(meId);
  const name = u ? fio(u) : "Пользователь";
  if (def) {
    messengerStore.appendGroupSystemMessage({
      groupId: g.id,
      topicId: def.id,
      text: `${name} присоединился к группе`,
    });
  }

  // Bot behavior (simplified):
  // - autoWelcome: if the group belongs to a community with autoWelcome enabled, bot posts welcome message.
  try {
    const comm = messengerStore.communityForGroup(g.id);
    const botEnabled = Boolean(comm?.botEnabled && comm.botConfig?.autoWelcome);
    const bot = userStore.findSystemBot();
    if (botEnabled && bot && def) {
      const welcomeText = comm?.botConfig?.welcomeTemplate?.trim() || "Добро пожаловать!";
      messengerStore.createGroupMessage({
        groupId: g.id,
        topicId: def.id,
        senderUserId: bot.id,
        text: welcomeText,
      });
    }
  } catch {
    // ignore
  }
  return res.json({ groupId: g.id });
});

chatsRouter.get("/search/messages", requireAuth, (req: AuthedRequest, res) => {
  if (!requireChatsAccess(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const meId = req.auth?.userId;
  if (!meId) return res.status(403).json({ error: "FORBIDDEN" });
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const peerUserId = typeof req.query.peerUserId === "string" ? req.query.peerUserId : "";
  const groupId = typeof req.query.groupId === "string" ? req.query.groupId : "";
  const topicId = typeof req.query.topicId === "string" ? req.query.topicId : "";
  if (!q || q.length < 2) return res.json({ messages: [] });
  if (peerUserId) {
    const raw = messengerStore.listDirectBetween(meId, peerUserId).filter((m) => !m.deletedForAll && m.text.toLowerCase().includes(q));
    return res.json({ messages: raw.map((m) => serializeDirectMessage(m, meId)) });
  }
  if (groupId && topicId) {
    const member = messengerStore.getMember(groupId, meId);
    if (!member) return res.status(403).json({ error: "FORBIDDEN" });
    const showDeletedMod = Boolean(messengerStore.getPrefs(meId, `group:${groupId}`).showDeletedMod && canManageGroup(member));
    const raw = messengerStore
      .listGroupMessages(groupId, topicId)
      .filter((m) => !m.deletedForAll && m.text.toLowerCase().includes(q));
    return res.json({ messages: raw.map((m) => serializeGroupMessage(m, meId, member, showDeletedMod)) });
  }
  if (groupId && !topicId) {
    const member = messengerStore.getMember(groupId, meId);
    if (!member) return res.status(403).json({ error: "FORBIDDEN" });
    const showDeletedMod = Boolean(messengerStore.getPrefs(meId, `group:${groupId}`).showDeletedMod && canManageGroup(member));
    const topicIds = messengerStore.listTopics(groupId).map((t) => t.id);
    const raw: GroupMessage[] = [];
    for (const tid of topicIds) {
      raw.push(...messengerStore.listGroupMessages(groupId, tid).filter((m) => !m.deletedForAll && m.text.toLowerCase().includes(q)));
    }
    raw.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return res.json({ messages: raw.map((m) => serializeGroupMessage(m, meId, member, showDeletedMod)) });
  }
  return res.status(400).json({ error: "PARAMS_REQUIRED" });
});
