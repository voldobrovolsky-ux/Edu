/** Модель мессенджера (личные диалоги 1:1 и группы с темами). */

export type DeliveryStatus = "sent" | "delivered" | "read";

export type MessageKind = "text" | "poll" | "file" | "system";

export type GroupMemberRole = "owner" | "admin" | "member";

export type GroupInvitePolicy = "all" | "admins_only" | "school_admins";

export type GroupHistoryForNewMembers = "full" | "month" | "hidden";

export type GroupPermissionSendMessages = "all" | "admins";

export type CommunitoriaGroupMeta = {
  groupType?: "standard" | "announcements";
  historyForNewMembers?: GroupHistoryForNewMembers;
  permissions?: {
    sendMessages: GroupPermissionSendMessages;
    sendDocuments: boolean;
    addMembers: boolean;
    pinMessages: boolean;
    changeGroupSettings: boolean;
    changeGroupInfo: boolean;
  };
  /** Дополнительные пригласительные ссылки (основная — group.inviteToken). */
  inviteLinks?: Array<{
    id: string;
    label?: string;
    token: string;
    createdAt: string;
    /** Демо-хранилище: в проде — только хэш */
    password?: string | null;
  }>;
};

export function defaultCommunitoriaGroupMeta(): CommunitoriaGroupMeta {
  return {
    groupType: "standard",
    historyForNewMembers: "full",
    permissions: {
      sendMessages: "all",
      sendDocuments: true,
      addMembers: true,
      pinMessages: true,
      changeGroupSettings: true,
      changeGroupInfo: true,
    },
    inviteLinks: [],
  };
}

export type PollOption = { id: string; text: string };

export type PollState = {
  question: string;
  anonymous: boolean;
  options: PollOption[];
  /** userId -> optionId */
  votes: Record<string, string>;
};

export type MessageAttachment = {
  id: string;
  fileName: string;
  mime: string;
  url: string;
  size: number;
};

export type DirectMessage = {
  id: string;
  fromUserId: string;
  toUserId: string;
  text: string;
  createdAt: string;
  isRead: boolean;
  readAt: string | null;
  kind: MessageKind;
  /** Для исходящих от текущего автора — статус у собеседника */
  deliveryStatus?: DeliveryStatus;
  deletedForAll?: boolean;
  deletedAt?: string | null;
  /** Упоминания по userId */
  mentionUserIds?: string[];
  attachments?: MessageAttachment[];
  poll?: PollState;
  pollClosed?: boolean;
  /** Сообщение доставлено на устройство получателя (получатель открыл диалог) */
  deliveredToRecipient?: boolean;
  reactions?: Record<string, string[]>;
  pinned?: boolean;
  /** Ответ на сообщение в этом же диалоге */
  replyToMessageId?: string | null;
};

/** Системные события в ленте группы (не привязаны к пользователю-отправителю) */
export const GROUP_SYSTEM_SENDER = "__system__";

export type GroupMessage = {
  id: string;
  groupId: string;
  topicId: string;
  /** Для kind=system — GROUP_SYSTEM_SENDER */
  senderUserId: string;
  text: string;
  createdAt: string;
  kind: MessageKind;
  deletedForAll?: boolean;
  deletedAt?: string | null;
  /** Снимок для модерации (владелец/админ в режиме просмотра удалённых) */
  modText?: string | null;
  modAttachments?: MessageAttachment[] | null;
  mentionUserIds?: string[];
  attachments?: MessageAttachment[];
  poll?: PollState;
  pollClosed?: boolean;
  reactions?: Record<string, string[]>;
  pinned?: boolean;
  /** Ответ на сообщение в этой же группе */
  replyToMessageId?: string | null;
};

