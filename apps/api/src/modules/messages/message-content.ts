import { createHash } from "node:crypto";
import type { MessagePreview } from "@wapp/contracts";
import {
  messageSchema,
  type NormalizedMessageInput,
  type MessageInput,
} from "../../shared/validation.js";

export function preview(input: NormalizedMessageInput): MessagePreview {
  const { sessionId: _, to: __, sendAt: ___, ...content } = input;
  if ("media" in content) {
    const { data, ...metadata } = content.media;
    const bytes = Buffer.from(data, "base64");
    return {
      ...content,
      media: {
        ...metadata,
        size: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    };
  }
  return content;
}
export function messageText(input: NormalizedMessageInput): string {
  switch (input.type) {
    case "text":
      return input.text;
    case "location":
      return (
        input.location.name ||
        input.location.address ||
        `${input.location.latitude}, ${input.location.longitude}`
      );
    case "contacts":
      return input.contacts.join(", ");
    case "poll":
      return input.poll.name;
    default:
      return (
        ("caption" in input && input.caption) ||
        input.media.filename ||
        `[${input.type}]`
      );
  }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, value]) => value !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, canonical(value)]),
    );
  return value;
}
export function requestHash(input: NormalizedMessageInput) {
  // Preserva as chaves já gravadas pelos clientes de texto da versão 1.0.
  const value =
    input.type === "text" &&
    (!input.options || !Object.keys(input.options).length)
      ? [input.sessionId, input.to, input.text]
      : canonical(input);
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function normalize(input: MessageInput) {
  return messageSchema.parse(input);
}
