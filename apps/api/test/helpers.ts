import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import request from "supertest";
import type whatsapp from "whatsapp-web.js";
import { createPool } from "../src/database/pool.js";
import { migrate } from "../src/database/migrate.js";
import {
  Sessions,
  type ClientPort,
} from "../src/modules/sessions/session-service.js";
import { SessionRepository } from "../src/modules/sessions/session-repository.js";
import { ScheduleRepository } from "../src/modules/schedules/schedule-repository.js";
import { MessageRepository } from "../src/modules/messages/message-repository.js";
import { MessageService } from "../src/modules/messages/message-service.js";
import { AuthService } from "../src/modules/auth/auth-service.js";
import { UserRepository } from "../src/modules/auth/user-repository.js";
import { buildApp } from "../src/app.js";
export const testPassword = "Test-only-password-12345";
export const testSecret = "test-only-jwt-secret-with-over-32-characters";
export class FakeClient extends EventEmitter {
  info = { wid: { user: "5511999999999", server: "c.us" } };
  sent: Array<{ to: string; text: string }> = [];
  deliveries: Array<{
    to: string;
    content: Parameters<whatsapp.Client["sendMessage"]>[1];
    options?: whatsapp.MessageSendOptions;
  }> = [];
  quotedChatId = "5511888888888@c.us";
  quoteMissing = false;
  contactError = false;
  registered = true;
  sendError = false;
  contactsError = false;
  groupsError = false;
  groupName = "Equipe";
  initializeError = false;
  destroyed = false;
  sendGate?: Promise<void>;
  onSend?: () => void;
  contacts: Array<{
    id: { _serialized: string; server: string };
    number?: string;
    name?: string;
    pushname?: string;
    isUser?: boolean;
    isMyContact?: boolean;
    isGroup?: boolean;
  }> = [
    {
      id: { _serialized: "5511888888888@c.us", server: "c.us" },
      number: "5511888888888",
      name: "Cliente",
      isUser: true,
      isMyContact: true,
    },
    {
      id: { _serialized: "123456789@lid", server: "lid" },
      number: "123456789",
      pushname: "Contato privado",
      isUser: true,
      isMyContact: true,
    },
    {
      id: { _serialized: "5511777777777@c.us", server: "c.us" },
      number: "5511777777777",
      name: "Número não salvo",
      isUser: true,
      isMyContact: false,
    },
    { id: { _serialized: "120363000000@g.us", server: "g.us" }, isGroup: true },
  ];
  async initialize() {
    if (this.initializeError) throw new Error("Chrome indisponível");
  }
  async destroy() {
    this.destroyed = true;
  }
  async getNumberId(number: string) {
    return this.registered ? { _serialized: `${number}@c.us` } : null;
  }
  async getContacts() {
    if (this.contactsError) throw new Error("Falha na consulta de contatos");
    return this.contacts;
  }
  async getChannels() {
    return [
      { id: { _serialized: "120363000000@newsletter" }, name: "Novidades" },
    ];
  }
  async listGroups() {
    if (this.groupsError) throw new Error("Falha na consulta de grupos");
    return [{ id: "120363000000@g.us", name: this.groupName }];
  }
  async getContactById(id: string) {
    if (this.contactError) throw new Error("Contato indisponível");
    return { id: { _serialized: id }, isUser: true, isGroup: false };
  }
  async getMessageById(id: string) {
    return this.quoteMissing
      ? null
      : { id: { _serialized: id, remote: this.quotedChatId } };
  }
  async sendMessage(
    to: string,
    content: Parameters<whatsapp.Client["sendMessage"]>[1],
    options?: whatsapp.MessageSendOptions,
  ) {
    this.onSend?.();
    await this.sendGate;
    if (this.sendError) throw new Error("Conexão encerrada");
    this.deliveries.push({ to, content, options });
    this.sent.push({
      to,
      text: typeof content === "string" ? content : "[media]",
    });
    return { id: { _serialized: `message-${this.sent.length}` } };
  }
  asPort() {
    return this as unknown as ClientPort;
  }
}
export async function fixture() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url)
    throw new Error(
      "Defina TEST_DATABASE_URL para um PostgreSQL exclusivo de testes.",
    );
  const schema = "test_" + randomUUID().replaceAll("-", "");
  const control = createPool(url);
  await control.query(`CREATE SCHEMA ${schema}`);
  const pool = createPool(url, schema);
  await migrate(pool);
  const dir = mkdtempSync(join(tmpdir(), "wapp-test-"));
  const sessionRepository = new SessionRepository(pool);
  const schedules = new ScheduleRepository(pool);
  const messageRepository = new MessageRepository(pool);
  const auth = new AuthService(new UserRepository(pool), testSecret);
  const user = await auth.create({
    username: "admin",
    name: "Admin Teste",
    password: testPassword,
    role: "admin",
  });
  const login = await auth.login("admin", testPassword);
  const clients = new Map<string, FakeClient>();
  const sessions = new Sessions(
    sessionRepository,
    (id) => {
      const client = new FakeClient();
      clients.set(id, client);
      return client.asPort();
    },
    join(dir, "auth"),
  );
  const messages = new MessageService(messageRepository, sessions);
  const app = buildApp({
    pool,
    auth,
    sessions,
    sessionRepository,
    schedules,
    messages,
  });
  return {
    app,
    pool,
    dir,
    schema,
    auth,
    user,
    token: login.accessToken,
    clients,
    sessions,
    sessionRepository,
    schedules,
    messageRepository,
    messages,
    async call(
      method: "get" | "post" | "delete",
      path: string,
      body?: object,
      token: string | null = login.accessToken,
      headers: Record<string, string> = {},
    ) {
      let call = request(app)
        [method]("/api/v1" + path)
        .set(headers);
      if (token) call = call.set("Authorization", `Bearer ${token}`);
      if (body) call = call.send(body);
      return call;
    },
    async add(id = "comercial", ready = true) {
      await sessionRepository.create(id, id);
      await sessions.start(id);
      const client = clients.get(id)!;
      if (ready) client.emit("ready");
      await new Promise((resolve) => setImmediate(resolve));
      return client;
    },
    async close() {
      await sessions.close();
      await pool.end();
      await control.query(`DROP SCHEMA ${schema} CASCADE`);
      await control.end();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
