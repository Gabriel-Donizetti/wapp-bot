import { AppError } from "../../shared/errors.js";
import type { MessageInput } from "../../shared/validation.js";
import type { Sessions } from "../sessions/session-service.js";
import { MessageRepository } from "./message-repository.js";
import { pollResults } from "./poll-results.js";
import { PollVoteRepository } from "./poll-vote-repository.js";
export class MessageService {
  constructor(
    readonly repository: MessageRepository,
    private sessions: Pick<Sessions, "send" | "refreshReceipt" | "pollVotes">,
  ) {}
  async pollResults(id: string) {
    return pollResults(
      await this.repository.get(id),
      this.sessions,
      new PollVoteRepository(this.repository.pool),
    );
  }
  async refresh(id: string) {
    const record = await this.repository.get(id);
    if (!record.messageId)
      throw new AppError(
        409,
        "NO_MESSAGE_RECEIPT",
        "Este envio ainda não possui um ID WhatsApp para consultar. Confira o resultado antes de repetir.",
      );
    await this.sessions.refreshReceipt(record.sessionId, record.messageId);
    return this.repository.get(id);
  }
  async send(input: MessageInput, userId: string, key?: string) {
    const { record, created } = await this.repository.reserve(
      input,
      userId,
      key,
    );
    if (!created) return { record, created };
    let result: Awaited<ReturnType<Sessions["send"]>>;
    try {
      result = await this.sessions.send(input, async (late) => {
        await this.repository.finish(
          record.id,
          "sent",
          late.messageId,
          null,
          late.ack,
        );
      });
    } catch (error) {
      const uncertain =
        error instanceof AppError && error.code === "SEND_UNCERTAIN";
      const message =
        error instanceof AppError
          ? error.message
          : "Falha na operação com o WhatsApp.";
      await this.repository.finish(
        record.id,
        uncertain ? "unknown" : "failed",
        null,
        message,
      );
      if (error instanceof AppError)
        throw new AppError(error.statusCode, error.code, error.message, {
          messageRecordId: record.id,
        });
      throw error;
    }
    // Uma falha de persistência após o envio mantém o registro em sending.
    // A recuperação o tratará como unknown, sem autorizar um novo envio.
    let sent;
    try {
      sent = await this.repository.finish(
        record.id,
        "sent",
        result.messageId,
        null,
        result.ack,
      );
    } catch {
      throw new AppError(
        500,
        "STATUS_PERSISTENCE_FAILED",
        "O WhatsApp retornou um ID, mas a confirmação não pôde ser gravada. Consulte o registro e preserve a chave de idempotência.",
        { messageRecordId: record.id, whatsappMessageId: result.messageId },
      );
    }
    return { record: sent, created };
  }
}
