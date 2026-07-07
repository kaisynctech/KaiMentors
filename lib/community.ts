export type ConversationType = "direct" | "group" | "announcement";
export type ConversationPostPolicy = "mentors_only" | "everyone";
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

export interface WorkspaceMentor {
  userId: string;
  fullName: string;
  role: "owner" | "mentor";
}

export interface ConversationSummary {
  id: string;
  type: ConversationType;
  title: string;
  lastMessageAt: string | null;
  lastMessage: string | null;
  unread: boolean;
  postPolicy: ConversationPostPolicy;
  createdBy: string;
  isAllStudents: boolean;
}

export interface DailySignalSummary {
  id: string;
  title: string;
  body: string;
  signalDate: string;
  conversationId: string;
  messageId: string;
  createdAt: string;
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
