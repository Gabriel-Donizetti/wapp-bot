import { AppError } from "../../shared/errors.js";
import type { MessageInput } from "../../shared/validation.js";
import type { Sessions } from "../sessions/session-service.js";
import { MessageRepository } from "./message-repository.js";
export class MessageService {
  constructor(
    readonly repository: MessageRepository,
    private sessions: Pick<Sessions, "send">,
  ) {}
  async send(input: MessageInput, userId: string, key?: string) {
    const { record, created } = await this.repository.reserve(
      input,
      userId,
      key,
    );
    if (!created) return { record, created };
    let result: Awaited<ReturnType<Sessions["send"]>>;
    try {
      result = await this.sessions.send(input);
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
    const sent = await this.repository.finish(
      record.id,
      "sent",
      result.messageId,
      null,
    );
    return { record: sent, created };
  }
}