export type ChatGroup = {
  id: string;
  title: string;
  description: string | null;
  avatarEmoji: string | null;
  avatarImageUrl: string | null;
  /** Локальные псевдонимы участников в пределах одного чата */
  localDisplayNames?: Record<string, string>;
  /** Системные автогруппы (Педагоги/Администрация/Родители) */
  isSystemGroup?: boolean;
  /** Ключ системной группы для устойчивой синхронизации */
  systemGroupKey?: "teachers" | "administration" | "parents" | null;
  inviteToken: string;
  createdAt: string;
  createdByUserId: string;
  invitePolicy?: GroupInvitePolicy;
  /** Расширенные настройки Communitoria (права, ссылки, тип). */
  groupMeta?: CommunitoriaGroupMeta;
  /** Принадлежность к сообществу Communitoria (если чат привязан). */
  communityId?: string | null;
};

/** Тип сообщества (EDUMED / WhatsApp-style communities). */
export type CommunitoriaCommunityMetaType = "school" | "class" | "subject" | "project" | "other";

export type CommunitoriaCommunityBotConfig = {
  announcementsRelay: boolean;
  dailyDigest: boolean;
  eventReminders: boolean;
  autoWelcome: boolean;
  allowedCommands: string[];
  welcomeTemplate?: string;
};

export type CommunitoriaCommunityInviteLink = {
  id: string;
  token: string;
  label?: string;
  createdAt: string;
  password?: string | null;
  maxUses?: number | null;
  expiresAt?: string | null;
  usesCount: number;
};

/** Сообщество: надстройка над группами (анонсы + связанные чаты). */
export type CommunitoriaCommunity = {
  id: string;
  name: string;
  description: string | null;
  avatarEmoji: string | null;
  avatarImageUrl: string | null;
  ownerId: string;
  adminIds: string[];
  /** Группа «только анонсы» (по умолчанию пишут админы). */
  announcementGroupId: string;
  /** Все группы сообщества, включая анонсы. */
  linkedGroupIds: string[];
  botEnabled: boolean;
  botConfig: CommunitoriaCommunityBotConfig;
  inviteLinks: CommunitoriaCommunityInviteLink[];
  metaType: CommunitoriaCommunityMetaType;
  linkedClassId?: string | null;
  linkedSubjectId?: string | null;
  linkedProjectId?: string | null;
  createdAt: string;
};

export function defaultCommunitoriaCommunityBotConfig(): CommunitoriaCommunityBotConfig {
  return {
    announcementsRelay: false,
    dailyDigest: false,
    eventReminders: false,
    autoWelcome: true,
    allowedCommands: ["/schedule", "/homework", "/news"],
    welcomeTemplate: "Добро пожаловать в сообщество!",
  };
}

export type GroupMember = {
  groupId: string;
  userId: string;
  role: GroupMemberRole;
  mutedUntil: string | null;
  /** topicId -> ISO time последнего просмотренного сообщения (по времени) */
  lastReadByTopic: Record<string, string>;
};

export type GroupTopic = {
  id: string;
  groupId: string;
  name: string;
  description: string | null;
  emoji: string;
  avatarImageUrl?: string | null;
  archived: boolean;
  isDefault: boolean;
};

export type PerChatPrefs = {
  muted?: boolean;
  /** Уведомления выключены до указанного момента (ISO), даже если muted=false — для «на 1 час» и т.п. */
  muteExpiresAt?: string | null;
  /** Переопределение звука входящих (notification1…7); null/отсутствует — глобальная настройка. */
  incomingSoundId?: string | null;
  important?: boolean;
  showDeletedMod?: boolean;
};

export type MessengerStateV1 = {
  version: 1;
  directMessages: DirectMessage[];
  groups: ChatGroup[];
  groupMembers: GroupMember[];
  topics: GroupTopic[];
  groupMessages: GroupMessage[];
  /** userId -> prefs by conversation key `direct:<otherId>` or `group:<id>` */
  userChatPrefs: Record<string, Record<string, PerChatPrefs>>;
  /** userId -> last activity ISO */
  presence: Record<string, string>;
  /** Сообщества Communitoria */
  communities?: CommunitoriaCommunity[];
};

export const emptyMessengerState = (): MessengerStateV1 => ({
  version: 1,
  directMessages: [],
  groups: [],
  groupMembers: [],
  topics: [],
  groupMessages: [],
  userChatPrefs: {},
  presence: {},
  communities: [],
});
