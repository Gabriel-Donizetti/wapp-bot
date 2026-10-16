import { z } from "zod";

export const sessionIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
export const recipientSchema = z
  .string()
  .trim()
  .max(128)
  .regex(
    /^(?:\+?[1-9]\d{7,14}|[1-9]\d{7,14}@c\.us|\d+(?:-\d+)?@g\.us|\d+@lid|\d+@newsletter)$/,
    "Use telefone com DDI (ex.: 5511999999999) ou ID retornado pela consulta de contatos/grupos.",
  );
export const messageTypes = [
  "text",
  "image",
  "audio",
  "voice",
  "video",
  "document",
  "sticker",
  "location",
  "contacts",
  "poll",
] as const;
export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
const nonblank = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value.trim().length > 0, "Informe um valor não vazio.");
const contactId = z
  .string()
  .max(64)
  .regex(/^\d+@(?:c\.us|lid)$/);
const sendOptions = z
  .object({
    replyTo: z.string().min(1).max(512).optional(),
    mentions: z.array(contactId).max(100).optional(),
    groupMentions: z
      .array(
        z
          .object({
            id: z
              .string()
              .max(128)
              .regex(/^\d+(?:-\d+)?@g\.us$/),
            subject: nonblank(100),
          })
          .strict(),
      )
      .max(20)
      .optional(),
  })
  .strict();
const mediaSchema = z
  .object({
    mimetype: z
      .string()
      .max(150)
      .regex(
        /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:;[a-zA-Z0-9 =_.+-]+)?$/,
      ),
    data: z
      .string()
      .min(4)
      .max(4 * Math.ceil(MAX_MEDIA_BYTES / 3))
      .regex(
        /^[A-Za-z0-9+/]+={0,2}$/,
        "Informe base64 puro, sem prefixo data:.",
      )
      .refine(
        (value) => Buffer.byteLength(value, "base64") <= MAX_MEDIA_BYTES,
        "Limite de 16 MiB por arquivo.",
      )
      .refine(
        (value) => Buffer.from(value, "base64").toString("base64") === value,
        "Base64 inválido.",
      ),
    filename: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[^/\\\x00-\x1f]+$/)
      .optional(),
  })
  .strict();
const mediaOf = (prefix: string) =>
  mediaSchema.refine(
    (value) => value.mimetype.startsWith(prefix),
    `Use um MIME ${prefix} compatível.`,
  );
const future = z.iso
  .datetime({ offset: true })
  .refine(
    (value) => Date.parse(value) > Date.now(),
    "A data deve estar no futuro e incluir o fuso horário.",
  );
function sendSchema(scheduled: boolean) {
  const common = {
    sessionId: sessionIdSchema,
    to: recipientSchema,
    options: sendOptions.optional(),
    ...(scheduled ? { sendAt: future } : {}),
  };
  return z
    .discriminatedUnion("type", [
      z
        .object({ ...common, type: z.literal("text"), text: nonblank(4096) })
        .strict(),
      z
        .object({
          ...common,
          type: z.literal("image"),
          media: mediaOf("image/"),
          caption: z.string().max(4096).optional(),
          viewOnce: z.boolean().default(false),
          hd: z.boolean().default(false),
        })
        .strict(),
      z
        .object({
          ...common,
          type: z.literal("audio"),
          media: mediaOf("audio/"),
        })
        .strict(),
      z
        .object({
          ...common,
          type: z.literal("voice"),
          media: mediaOf("audio/"),
        })
        .strict(),
      z
        .object({
          ...common,
          type: z.literal("video"),
          media: mediaOf("video/"),
          caption: z.string().max(4096).optional(),
          viewOnce: z.boolean().default(false),
          asGif: z.boolean().default(false),
        })
        .strict(),
      z
        .object({
          ...common,
          type: z.literal("document"),
          media: mediaSchema.extend({
            filename: z
              .string()
              .min(1)
              .max(255)
              .regex(/^[^/\\\x00-\x1f]+$/),
          }),
          caption: z.string().max(4096).optional(),
        })
        .strict(),
      z
        .object({
          ...common,
          type: z.literal("sticker"),
          media: mediaSchema.refine(
            (value) =>
              ["image/webp", "image/png", "image/jpeg", "video/mp4"].includes(
                value.mimetype,
              ),
            "Use WebP, PNG, JPEG ou MP4.",
          ),
          name: z.string().max(100).optional(),
          author: z.string().max(100).optional(),
          categories: z.array(z.string().max(20)).max(10).optional(),
        })
        .strict(),
      z
        .object({
          ...common,
          type: z.literal("location"),
          location: z
            .object({
              latitude: z.number().min(-90).max(90),
              longitude: z.number().min(-180).max(180),
              name: nonblank(100).optional(),
              address: nonblank(500).optional(),
              url: z
                .url({ protocol: /^https?$/ })
                .max(2048)
                .optional(),
            })
            .strict(),
        })
        .strict(),
      z
        .object({
          ...common,
          type: z.literal("contacts"),
          contacts: z
            .array(contactId)
            .min(1)
            .max(20)
            .refine(
              (value) => new Set(value).size === value.length,
              "Não repita contatos.",
            ),
        })
        .strict(),
      z
        .object({
          ...common,
          type: z.literal("poll"),
          poll: z
            .object({
              name: z.string().trim().min(1).max(255),
              options: z
                .array(z.string().trim().min(1).max(100))
                .min(2)
                .max(12)
                .refine(
                  (value) =>
                    new Set(value.map((item) => item.toLocaleLowerCase()))
                      .size === value.length,
                  "As opções precisam ser distintas.",
                ),
              allowMultipleAnswers: z.boolean().default(false),
            })
            .strict(),
        })
        .strict(),
    ])
    .superRefine((input, ctx) => {
      if (
        input.to.endsWith("@newsletter") &&
        (["document", "location", "contacts", "audio"].includes(input.type) ||
          input.options?.replyTo ||
          input.options?.mentions?.length ||
          input.options?.groupMentions?.length ||
          ("viewOnce" in input && input.viewOnce))
      )
        ctx.addIssue({
          code: "custom",
          path: ["to"],
          message:
            "Esse formato/opção não é suportado em canais. Use texto, imagem, voz, vídeo, figurinha ou enquete sem resposta, menções ou visualização única.",
        });
    });
}
const defaultText = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? { type: "text", ...value }
    : value;
export const messageBodySchema = sendSchema(false);
export const scheduleBodySchema = sendSchema(true).and(
  z.object({ sendAt: future }),
);
export const messageSchema = z.preprocess(defaultText, messageBodySchema);
export const scheduleSchema = z.preprocess(defaultText, scheduleBodySchema);
export type NormalizedMessageInput = z.infer<typeof messageSchema>;
export type MessageInput = import("@wapp/contracts").SendMessageRequest;
export const scheduleStatuses = [
  "pending",
  "sending",
  "sent",
  "failed",
  "unknown",
  "cancelled",
] as const;
