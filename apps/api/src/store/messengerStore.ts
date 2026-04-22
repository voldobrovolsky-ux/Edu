import { randomBytes, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonArrayFile, readJsonFile, writeJsonFile } from "./jsonFileStore.js";
import type {
  ChatGroup,
  CommunitoriaCommunity,
  CommunitoriaCommunityBotConfig,
  CommunitoriaCommunityInviteLink,
  CommunitoriaCommunityMetaType,
  CommunitoriaGroupMeta,
  DirectMessage,
  GroupMember,
  GroupMemberRole,
  GroupTopic,
  GroupMessage,
  MessengerStateV1,
  MessageAttachment,
  PerChatPrefs,
  PollState,
} from "../types/messenger.js";
import {
  defaultCommunitoriaCommunityBotConfig,
  defaultCommunitoriaGroupMeta,
  emptyMessengerState,
  GROUP_SYSTEM_SENDER,
} from "../types/messenger.js";
import type { StoredUser } from "../types/user.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "messenger.json");
const LEGACY_CHATS_PATH = join(__dirname, "..", "..", "data", "chats.json");

type LegacyChatMessage = {
  id: string;
  fromUserId: string;
  toUserId: string;
  text: string;
  createdAt: string;
  isRead?: boolean;
  readAt?: string | null;
};

