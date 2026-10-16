import { z } from "zod";
import { sessionIdSchema } from "../shared/validation.js";
export const pagination = {
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
};
export const historyQuery = z.object({
  ...pagination,
  sessionId: sessionIdSchema.optional(),
  status: z
    .enum(["pending", "sending", "sent", "failed", "unknown", "cancelled"])
    .optional(),
});
export const idParam = (params: unknown) =>
  z.object({ id: sessionIdSchema }).parse(params).id;
export const uuidParam = (params: unknown) =>
  z.object({ id: z.uuid() }).parse(params).id;
export const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
