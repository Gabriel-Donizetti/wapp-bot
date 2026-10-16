import { rm } from "node:fs/promises";
import { join } from "node:path";
import whatsapp from "whatsapp-web.js";
import QRCode from "qrcode";
import { AppError } from "../../shared/errors.js";
import { SessionRepository, type SessionRecord } from "./session-repository.js";
import { normalize } from "../messages/message-content.js";
import { prepareMessage } from "../messages/whatsapp-message.js";
import type { MessageInput } from "../../shared/validation.js";
import { readGroupSummaries, type GroupSummary } from "./groups.js";

const { Client, LocalAuth } = whatsapp;
export type ClientPort = Pick<
  whatsapp.Client,
  | "on"
  | "initialize"
  | "destroy"
  | "getContacts"
  | "getChannels"
  | "getNumberId"
  | "getContactById"
  | "getMessageById"
  | "sendMessage"
  | "info"
> & {
  listGroups(): Promise<GroupSummary[]>;
};
export type ClientFactory = (id: string) => ClientPort;
type State =
  "starting" | "qr" | "authenticated" | "ready" | "disconnected" | "error";
interface Runtime {
  client: ClientPort;
  status: State;
  qr: string | null;
  error: string | null;
  phone: string | null;
  activeSends: number;
  initializing: boolean;
}

export function clientFactory(authPath: string): ClientFactory {
  return (id) => {
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: id, dataPath: authPath }),
      webVersionCache: { type: "local", path: join(authPath, "..", "cache") },
      puppeteer: {
        headless: true,
        executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
        args: [
          "--disable-dev-shm-usage",
          ...(process.env.CHROME_NO_SANDBOX === "true"
            ? ["--no-sandbox", "--disable-setuid-sandbox"]
            : []),
        ],
      },
    });
    return Object.assign(client, {
      async listGroups() {
        if (!client.pupPage)
          throw new AppError(
            409,
            "SESSION_NOT_READY",
            "Aguarde a conexão da sessão.",
          );
        return client.pupPage.evaluate(readGroupSummaries);
      },
    });
  };
}

