import type { GroupReadReceipts } from "@wapp/contracts";
import { AppError } from "../../shared/errors.js";

function participantId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  const id = value as {
    _serialized?: unknown;
    $1?: unknown;
    user?: unknown;
    server?: unknown;
  };
  if (typeof id._serialized === "string") return id._serialized;
  if (typeof id.$1 === "string") return id.$1;
  return typeof id.user === "string" && typeof id.server === "string"
    ? `${id.user}@${id.server}`
    : null;
}

export function normalizeReaders(info: unknown): GroupReadReceipts["readers"] {
  if (
    !info ||
    typeof info !== "object" ||
    !("read" in info) ||
    !Array.isArray(info.read)
  )
    throw new AppError(
      502,
      "GROUP_READERS_UNAVAILABLE",
      "O WhatsApp não disponibilizou as confirmações individuais desta mensagem.",
    );
  const readers = new Map<string, GroupReadReceipts["readers"][number]>();
  for (const row of info.read) {
    const id = participantId(row?.id);
    if (!id || !/^\d+@(c\.us|lid)$/.test(id))
      throw new AppError(
        502,
        "GROUP_READERS_UNAVAILABLE",
        "O WhatsApp retornou uma confirmação sem participante identificável.",
      );
    const time = typeof row.t === "number" ? row.t * 1000 : NaN;
    const readAt =
      Number.isFinite(time) &&
      time > 0 &&
      Number.isFinite(new Date(time).getTime())
        ? new Date(time).toISOString()
        : null;
    const previous = readers.get(id);
    if (!previous || (readAt && (!previous.readAt || readAt < previous.readAt)))
      readers.set(id, { id, name: null, readAt });
  }
  return [...readers.values()];
}
