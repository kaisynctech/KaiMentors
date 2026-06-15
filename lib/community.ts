export type ConversationType = "direct" | "group" | "announcement";
export type ContentAccessScope = "all_verified" | "restricted";

export interface StudentGroupSummary {
  id: string;
  name: string;
  description: string | null;
  color: string;
  isActive: boolean;
  isSystem: boolean;
  memberIds: string[];
  conversationId: string | null;
}

export interface CommunityStudent {
  applicationId: string;
  userId: string;
  fullName: string;
  email: string | null;
}

export interface ConversationSummary {
  id: string;
  type: ConversationType;
  title: string;
  lastMessageAt: string | null;
  lastMessage: string | null;
  unread: boolean;
}

export interface ConversationMessage {
  id: string;
  body: string;
  senderUserId: string;
  senderName: string;
  createdAt: string;
  attachments: Array<{
    id: string;
    fileName: string;
    mimeType: string;
  }>;
}
