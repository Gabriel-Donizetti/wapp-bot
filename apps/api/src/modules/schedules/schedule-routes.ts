import { Router } from "express";
import { z } from "zod";
import { scheduleSchema } from "../../shared/validation.js";
import { historyQuery, uuidParam } from "../../http/query.js";
import { ScheduleRepository } from "./schedule-repository.js";
export function scheduleRoutes(repository: ScheduleRepository) {
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
  router.get("/:id", async (req, res) => {
    res.json(await repository.get(uuidParam(req.params)));
  });
  router.post("/:id/cancel", async (req, res) => {
    res.json(await repository.cancel(uuidParam(req.params)));
  });
  return router;
}
