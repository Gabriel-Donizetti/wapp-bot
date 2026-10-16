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
export type DeliveryStatus =
  "pending" | "sending" | "sent" | "failed" | "unknown" | "cancelled";
export interface Schedule {
  id: string;
  sessionId: string;
  to: string;
  text: string;
  sendAt: string;
  status: DeliveryStatus;
  createdAt: string;
  sentAt: string | null;
  messageId: string | null;
  error: string | null;
}
export interface Message {
  id: string;
  sessionId: string;
  to: string;
  text: string;
  status: DeliveryStatus;
  messageId: string | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
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
