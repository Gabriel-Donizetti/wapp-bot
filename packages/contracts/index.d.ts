export interface User {
  id: string;
  username: string;
  name: string;
  role: "admin" | "operator";
  active: boolean;
  createdAt: string;
}
export interface Session {
  id: string;
  name: string;
  createdAt: string;
  status:
    "starting" | "qr" | "authenticated" | "ready" | "disconnected" | "error";
  phone: string | null;
  error: string | null;
}
export interface Contact {
  id: string;
  name: string | null;
  number: string | null;
  isMyContact: boolean;
}
export interface Group {
  id: string;
  name: string;
}
export interface Directory {
  sessionId: string;
  contacts: Contact[];
  groups: Group[];
  warnings: Array<{ source: string; message: string }>;
}
export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "voice"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contacts"
  | "poll";
export interface SendOptions {
  replyTo?: string;
  mentions?: string[];
  groupMentions?: Array<{ id: string; subject: string }>;
}
export interface MediaInput {
  mimetype: string;
  data: string;
  filename?: string;
}
export type MessageContent =
  | { type?: "text"; text: string }
  | {
      type: "image";
      media: MediaInput;
      caption?: string;
      viewOnce?: boolean;
      hd?: boolean;
    }
  | { type: "audio" | "voice"; media: MediaInput }
  | {
      type: "video";
      media: MediaInput;
      caption?: string;
      viewOnce?: boolean;
      asGif?: boolean;
    }
  | { type: "document"; media: MediaInput; caption?: string }
  | {
      type: "sticker";
      media: MediaInput;
      name?: string;
      author?: string;
      categories?: string[];
    }
  | {
      type: "location";
      location: {
        latitude: number;
        longitude: number;
        name?: string;
        address?: string;
        url?: string;
      };
    }
  | { type: "contacts"; contacts: string[] }
  | {
      type: "poll";
      poll: { name: string; options: string[]; allowMultipleAnswers?: boolean };
    };
export type SendMessageRequest = MessageContent & {
  sessionId: string;
  to: string;
  options?: SendOptions;
};
export type MessagePreview = {
  type: MessageType;
  options?: SendOptions;
  text?: string;
  caption?: string;
  media?: { mimetype: string; filename?: string; size: number; sha256: string };
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
    url?: string;
  };
  contacts?: string[];
  poll?: { name: string; options: string[]; allowMultipleAnswers?: boolean };
};
export type DeliveryStatus =
  | "pending"
  | "sending"
  | "submitted"
  | "sent"
  | "delivered"
  | "read"
  | "played"
  | "failed"
  | "unknown"
  | "cancelled";
export interface DeliveryReceipt {
  ack: -1 | 0 | 1 | 2 | 3 | 4 | null;
  submittedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  playedAt: string | null;
  lastAckAt: string | null;
  lastCheckedAt: string | null;
}
export interface Schedule extends DeliveryReceipt {
  id: string;
  sessionId: string;
  to: string;
  text: string;
  type: MessageType;
  content: MessagePreview;
  sendAt: string;
  status: DeliveryStatus;
  createdAt: string;
  sentAt: string | null;
  messageId: string | null;
  error: string | null;
}
export interface Message extends DeliveryReceipt {
  id: string;
  sessionId: string;
  to: string;
  text: string;
  type: MessageType;
  content: MessagePreview;
  status: DeliveryStatus;
  messageId: string | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}
export interface PollOverview {
  kind: "messages" | "schedules";
  recordId: string;
  sessionId: string;
  to: string;
  poll: { name: string; options: string[]; allowMultipleAnswers?: boolean };
  createdAt: string;
  startedAt: string | null;
  sendAt: string | null;
  messageId: string | null;
  deliveryStatus: DeliveryStatus;
}
export interface PollResults {
  recordId: string;
  sessionId: string;
  messageId: string;
  name: string;
  allowMultipleAnswers: boolean;
  totalVoters: number;
  totalSelections: number;
  options: Array<{ id: number; name: string; votes: number; voters: string[] }>;
  votes: Array<{
    voter: string;
    selectedOptions: Array<{ id: number; name: string }>;
    updatedAt: string | null;
  }>;
  fetchedAt: string;
}
export interface Page<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}
export interface Login {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: User;
}
