import type { Message, Schedule } from "@wapp/contracts";
import { AppError } from "../../shared/errors.js";
import type { Sessions } from "../sessions/session-service.js";

export async function groupReadReceipts(
  record: Message | Schedule,
  sessions: Pick<Sessions, "groupReaders">,
) {
  if (!record.to.endsWith("@g.us"))
    throw new AppError(
      409,
      "NOT_A_GROUP_MESSAGE",
      "Esta mensagem não foi enviada a um grupo.",
    );
  if (!record.messageId)
    throw new AppError(
      409,
      "NO_MESSAGE_RECEIPT",
      "Este envio ainda não possui um ID WhatsApp para consultar.",
    );
  return sessions.groupReaders(record.sessionId, record.messageId, record.to);
}
