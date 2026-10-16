import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { messageSchema, messageTypes } from "../../shared/validation.js";
import { historyQuery, uuidParam } from "../../http/query.js";
import { MessageService } from "./message-service.js";
export function messageRoutes(service: MessageService) {
  const router = Router();
  const send = async (req: Request, res: Response) => {
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
  };
  router.post("/", send);
  for (const type of messageTypes) {
    router.post(`/${type}`, async (req, res) => {
      // A rota escolhe o tipo; o mesmo validador recusa campos de outro formato.
      if (
        req.body &&
        typeof req.body === "object" &&
        !Array.isArray(req.body)
      ) {
        if (req.body.type !== undefined) z.literal(type).parse(req.body.type);
        req.body = { ...req.body, type };
      }
      await send(req, res);
    });
  }
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
