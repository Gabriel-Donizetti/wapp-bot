import { Router } from "express";
import { z } from "zod";
import { scheduleSchema } from "../../shared/validation.js";
import { historyQuery, uuidParam } from "../../http/query.js";
import type { Sessions } from "../sessions/session-service.js";
import { AppError } from "../../shared/errors.js";
import { ScheduleRepository } from "./schedule-repository.js";
import { pollResults } from "../messages/poll-results.js";
export function scheduleRoutes(
  repository: ScheduleRepository,
  sessions: Pick<Sessions, "refreshReceipt" | "pollVotes">,
) {
  const router = Router();
  router.post("/", async (req, res) => {
    res
      .status(201)
      .json(await repository.create(scheduleSchema.parse(req.body)));
  });
  router.get("/", async (req, res) => {
    const query = historyQuery
      .extend({ order: z.enum(["asc", "desc"]).default("desc") })
      .parse(req.query);
    res.json(
      await repository.list(
        query.sessionId,
        query.status,
        query.limit,
        query.offset,
        query.order,
      ),
    );
  });
  router.post("/:id/refresh-status", async (req, res) => {
    const id = uuidParam(req.params);
    const item = await repository.get(id);
    if (!item.messageId)
      throw new AppError(
        409,
        "NO_MESSAGE_RECEIPT",
        "Este agendamento ainda não possui um ID WhatsApp para consultar.",
      );
    await sessions.refreshReceipt(item.sessionId, item.messageId);
    res.json(await repository.get(id));
  });
  router.get("/:id/poll-results", async (req, res) => {
    res.json(
      await pollResults(await repository.get(uuidParam(req.params)), sessions),
    );
  });
  router.get("/:id", async (req, res) => {
    res.json(await repository.get(uuidParam(req.params)));
  });
  router.post("/:id/cancel", async (req, res) => {
    res.json(await repository.cancel(uuidParam(req.params)));
  });
  return router;
}