async function withTimeout<T>(promise: Promise<T>, ms = 60_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new AppError(
                504,
                "WHATSAPP_TIMEOUT",
                "O WhatsApp demorou para responder.",
              ),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export class Sessions {
  private runtimes = new Map<string, Runtime>();
  private operations = new Set<string>();
  private closing = false;

  constructor(
    private repository: SessionRepository,
    private factory: ClientFactory,
    private authPath: string,
    private onError: (error: unknown, sessionId: string) => void = () => {},
  ) {}

  async list() {
    return (await this.repository.list()).map((row) => this.view(row));
  }

  async get(id: string) {
    return this.view(await this.repository.get(id));
  }

  private view(row: SessionRecord) {
    const runtime = this.runtimes.get(row.id);
    return {
      ...row,
      status: runtime?.status ?? "disconnected",
      phone: runtime?.phone ?? null,
      error: runtime?.error ?? null,
    };
  }

  async qr(id: string) {
    const session = await this.get(id);
    return {
      sessionId: id,
      status: session.status,
      qr: this.runtimes.get(id)?.qr ?? null,
    };
  }

  isReady(id: string) {
    return (
      !this.operations.has(id) && this.runtimes.get(id)?.status === "ready"
    );
  }

  private async ready(id: string): Promise<Runtime> {
    await this.repository.get(id);
    const runtime = this.runtimes.get(id);
    if (!runtime || !this.isReady(id)) {
      throw new AppError(
        409,
        "SESSION_NOT_READY",
        "Conecte a sessão e aguarde o estado ready.",
      );
    }
    return runtime;
  }

  async start(id: string) {
    await this.repository.get(id);
    if (this.closing || this.operations.has(id))
      throw new AppError(409, "SESSION_BUSY", "Sessão ocupada.");
    const previous = this.runtimes.get(id);
    if (
      previous &&
      ["starting", "qr", "authenticated", "ready"].includes(previous.status)
    )
      return this.get(id);
    this.operations.add(id);
    try {
      if (previous) await this.dispose(id, previous);
      const runtime: Runtime = {
        client: this.factory(id),
        status: "starting",
        qr: null,
        error: null,
        phone: null,
        activeSends: 0,
        initializing: true,
      };
      this.runtimes.set(id, runtime);
      const current = () => this.runtimes.get(id) === runtime && !this.closing;
      runtime.client.on("qr", (qr) => {
        if (!current()) return;
        runtime.status = "qr";
        runtime.qr = null;
        void QRCode.toDataURL(qr)
          .then((data) => {
            if (current() && runtime.status === "qr") runtime.qr = data;
          })
          .catch(() => {
            if (current()) {
              runtime.status = "error";
              runtime.error = "Falha ao gerar QR Code.";
            }
          });
      });
      runtime.client.on("authenticated", () => {
        if (current()) {
          runtime.status = "authenticated";
          runtime.qr = null;
        }
      });
      runtime.client.on("ready", () => {
        if (current()) {
          runtime.status = "ready";
          runtime.qr = null;
          runtime.error = null;
          const wid = runtime.client.info?.wid;
          runtime.phone = wid?.server === "c.us" ? wid.user : null;
        }
      });
      runtime.client.on("auth_failure", () => {
        if (current()) {
          runtime.status = "error";
          runtime.qr = null;
          runtime.error = "Falha na autenticação. Reconecte a sessão.";
        }
      });
      runtime.client.on("disconnected", () => {
        if (current()) {
          runtime.status = "disconnected";
          runtime.qr = null;
          runtime.error = "WhatsApp desconectado. Reconecte a sessão.";
        }
      });
      void runtime.client
        .initialize()
        .catch((error) => {
          this.onError(error, id);
          if (current()) {
            runtime.status = "error";
            runtime.qr = null;
            runtime.error =
              "Falha ao iniciar WhatsApp. Confira a instalação e as dependências do Chrome.";
          }
        })
        .finally(async () => {
          runtime.initializing = false;
          if (!current()) await runtime.client.destroy().catch(() => {});
        });
      return this.get(id);
    } finally {
      this.operations.delete(id);
    }
  }

  private async dispose(id: string, runtime: Runtime) {
    if (runtime.activeSends)
      throw new AppError(409, "SESSION_BUSY", "Aguarde o envio em andamento.");
    // Evita remover arquivos enquanto o Chromium ainda está iniciando.
    if (runtime.initializing)
      throw new AppError(
        409,
        "SESSION_BUSY",
        "Aguarde a inicialização da sessão terminar.",
      );
    try {
      await withTimeout(runtime.client.destroy(), 15_000);
    } catch (error) {
      this.onError(error, id);
      throw new AppError(
        503,
        "SESSION_CLOSE_FAILED",
        "Não foi possível encerrar o navegador da sessão.",
      );
    }
    this.runtimes.delete(id);
  }

  async disconnect(id: string) {
    await this.repository.get(id);
    if (this.operations.has(id))
      throw new AppError(409, "SESSION_BUSY", "Sessão ocupada.");
    this.operations.add(id);
    try {
      const runtime = this.runtimes.get(id);
      if (runtime) await this.dispose(id, runtime);
      return this.get(id);
    } finally {
      this.operations.delete(id);
    }
  }

  async remove(id: string) {
    await this.repository.get(id);
    if (this.operations.has(id))
      throw new AppError(409, "SESSION_BUSY", "Sessão ocupada.");
    this.operations.add(id);
    try {
      const runtime = this.runtimes.get(id);
      if (runtime) await this.dispose(id, runtime);
      await this.repository.remove(id);
      await rm(join(this.authPath, `session-${id}`), {
        recursive: true,
        force: true,
      });
    } finally {
      this.operations.delete(id);
    }
  }

  async directory(id: string) {
    const { client } = await this.ready(id);
    const [contacts, groups] = await Promise.allSettled([
      withTimeout(client.getContacts()),
      withTimeout(client.listGroups()),
    ]);
    const warnings: Array<{ source: "contacts" | "groups"; message: string }> =
      [];
    if (contacts.status === "rejected") {
      this.onError(contacts.reason, id);
      warnings.push({
        source: "contacts",
        message:
          "Não foi possível carregar os contatos. Tente atualizar a lista.",
      });
    }
    if (groups.status === "rejected") {
      this.onError(groups.reason, id);
      warnings.push({
        source: "groups",
        message:
          "Não foi possível carregar os grupos. Tente atualizar a lista.",
      });
    }
    if (contacts.status === "rejected" && groups.status === "rejected") {
      throw new AppError(
        502,
        "DIRECTORY_UNAVAILABLE",
        "Não foi possível consultar contatos e grupos. Tente novamente.",
      );
    }
    const savedContacts = new Map<
      string,
      {
        id: string;
        number: string | null;
        name: string | null;
        isMyContact: boolean;
      }
    >();
    for (const contact of contacts.status === "fulfilled"
      ? contacts.value
      : []) {
      const contactId = contact.id._serialized;
      if (
        !contact.isMyContact ||
        contact.isMe ||
        contact.isGroup ||
        !contact.isUser ||
        !/^\d+@(?:c\.us|lid)$/.test(contactId)
      )
        continue;
      // A biblioteca pode devolver o mesmo telefone em registros PN e LID.
      // O ID já resolvido é a identidade; userid/number pode ainda conter o LID.
      const entry = {
        id: contactId,
        number: contactId.endsWith("@c.us") ? contactId.slice(0, -5) : null,
        name: contact.name || contact.shortName || contact.pushname || null,
        isMyContact: true,
      };
      const existing = savedContacts.get(contactId);
      if (!existing || (!existing.name && entry.name))
        savedContacts.set(contactId, entry);
    }
    return {
      sessionId: id,
      contacts: [...savedContacts.values()].sort((left, right) =>
        (left.name || left.number || left.id).localeCompare(
          right.name || right.number || right.id,
          "pt-BR",
          { sensitivity: "base" },
        ),
      ),
      groups: groups.status === "fulfilled" ? groups.value : [],
      warnings,
    };
  }

  async channels(id: string) {
    const { client } = await this.ready(id);
    try {
      return (await withTimeout(client.getChannels())).map((channel) => ({
        id: channel.id._serialized,
        name: channel.name,
      }));
    } catch (error) {
      this.onError(error, id);
      throw new AppError(
        502,
        "CHANNELS_UNAVAILABLE",
        "Não foi possível listar os canais desta sessão.",
      );
    }
  }

  async send(request: MessageInput) {
    const input = normalize(request);
    const runtime = await this.ready(input.sessionId);
    runtime.activeSends++;
    try {
      let chatId = input.to;
      if (
        !chatId.endsWith("@g.us") &&
        !chatId.endsWith("@lid") &&
        !chatId.endsWith("@newsletter")
      ) {
        const number = chatId.replace(/@c\.us$/, "").replace(/^\+/, "");
        const resolved = await withTimeout(runtime.client.getNumberId(number));
        if (!resolved)
          throw new AppError(
            422,
            "NUMBER_NOT_REGISTERED",
            "Número não encontrado no WhatsApp.",
          );
        chatId = resolved._serialized;
      }
      let prepared: Awaited<ReturnType<typeof prepareMessage>>;
      try {
        prepared = await withTimeout(
          prepareMessage(runtime.client, input, chatId),
        );
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(
          502,
          "MESSAGE_PREPARATION_FAILED",
          "Não foi possível preparar a mensagem. Verifique os contatos e a mensagem citada.",
        );
      }
      try {
        const result = await withTimeout(
          runtime.client.sendMessage(
            chatId,
            prepared.content,
            prepared.options,
          ),
          120_000,
        );
        if (!result?.id?._serialized) throw new Error("Resposta sem ID.");
        return {
          sessionId: input.sessionId,
          to: chatId,
          messageId: result.id._serialized,
        };
      } catch {
        throw new AppError(
          502,
          "SEND_UNCERTAIN",
          "Resultado do envio incerto. Confira o WhatsApp antes de tentar novamente.",
        );
      }
    } finally {
      runtime.activeSends--;
    }
  }

  async close() {
    this.closing = true;
    await Promise.allSettled(
      [...this.runtimes.values()].map((runtime) =>
        withTimeout(runtime.client.destroy(), 15_000),
      ),
    );
    this.runtimes.clear();
  }
}
