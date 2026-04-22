export type ChatMessage = {
  id: string;
  fromUserId: string;
  toUserId: string;
  text: string;
  createdAt: string;
  isRead?: boolean;
  readAt?: string | null;
};

