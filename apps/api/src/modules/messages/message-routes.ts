import { Router } from "express";
import { z } from "zod";
import { messageSchema } from "../../shared/validation.js";
import { historyQuery, uuidParam } from "../../http/query.js";
import { MessageService } from "./message-service.js";
export function messageRoutes(service: MessageService) {
  const router = Router();
  router.post("/", async (req, res) => {
    const key = z
      .string()
      .regex(/^[\x21-\x7e]{1,128}$/)
      .optional()
      .parse(req.get("Idempotency-Key"));
    const result = await service.send(
      messageSchema.parse(req.body),
      res.locals.user.id,
      key,
    );
    res
      .status(
        result.created ? 201 : result.record.status === "sending" ? 202 : 200,
      )
      .json(result.record);
  });
  router.get("/", async (req, res) => {
    const query = historyQuery.parse(req.query);
    res.json(
      await service.repository.list(
        query.sessionId,
        query.status,
        query.limit,
        query.offset,
      ),
    );
  });
  router.get("/:id", async (req, res) => {
    res.json(await service.repository.get(uuidParam(req.params)));
  });
  return router;
}
