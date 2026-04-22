/**
 * Совместимость: личные сообщения хранятся в messengerStore (messenger.json).
 */
import { messengerStore } from "./messengerStore.js";

class ChatStore {
  listUsersMessagesBetween(fromUserId: string, toUserId: string) {
    return messengerStore.listDirectBetween(fromUserId, toUserId);
  }

  createMessage(args: { fromUserId: string; toUserId: string; text: string }) {
    return messengerStore.createDirectMessage({ fromUserId: args.fromUserId, toUserId: args.toUserId, text: args.text.trim() });
  }

  countUnreadIncomingForUser(viewerUserId: string): number {
    return messengerStore.countUnreadIncomingForUser(viewerUserId);
  }

  markUsersMessagesRead(args: { viewerUserId: string; otherUserId: string }) {
    return messengerStore.markDirectRead(args.viewerUserId, args.otherUserId);
  }

  invalidateCache(): void {
    messengerStore.invalidateCache();
  }
}

export const chatStore = new ChatStore();
