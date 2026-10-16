import { z } from "zod";

export const sessionIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
export const recipientSchema = z
  .string()
  .trim()
  .regex(
    /^(?:\+?[1-9]\d{7,14}|[1-9]\d{7,14}@c\.us|\d+(?:-\d+)?@g\.us|\d+@lid)$/,
    "Use telefone com DDI (ex.: 5511999999999) ou ID retornado pela consulta de contatos/grupos.",
  );
export const messageSchema = z
  .object({
    sessionId: sessionIdSchema,
    to: recipientSchema,
    text: z
      .string()
      .min(1)
      .max(4096)
      .refine((value) => value.trim().length > 0),
  })
  .strict();
export const scheduleSchema = messageSchema.extend({
  sendAt: z.iso
    .datetime({ offset: true })
    .refine(
      (value) => Date.parse(value) > Date.now(),
      "A data deve estar no futuro e incluir o fuso horário.",
    ),
});
export const scheduleStatuses = [
  "pending",
  "sending",
  "sent",
  "failed",
  "unknown",
  "cancelled",
] as const;
export type MessageInput = z.infer<typeof messageSchema>;