function directPairKey(a: string, b: string): string {
  const [x, y] = a < b ? [a, b] : [b, a];
  return `${x}:${y}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function genToken(): string {
  return randomBytes(16).toString("hex");
}

const SYSTEM_GROUP_KEYS = {
  teachers: "teachers",
  administration: "administration",
  parents: "parents",
} as const;

function hasRole(u: StoredUser, role: string): boolean {
  return u.primaryRole === role || u.secondaryRoles.includes(role as any);
}

class MessengerStore {
  private cache: MessengerStateV1 | null = null;

  private load(): MessengerStateV1 {
    if (this.cache) return this.cache;
    const empty = emptyMessengerState();
    const raw = readJsonFile<Partial<MessengerStateV1>>(DATA_PATH, {});
    const base: MessengerStateV1 = {
      ...empty,
      ...raw,
      version: 1,
      directMessages: raw.directMessages ?? [],
      groups: raw.groups ?? [],
      groupMembers: raw.groupMembers ?? [],
      topics: raw.topics ?? [],
      groupMessages: raw.groupMessages ?? [],
      userChatPrefs: raw.userChatPrefs ?? {},
      presence: raw.presence ?? {},
      communities: raw.communities ?? [],
    };
    // Мягкая миграция новых полей групп/тем.
    base.groups = base.groups.map((g) => ({
      ...g,
      localDisplayNames: g.localDisplayNames ?? {},
      isSystemGroup: Boolean(g.isSystemGroup),
      systemGroupKey: g.systemGroupKey ?? null,
      groupMeta: g.groupMeta ?? defaultCommunitoriaGroupMeta(),
      communityId: g.communityId ?? null,
    }));
    base.topics = base.topics.map((t) => ({ ...t, avatarImageUrl: t.avatarImageUrl ?? null }));
    let migrated = false;
    if (base.directMessages.length === 0) {
      const legacy = this.migrateLegacyDirect();
      if (legacy.length) {
        base.directMessages = legacy;
        migrated = true;
      }
    }
    this.cache = base;
    if (migrated) writeJsonFile(DATA_PATH, base);
    return base;
  }

  private migrateLegacyDirect(): DirectMessage[] {
    const legacy = readJsonArrayFile<LegacyChatMessage>(LEGACY_CHATS_PATH);
    return legacy.map((m) => ({
      id: m.id,
      fromUserId: m.fromUserId,
      toUserId: m.toUserId,
      text: m.text,
      createdAt: m.createdAt,
      isRead: Boolean(m.isRead),
      readAt: m.readAt ?? null,
      kind: "text",
    }));
  }

  private save(next: MessengerStateV1): void {
    this.cache = next;
    writeJsonFile(DATA_PATH, next);
  }

  invalidateCache(): void {
    this.cache = null;
  }

  /** --- Direct --- */
  listDirectBetween(a: string, b: string): DirectMessage[] {
    const st = this.load();
    return st.directMessages
      .filter((m) => directPairKey(m.fromUserId, m.toUserId) === directPairKey(a, b))
      .slice()
      .sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  }

  /**
   * Получатель authUserId открыл диалог с peerUserId (query в GET /messages).
   * Помечает сообщения peer→auth как доставленные на устройство получателя.
   */
  markDirectDeliveredWhenRecipientFetched(authUserId: string, peerUserId: string): void {
    const st = this.load();
    let changed = false;
    st.directMessages = st.directMessages.map((m) => {
      if (m.fromUserId === peerUserId && m.toUserId === authUserId && !m.deliveredToRecipient) {
        changed = true;
        return { ...m, deliveredToRecipient: true };
      }
      return m;
    });
    if (changed) this.save(st);
  }

  createDirectMessage(args: {
    fromUserId: string;
    toUserId: string;
    text: string;
    attachments?: MessageAttachment[];
    poll?: PollState;
    mentionUserIds?: string[];
    kind?: DirectMessage["kind"];
    replyToMessageId?: string | null;
  }): DirectMessage {
    const st = this.load();
    const kind = args.poll ? "poll" : args.attachments?.length ? "file" : args.kind ?? "text";
    const msg: DirectMessage = {
      id: randomUUID(),
      fromUserId: args.fromUserId,
      toUserId: args.toUserId,
      text: args.text,
      createdAt: nowIso(),
      isRead: false,
      readAt: null,
      kind,
      deliveryStatus: "sent",
      attachments: args.attachments,
      poll: args.poll,
      mentionUserIds: args.mentionUserIds,
      reactions: {},
      replyToMessageId: args.replyToMessageId?.trim() ? args.replyToMessageId.trim() : undefined,
    };
    st.directMessages.push(msg);
    this.save(st);
    return msg;
  }

  markDirectRead(viewerUserId: string, otherUserId: string): { updatedCount: number; messages: DirectMessage[] } {
    const st = this.load();
    const readAt = nowIso();
    let updatedCount = 0;
    st.directMessages = st.directMessages.map((m) => {
      if (m.toUserId !== viewerUserId || m.fromUserId !== otherUserId || m.isRead) return m;
      updatedCount += 1;
      return { ...m, isRead: true, readAt };
    });
    this.save(st);
    return {
      updatedCount,
      messages: this.listDirectBetween(viewerUserId, otherUserId),
    };
  }

  countUnreadIncomingForUser(viewerUserId: string): number {
    const st = this.load();
    return st.directMessages.filter((m) => m.toUserId === viewerUserId && !m.isRead).length;
  }

  softDeleteDirectMessage(messageId: string, byUserId: string): DirectMessage | null {
    const st = this.load();
    const idx = st.directMessages.findIndex((m) => m.id === messageId);
    if (idx < 0) return null;
    const m = st.directMessages[idx]!;
    if (m.fromUserId !== byUserId) return null;
    const next: DirectMessage = {
      ...m,
      deletedForAll: true,
      deletedAt: nowIso(),
      text: "",
      attachments: undefined,
      poll: undefined,
    };
    st.directMessages[idx] = next;
    this.save(st);
    return next;
  }

  voteDirectPoll(messageId: string, voterUserId: string, optionId: string): DirectMessage | null {
    const st = this.load();
    const idx = st.directMessages.findIndex((m) => m.id === messageId);
    if (idx < 0) return null;
    const m = st.directMessages[idx]!;
    if (!m.poll || m.pollClosed) return null;
    const votes = { ...m.poll.votes, [voterUserId]: optionId };
    const poll: PollState = { ...m.poll, votes };
    const next = { ...m, poll };
    st.directMessages[idx] = next;
    this.save(st);
    return next;
  }

  toggleDirectReaction(messageId: string, userId: string, emoji: string): DirectMessage | null {
    const st = this.load();
    const idx = st.directMessages.findIndex((m) => m.id === messageId);
    if (idx < 0) return null;
    const m = st.directMessages[idx]!;
    const reactions = { ...(m.reactions ?? {}) };
    const list = new Set(reactions[emoji] ?? []);
    if (list.has(userId)) list.delete(userId);
    else list.add(userId);
    reactions[emoji] = [...list];
    if (reactions[emoji]!.length === 0) delete reactions[emoji];
    const next = { ...m, reactions };
    st.directMessages[idx] = next;
    this.save(st);
    return next;
  }

  pinDirectMessage(messageId: string, pinned: boolean): DirectMessage | null {
    const st = this.load();
    const idx = st.directMessages.findIndex((m) => m.id === messageId);
    if (idx < 0) return null;
    const m = st.directMessages[idx]!;
    st.directMessages[idx] = { ...m, pinned };
    this.save(st);
    return st.directMessages[idx]!;
  }

  toggleDirectPollClosed(messageId: string, closed: boolean): DirectMessage | null {
    const st = this.load();
    const idx = st.directMessages.findIndex((m) => m.id === messageId);
    if (idx < 0) return null;
    const m = st.directMessages[idx]!;
    if (!m.poll) return null;
    st.directMessages[idx] = { ...m, pollClosed: closed };
    this.save(st);
    return st.directMessages[idx]!;
  }

  appendGroupSystemMessage(args: { groupId: string; topicId: string; text: string }): GroupMessage {
    const st = this.load();
    const msg: GroupMessage = {
      id: randomUUID(),
      groupId: args.groupId,
      topicId: args.topicId,
      senderUserId: GROUP_SYSTEM_SENDER,
      text: args.text,
      createdAt: nowIso(),
      kind: "system",
    };
    st.groupMessages.push(msg);
    this.save(st);
    return msg;
  }

  /** --- Groups --- */
  findGroup(groupId: string): ChatGroup | undefined {
    return this.load().groups.find((g) => g.id === groupId);
  }

  listGroupsForUser(userId: string): ChatGroup[] {
    const st = this.load();
    const ids = new Set(st.groupMembers.filter((m) => m.userId === userId).map((m) => m.groupId));
    return st.groups.filter((g) => ids.has(g.id));
  }

  createGroup(args: {
    title: string;
    description: string | null;
    avatarEmoji: string | null;
    avatarImageUrl: string | null;
    creatorUserId: string;
    memberUserIds: string[];
  }): { group: ChatGroup; topic: GroupTopic } {
    const st = this.load();
    const group: ChatGroup = {
      id: randomUUID(),
      title: args.title.trim(),
      description: args.description?.trim() || null,
      avatarEmoji: args.avatarEmoji,
      avatarImageUrl: args.avatarImageUrl,
      inviteToken: genToken(),
      createdAt: nowIso(),
      createdByUserId: args.creatorUserId,
      invitePolicy: "all",
      localDisplayNames: {},
      isSystemGroup: false,
      systemGroupKey: null,
      groupMeta: defaultCommunitoriaGroupMeta(),
    };
    const topic: GroupTopic = {
      id: randomUUID(),
      groupId: group.id,
      name: "Общий",
      description: null,
      emoji: "💬",
      archived: false,
      isDefault: true,
    };
    const members: GroupMember[] = [];
    const allIds = new Set([args.creatorUserId, ...args.memberUserIds]);
    for (const uid of allIds) {
      members.push({
        groupId: group.id,
        userId: uid,
        role: uid === args.creatorUserId ? "owner" : "member",
        mutedUntil: null,
        lastReadByTopic: {},
      });
    }
    st.groups.push(group);
    st.topics.push(topic);
    st.groupMembers.push(...members);
    this.save(st);
    return { group, topic };
  }

  updateGroup(
    groupId: string,
    patch: Partial<Pick<ChatGroup, "title" | "description" | "avatarEmoji" | "avatarImageUrl" | "invitePolicy">>,
  ): ChatGroup | null {
    const st = this.load();
    const idx = st.groups.findIndex((g) => g.id === groupId);
    if (idx < 0) return null;
    const g = st.groups[idx]!;
    const cleaned = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<ChatGroup>;
    st.groups[idx] = { ...g, ...cleaned };
    this.save(st);
    return st.groups[idx]!;
  }

  regenerateInviteToken(groupId: string): ChatGroup | null {
    const st = this.load();
    const idx = st.groups.findIndex((g) => g.id === groupId);
    if (idx < 0) return null;
    st.groups[idx] = { ...st.groups[idx]!, inviteToken: genToken() };
    this.save(st);
    return st.groups[idx]!;
  }

  getMember(groupId: string, userId: string): GroupMember | undefined {
    return this.load().groupMembers.find((m) => m.groupId === groupId && m.userId === userId);
  }

  setMemberRole(groupId: string, userId: string, role: GroupMemberRole): GroupMember | null {
    const st = this.load();
    const idx = st.groupMembers.findIndex((m) => m.groupId === groupId && m.userId === userId);
    if (idx < 0) return null;
    const cur = st.groupMembers[idx]!;
    if (cur.role === "owner" && role !== "owner") {
      // нельзя снять владельца через этот метод
      return null;
    }
    st.groupMembers[idx] = { ...cur, role };
    this.save(st);
    return st.groupMembers[idx]!;
  }

  addMember(groupId: string, userId: string, role: GroupMemberRole = "member"): GroupMember | null {
    const st = this.load();
    if (st.groupMembers.some((m) => m.groupId === groupId && m.userId === userId)) return this.getMember(groupId, userId)!;
    const m: GroupMember = { groupId, userId, role, mutedUntil: null, lastReadByTopic: {} };
    st.groupMembers.push(m);
    this.save(st);
    return m;
  }

  removeMember(groupId: string, userId: string): boolean {
    const st = this.load();
    const m = st.groupMembers.find((x) => x.groupId === groupId && x.userId === userId);
    if (!m || m.role === "owner") return false;
    st.groupMembers = st.groupMembers.filter((x) => !(x.groupId === groupId && x.userId === userId));
    this.save(st);
    return true;
  }

  setMute(groupId: string, userId: string, mutedUntil: string | null): GroupMember | null {
    const st = this.load();
    const idx = st.groupMembers.findIndex((m) => m.groupId === groupId && m.userId === userId);
    if (idx < 0) return null;
    st.groupMembers[idx] = { ...st.groupMembers[idx]!, mutedUntil };
    this.save(st);
    return st.groupMembers[idx]!;
  }

  listTopics(groupId: string): GroupTopic[] {
    return this.load().topics.filter((t) => t.groupId === groupId && !t.archived).sort((a, b) => (a.isDefault ? -1 : b.isDefault ? 1 : a.name.localeCompare(b.name, "ru")));
  }

  createTopic(groupId: string, name: string, description: string | null, emoji: string): GroupTopic | null {
    const st = this.load();
    if (!st.groups.some((g) => g.id === groupId)) return null;
    const t: GroupTopic = {
      id: randomUUID(),
      groupId,
      name: name.trim(),
      description: description?.trim() || null,
      emoji: emoji || "📌",
      avatarImageUrl: null,
      archived: false,
      isDefault: false,
    };
    st.topics.push(t);
    this.save(st);
    return t;
  }

  archiveTopic(topicId: string, archived: boolean): GroupTopic | null {
    const st = this.load();
    const idx = st.topics.findIndex((t) => t.id === topicId);
    if (idx < 0) return null;
    const t = st.topics[idx]!;
    if (t.isDefault) return null;
    st.topics[idx] = { ...t, archived };
    this.save(st);
    return st.topics[idx]!;
  }

  deleteTopic(topicId: string): boolean {
    const st = this.load();
    const topic = st.topics.find((t) => t.id === topicId);
    if (!topic || topic.isDefault) return false;
    st.topics = st.topics.filter((t) => t.id !== topicId);
    st.groupMessages = st.groupMessages.filter((m) => m.topicId !== topicId);
    this.save(st);
    return true;
  }

  setLocalDisplayName(groupId: string, userId: string, localName: string | null): ChatGroup | null {
    const st = this.load();
    const idx = st.groups.findIndex((g) => g.id === groupId);
    if (idx < 0) return null;
    const g = st.groups[idx]!;
    const map = { ...(g.localDisplayNames ?? {}) };
    if (localName && localName.trim()) map[userId] = localName.trim();
    else delete map[userId];
    st.groups[idx] = { ...g, localDisplayNames: map };
    this.save(st);
    return st.groups[idx]!;
  }

  syncSystemGroups(users: StoredUser[], systemActorUserId: string): void {
    const st = this.load();
    const byKey = new Map<string, ChatGroup>();
    for (const g of st.groups) {
      if (g.isSystemGroup && g.systemGroupKey) byKey.set(g.systemGroupKey, g);
    }

    const ensureGroup = (key: "teachers" | "administration" | "parents", title: string, emoji: string) => {
      let g = byKey.get(key);
      if (!g) {
        g = {
          id: randomUUID(),
          title,
          description: "Системная автогруппа",
          avatarEmoji: emoji,
          avatarImageUrl: null,
          inviteToken: genToken(),
          createdAt: nowIso(),
          createdByUserId: systemActorUserId,
          invitePolicy: "school_admins",
          localDisplayNames: {},
          isSystemGroup: true,
          systemGroupKey: key,
          groupMeta: defaultCommunitoriaGroupMeta(),
        };
        st.groups.push(g);
        const topic: GroupTopic = {
          id: randomUUID(),
          groupId: g.id,
          name: "Общий",
          description: null,
          emoji: "💬",
          avatarImageUrl: null,
          archived: false,
          isDefault: true,
        };
        st.topics.push(topic);
      }
      byKey.set(key, g);
    };

    ensureGroup(SYSTEM_GROUP_KEYS.teachers, "Педагоги", "👩‍🏫");
    ensureGroup(SYSTEM_GROUP_KEYS.administration, "Администрация", "🏫");
    ensureGroup(SYSTEM_GROUP_KEYS.parents, "Родители", "👨‍👩‍👧");

    const wantedByGroupId = new Map<string, Set<string>>();
    for (const g of byKey.values()) wantedByGroupId.set(g.id, new Set<string>());
    for (const u of users) {
      if (u.primaryRole === "bot") continue;
      if (hasRole(u, "teacher")) wantedByGroupId.get(byKey.get(SYSTEM_GROUP_KEYS.teachers)!.id)!.add(u.id);
      if (u.primaryRole === "parent" || u.secondaryRoles.includes("parent")) wantedByGroupId.get(byKey.get(SYSTEM_GROUP_KEYS.parents)!.id)!.add(u.id);
      if (
        u.primaryRole === "director" ||
        u.primaryRole === "head_teacher" ||
        u.primaryRole === "sysadmin" ||
        u.username.toLowerCase() === "admin"
      ) {
        wantedByGroupId.get(byKey.get(SYSTEM_GROUP_KEYS.administration)!.id)!.add(u.id);
      }
    }

    st.groupMembers = st.groupMembers.filter((m) => {
      const g = st.groups.find((x) => x.id === m.groupId);
      if (!g?.isSystemGroup) return true;
      return wantedByGroupId.get(g.id)?.has(m.userId) ?? false;
    });
    for (const [gid, usersSet] of wantedByGroupId.entries()) {
      for (const uid of usersSet) {
        if (!st.groupMembers.some((m) => m.groupId === gid && m.userId === uid)) {
          st.groupMembers.push({
            groupId: gid,
            userId: uid,
            role: "member",
            mutedUntil: null,
            lastReadByTopic: {},
          });
        }
      }
    }
    this.save(st);
  }

  removeUserEverywhere(userId: string): void {
    const st = this.load();
    st.directMessages = st.directMessages.filter((m) => m.fromUserId !== userId && m.toUserId !== userId);
    st.groupMembers = st.groupMembers.filter((m) => m.userId !== userId);
    st.groupMessages = st.groupMessages.filter((m) => m.senderUserId !== userId);
    st.groups = st.groups.map((g) => {
      const map = { ...(g.localDisplayNames ?? {}) };
      delete map[userId];
      return { ...g, localDisplayNames: map };
    });
    this.save(st);
  }

  listGroupMessages(groupId: string, topicId: string): GroupMessage[] {
    const st = this.load();
    return st.groupMessages
      .filter((m) => m.groupId === groupId && m.topicId === topicId)
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  createGroupMessage(args: {
    groupId: string;
    topicId: string;
    senderUserId: string;
    text: string;
    attachments?: MessageAttachment[];
    poll?: PollState;
    mentionUserIds?: string[];
    replyToMessageId?: string | null;
  }): GroupMessage {
    const st = this.load();
    const kind: GroupMessage["kind"] = args.poll ? "poll" : args.attachments?.length ? "file" : "text";
    const msg: GroupMessage = {
      id: randomUUID(),
      groupId: args.groupId,
      topicId: args.topicId,
      senderUserId: args.senderUserId,
      text: args.text,
      createdAt: nowIso(),
      kind,
      attachments: args.attachments,
      poll: args.poll,
      mentionUserIds: args.mentionUserIds,
      reactions: {},
      replyToMessageId: args.replyToMessageId?.trim() ? args.replyToMessageId.trim() : undefined,
    };
    st.groupMessages.push(msg);
    this.save(st);
    return msg;
  }

  markGroupTopicRead(groupId: string, topicId: string, userId: string, at: string): void {
    const st = this.load();
    const idx = st.groupMembers.findIndex((m) => m.groupId === groupId && m.userId === userId);
    if (idx < 0) return;
    const m = st.groupMembers[idx]!;
    const lastReadByTopic = { ...m.lastReadByTopic, [topicId]: at };
    st.groupMembers[idx] = { ...m, lastReadByTopic };
    this.save(st);
  }

  softDeleteGroupMessage(messageId: string, byUserId: string): GroupMessage | null {
    const st = this.load();
    const idx = st.groupMessages.findIndex((m) => m.id === messageId);
    if (idx < 0) return null;
    const m = st.groupMessages[idx]!;
    if (m.senderUserId !== byUserId) return null;
    const next: GroupMessage = {
      ...m,
      deletedForAll: true,
      deletedAt: nowIso(),
      modText: m.text,
      modAttachments: m.attachments ? [...m.attachments] : null,
      text: "",
      attachments: undefined,
      poll: undefined,
    };
    st.groupMessages[idx] = next;
    this.save(st);
    return next;
  }

  adminDeleteGroupMessage(messageId: string): GroupMessage | null {
    const st = this.load();
    const idx = st.groupMessages.findIndex((m) => m.id === messageId);
    if (idx < 0) return null;
    const m = st.groupMessages[idx]!;
    const next: GroupMessage = {
      ...m,
      deletedForAll: true,
      deletedAt: nowIso(),
      modText: m.modText ?? m.text,
      modAttachments: m.modAttachments ?? (m.attachments ? [...m.attachments] : null),
      text: "",
      attachments: undefined,
      poll: undefined,
    };
    st.groupMessages[idx] = next;
    this.save(st);
    return next;
  }

  voteGroupPoll(messageId: string, voterUserId: string, optionId: string): GroupMessage | null {
    const st = this.load();
    const idx = st.groupMessages.findIndex((m) => m.id === messageId);
    if (idx < 0) return null;
    const m = st.groupMessages[idx]!;
    if (!m.poll || m.pollClosed) return null;
    const votes = { ...m.poll.votes, [voterUserId]: optionId };
    const poll: PollState = { ...m.poll, votes };
    st.groupMessages[idx] = { ...m, poll };
    this.save(st);
    return st.groupMessages[idx]!;
  }

  toggleGroupPollClosed(messageId: string, closed: boolean): GroupMessage | null {
    const st = this.load();
    const idx = st.groupMessages.findIndex((m) => m.id === messageId);
    if (idx < 0) return null;
    st.groupMessages[idx] = { ...st.groupMessages[idx]!, pollClosed: closed };
    this.save(st);
    return st.groupMessages[idx]!;
  }

  toggleGroupReaction(messageId: string, userId: string, emoji: string): GroupMessage | null {
    const st = this.load();
    const idx = st.groupMessages.findIndex((m) => m.id === messageId);
    if (idx < 0) return null;
    const m = st.groupMessages[idx]!;
    const reactions = { ...(m.reactions ?? {}) };
    const list = new Set(reactions[emoji] ?? []);
    if (list.has(userId)) list.delete(userId);
    else list.add(userId);
    reactions[emoji] = [...list];
    if (reactions[emoji]!.length === 0) delete reactions[emoji];
    st.groupMessages[idx] = { ...m, reactions };
    this.save(st);
    return st.groupMessages[idx]!;
  }

  pinGroupMessage(messageId: string, pinned: boolean): GroupMessage | null {
    const st = this.load();
    const idx = st.groupMessages.findIndex((m) => m.id === messageId);
    if (idx < 0) return null;
    st.groupMessages[idx] = { ...st.groupMessages[idx]!, pinned };
    this.save(st);
    return st.groupMessages[idx]!;
  }

  findGroupByInviteToken(token: string): ChatGroup | undefined {
    const st = this.load();
    const primary = st.groups.find((g) => g.inviteToken === token);
    if (primary) return primary;
    for (const g of st.groups) {
      if ((g.groupMeta?.inviteLinks ?? []).some((l) => l.token === token)) return g;
    }
    return undefined;
  }

  /** Для вступления: основная ссылка или доп. токен; опциональный пароль на доп. ссылке. */
  resolveInviteForToken(
    token: string,
  ): { group: ChatGroup; expectedPassword: string | null; isPrimary: boolean } | null {
    const st = this.load();
    for (const g of st.groups) {
      if (g.inviteToken === token) return { group: g, expectedPassword: null, isPrimary: true };
      const link = (g.groupMeta?.inviteLinks ?? []).find((l) => l.token === token);
      if (link) return { group: g, expectedPassword: link.password?.trim() ? link.password : null, isPrimary: false };
    }
    return null;
  }

  addGroupInviteLink(
    groupId: string,
    args: { label?: string; password?: string | null },
  ): {
    link: { id: string; label?: string; token: string; createdAt: string; password?: string | null };
  } | null {
    const st = this.load();
    const idx = st.groups.findIndex((g) => g.id === groupId);
    if (idx < 0) return null;
    const g = st.groups[idx]!;
    const meta = { ...(g.groupMeta ?? defaultCommunitoriaGroupMeta()) };
    const links = [...(meta.inviteLinks ?? [])];
    const link = {
      id: randomUUID(),
      label: args.label?.trim() || undefined,
      token: genToken(),
      createdAt: nowIso(),
      password: args.password?.trim() ? args.password.trim() : null,
    };
    links.push(link);
    meta.inviteLinks = links;
    st.groups[idx] = { ...g, groupMeta: meta };
    this.save(st);
    return { link };
  }

  patchGroupMeta(groupId: string, patch: Partial<CommunitoriaGroupMeta>): ChatGroup | null {
    const st = this.load();
    const idx = st.groups.findIndex((g) => g.id === groupId);
    if (idx < 0) return null;
    const g = st.groups[idx]!;
    const prev = g.groupMeta ?? defaultCommunitoriaGroupMeta();
    const nextPerms = patch.permissions
      ? { ...(prev.permissions ?? {}), ...patch.permissions }
      : prev.permissions;
    const next: CommunitoriaGroupMeta = {
      ...prev,
      ...patch,
      permissions: nextPerms,
      inviteLinks: patch.inviteLinks !== undefined ? patch.inviteLinks : prev.inviteLinks,
    };
    st.groups[idx] = { ...g, groupMeta: next };
    this.save(st);
    return st.groups[idx]!;
  }

  reassignOwner(groupId: string, newOwnerUserId: string): boolean {
    const st = this.load();
    const members = st.groupMembers.filter((m) => m.groupId === groupId);
    const newM = members.find((m) => m.userId === newOwnerUserId);
    const oldOwner = members.find((m) => m.role === "owner");
    if (!newM || !oldOwner || oldOwner.userId === newOwnerUserId) return false;
    st.groupMembers = st.groupMembers.map((m) => {
      if (m.groupId !== groupId) return m;
      if (m.userId === oldOwner.userId) return { ...m, role: "member" as GroupMemberRole };
      if (m.userId === newOwnerUserId) return { ...m, role: "owner" as GroupMemberRole };
      return m;
    });
    this.save(st);
    return true;
  }

  deleteGroupCascade(groupId: string): boolean {
    const st = this.load();
    const g = st.groups.find((x) => x.id === groupId);
    if (!g || g.isSystemGroup) return false;
    const commId = g.communityId ?? null;
    if (commId) {
      const comms = st.communities ?? [];
      const c = comms.find((x) => x.id === commId);
      if (c) {
        if (c.announcementGroupId === groupId) {
          st.communities = comms.filter((x) => x.id !== commId);
          st.groups = st.groups.map((gr) =>
            gr.communityId === commId ? { ...gr, communityId: null } : gr,
          );
        } else {
          st.communities = comms.map((x) =>
            x.id !== commId
              ? x
              : { ...x, linkedGroupIds: x.linkedGroupIds.filter((id) => id !== groupId) },
          );
        }
      }
    }
    st.groups = st.groups.filter((x) => x.id !== groupId);
    st.groupMembers = st.groupMembers.filter((m) => m.groupId !== groupId);
    st.topics = st.topics.filter((t) => t.groupId !== groupId);
    st.groupMessages = st.groupMessages.filter((m) => m.groupId !== groupId);
    for (const uid of Object.keys(st.userChatPrefs)) {
      const row = st.userChatPrefs[uid];
      if (!row) continue;
      const k = `group:${groupId}`;
      if (row[k]) {
        const { [k]: _, ...rest } = row;
        st.userChatPrefs[uid] = rest;
      }
    }
    this.save(st);
    return true;
  }

  listCommunities(): CommunitoriaCommunity[] {
    return [...(this.load().communities ?? [])];
  }

  findCommunity(communityId: string): CommunitoriaCommunity | undefined {
    return (this.load().communities ?? []).find((c) => c.id === communityId);
  }

  communityForGroup(groupId: string): CommunitoriaCommunity | undefined {
    return (this.load().communities ?? []).find((c) => c.linkedGroupIds.includes(groupId));
  }

  listCommunitiesForUser(userId: string): CommunitoriaCommunity[] {
    return (this.load().communities ?? []).filter((c) => {
      if (c.ownerId === userId || c.adminIds.includes(userId)) return true;
      return c.linkedGroupIds.some((gid) => Boolean(this.getMember(gid, userId)));
    });
  }

  createCommunity(args: {
    creatorUserId: string;
    name: string;
    description: string | null;
    avatarEmoji: string | null;
    metaType: CommunitoriaCommunityMetaType;
    existingGroupIds?: string[];
    linkedClassId?: string | null;
    linkedSubjectId?: string | null;
    linkedProjectId?: string | null;
  }): { community: CommunitoriaCommunity; announcementGroupId: string } | null {
    const st = this.load();
    const title = `${args.name.trim()} · Анонсы`;
    const { group, topic } = this.createGroup({
      title,
      description: args.description,
      avatarEmoji: args.avatarEmoji,
      avatarImageUrl: null,
      creatorUserId: args.creatorUserId,
      memberUserIds: [],
    });
    const communityId = randomUUID();
    this.patchGroupMeta(group.id, {
      permissions: {
        sendMessages: "admins",
        sendDocuments: true,
        addMembers: true,
        pinMessages: true,
        changeGroupSettings: true,
        changeGroupInfo: true,
      },
    });
    const st2 = this.load();
    const gIdx = st2.groups.findIndex((x) => x.id === group.id);
    if (gIdx >= 0) {
      st2.groups[gIdx] = { ...st2.groups[gIdx]!, communityId };
      this.save(st2);
    }
    const linkedGroupIds: string[] = [group.id];
    const extra = args.existingGroupIds ?? [];
    const st3 = this.load();
    for (const gid of extra) {
      if (gid === group.id) continue;
      const gr = st3.groups.find((x) => x.id === gid);
      if (!gr || gr.communityId) continue;
      if (!this.getMember(gid, args.creatorUserId)) continue;
      linkedGroupIds.push(gid);
    }
    st3.groups = st3.groups.map((gr) =>
      linkedGroupIds.includes(gr.id) ? { ...gr, communityId } : gr,
    );
    const community: CommunitoriaCommunity = {
      id: communityId,
      name: args.name.trim(),
      description: args.description?.trim() || null,
      avatarEmoji: args.avatarEmoji,
      avatarImageUrl: null,
      ownerId: args.creatorUserId,
      adminIds: [args.creatorUserId],
      announcementGroupId: group.id,
      linkedGroupIds,
      botEnabled: true,
      botConfig: defaultCommunitoriaCommunityBotConfig(),
      inviteLinks: [],
      metaType: args.metaType,
      linkedClassId: args.linkedClassId ?? null,
      linkedSubjectId: args.linkedSubjectId ?? null,
      linkedProjectId: args.linkedProjectId ?? null,
      createdAt: nowIso(),
    };
    st3.communities = [...(st3.communities ?? []), community];
    this.save(st3);
    void topic;
    return { community, announcementGroupId: group.id };
  }

  patchCommunity(
    communityId: string,
    patch: Partial<
      Pick<
        CommunitoriaCommunity,
        | "name"
        | "description"
        | "avatarEmoji"
        | "avatarImageUrl"
        | "adminIds"
        | "botEnabled"
        | "botConfig"
        | "metaType"
        | "linkedClassId"
        | "linkedSubjectId"
        | "linkedProjectId"
      >
    > & { linkedGroupIds?: string[] },
  ): CommunitoriaCommunity | null {
    const st = this.load();
    const list = st.communities ?? [];
    const idx = list.findIndex((c) => c.id === communityId);
    if (idx < 0) return null;
    const cur = list[idx]!;
    const next: CommunitoriaCommunity = {
      ...cur,
      ...patch,
      botConfig: patch.botConfig ? { ...cur.botConfig, ...patch.botConfig } : cur.botConfig,
      linkedGroupIds: patch.linkedGroupIds ?? cur.linkedGroupIds,
    };
    const nextList = [...list];
    nextList[idx] = next;
    st.communities = nextList;
    if (patch.linkedGroupIds) {
      const oldSet = new Set(cur.linkedGroupIds);
      const newSet = new Set(patch.linkedGroupIds);
      st.groups = st.groups.map((g) => {
        if (oldSet.has(g.id) && !newSet.has(g.id)) return { ...g, communityId: null };
        if (!oldSet.has(g.id) && newSet.has(g.id)) return { ...g, communityId };
        return g;
      });
    }
    this.save(st);
    return next;
  }

  addCommunityInviteLink(
    communityId: string,
    args: { label?: string; password?: string | null; maxUses?: number | null; expiresAt?: string | null },
  ): { link: CommunitoriaCommunityInviteLink } | null {
    const st = this.load();
    const list = st.communities ?? [];
    const idx = list.findIndex((c) => c.id === communityId);
    if (idx < 0) return null;
    const cur = list[idx]!;
    const link: CommunitoriaCommunityInviteLink = {
      id: randomUUID(),
      token: genToken(),
      label: args.label?.trim() || undefined,
      createdAt: nowIso(),
      password: args.password?.trim() ? args.password.trim() : null,
      maxUses: args.maxUses ?? null,
      expiresAt: args.expiresAt ?? null,
      usesCount: 0,
    };
    const links = [...(cur.inviteLinks ?? []), link];
    list[idx] = { ...cur, inviteLinks: links };
    st.communities = list;
    this.save(st);
    return { link };
  }

  resolveCommunityInviteToken(
    token: string,
  ): { community: CommunitoriaCommunity; link: CommunitoriaCommunityInviteLink } | null {
    const st = this.load();
    for (const c of st.communities ?? []) {
      const link = (c.inviteLinks ?? []).find((l) => l.token === token);
      if (link) return { community: c, link };
    }
    return null;
  }

  joinCommunityWithLink(userId: string, token: string, password?: string): CommunitoriaCommunity | null {
    const resolved = this.resolveCommunityInviteToken(token);
    if (!resolved) return null;
    const { community: c, link } = resolved;
    if (link.password && link.password !== (password ?? "")) return null;
    if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) return null;
    if (link.maxUses != null && link.usesCount >= link.maxUses) return null;
    const st = this.load();
    const list = st.communities ?? [];
    const idx = list.findIndex((x) => x.id === c.id);
    if (idx < 0) return null;
    const cur = list[idx]!;
    const nextLinks = (cur.inviteLinks ?? []).map((l) =>
      l.id === link.id ? { ...l, usesCount: l.usesCount + 1 } : l,
    );
    list[idx] = { ...cur, inviteLinks: nextLinks };
    st.communities = list;
    for (const gid of cur.linkedGroupIds) {
      if (!this.getMember(gid, userId)) this.addMember(gid, userId, "member");
    }
    this.save(st);
    return list[idx]!;
  }

  /** --- Prefs & presence --- */
  getPrefs(userId: string, convKey: string): PerChatPrefs {
    const st = this.load();
    return st.userChatPrefs[userId]?.[convKey] ?? {};
  }

  setPrefs(userId: string, convKey: string, patch: PerChatPrefs): PerChatPrefs {
    const st = this.load();
    const prev = st.userChatPrefs[userId] ?? {};
    const nextPrefs = { ...prev[convKey], ...patch };
    st.userChatPrefs[userId] = { ...prev, [convKey]: nextPrefs };
    this.save(st);
    return nextPrefs;
  }

  touchPresence(userId: string): void {
    const st = this.load();
    st.presence[userId] = nowIso();
    this.save(st);
  }

  getPresence(userId: string): { lastSeenAt: string } {
    const st = this.load();
    return { lastSeenAt: st.presence[userId] ?? "" };
  }

  countUnreadGroup(groupId: string, userId: string): number {
    const st = this.load();
    const member = st.groupMembers.find((m) => m.groupId === groupId && m.userId === userId);
    if (!member) return 0;
    const topicIds = st.topics.filter((t) => t.groupId === groupId && !t.archived).map((t) => t.id);
    let n = 0;
    for (const m of st.groupMessages) {
      if (m.groupId !== groupId) continue;
      if (!topicIds.includes(m.topicId)) continue;
      if (m.senderUserId === userId) continue;
      const lastRead = member.lastReadByTopic[m.topicId] ?? "";
      if (!lastRead || m.createdAt > lastRead) n += 1;
    }
    return n;
  }

  listPinnedDirect(a: string, b: string): DirectMessage[] {
    return this.listDirectBetween(a, b).filter((m) => m.pinned);
  }

  listPinnedGroup(groupId: string): GroupMessage[] {
    return this.load().groupMessages.filter((m) => m.groupId === groupId && m.pinned);
  }

  lastDirectMessageBetween(a: string, b: string): DirectMessage | null {
    const list = this.listDirectBetween(a, b);
    return list.length ? list[list.length - 1]! : null;
  }

  lastGroupMessage(groupId: string): GroupMessage | null {
    const st = this.load();
    const list = st.groupMessages.filter((m) => m.groupId === groupId).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
    return list.length ? list[list.length - 1]! : null;
  }

  listDirectPeerIds(meId: string): string[] {
    const ids = new Set<string>();
    for (const m of this.load().directMessages) {
      if (m.fromUserId === meId) ids.add(m.toUserId);
      else if (m.toUserId === meId) ids.add(m.fromUserId);
    }
    return [...ids];
  }

  listGroupMemberRows(groupId: string): GroupMember[] {
    return this.load().groupMembers.filter((m) => m.groupId === groupId);
  }

  findGroupMessageById(messageId: string): GroupMessage | undefined {
    return this.load().groupMessages.find((m) => m.id === messageId);
  }

  findDirectMessageById(messageId: string): DirectMessage | undefined {
    return this.load().directMessages.find((m) => m.id === messageId);
  }
}

export const messengerStore = new MessengerStore();
