import { Router } from "express";
import { z } from "zod";
import { sessionIdSchema } from "../../shared/validation.js";
import { idParam, normalizeSearch, pagination } from "../../http/query.js";
import { AppError } from "../../shared/errors.js";
import { SessionRepository } from "./session-repository.js";
import { Sessions } from "./session-service.js";
export function sessionRoutes(
  repository: SessionRepository,
  sessions: Sessions,
) {
  const router = Router();
  const connection = z
    .object({
      pairingPhoneNumber: z
        .string()
        .trim()
        .regex(
          /^\+?[1-9]\d{7,14}$/,
          "Informe o número com DDI, apenas números (ex.: 5511999999999).",
        )
        .transform((value) => value.replace(/^\+/, ""))
        .optional(),
    })
    .strict();
  router.get("/", async (_req, res) => {
    res.json({ sessions: await sessions.list() });
  });
  router.post("/", async (req, res) => {
    const data = connection
      .extend({ id: sessionIdSchema, name: z.string().trim().min(1).max(100) })
      .parse(req.body);
    await repository.create(data.id, data.name);
    res.status(201).json(await sessions.start(data.id, data));
  });
  router.get("/:id", async (req, res) => {
    res.json(await sessions.get(idParam(req.params)));
  });
  router.get("/:id/qr", async (req, res) => {
    res.json(await sessions.qr(idParam(req.params)));
  });
  router.get("/:id/pairing-code", async (req, res) => {
    res.json(await sessions.pairingCode(idParam(req.params)));
  });
  router.post("/:id/connect", async (req, res) => {
    const options = connection.parse(req.body ?? {});
    res.json(await sessions.start(idParam(req.params), options));
  });
  router.post("/:id/disconnect", async (req, res) => {
    res.json(await sessions.disconnect(idParam(req.params)));
  });
  router.delete("/:id", async (req, res) => {
    await sessions.remove(idParam(req.params));
    res.sendStatus(204);
  });
  router.get("/:id/channels", async (req, res) => {
    const query = z
      .object({ search: z.string().max(100).default(""), ...pagination })
      .parse(req.query);
    const term = normalizeSearch(query.search);
    const items = (await sessions.channels(idParam(req.params))).filter(
      (item) => normalizeSearch(`${item.name} ${item.id}`).includes(term),
    );
    res.json({
      data: items.slice(query.offset, query.offset + query.limit),
      total: items.length,
      limit: query.limit,
      offset: query.offset,
    });
  });
  router.get("/:id/directory", async (req, res) => {
    res.json(await sessions.directory(idParam(req.params)));
  });
  for (const kind of ["contacts", "groups"] as const) {
    router.get(`/:id/${kind}`, async (req, res) => {
      const query = z
        .object({ search: z.string().max(100).default(""), ...pagination })
        .parse(req.query);
      const directory = await sessions.directory(idParam(req.params));
      const warning = directory.warnings.find((item) => item.source === kind);
      if (warning)
        throw new AppError(502, "DIRECTORY_UNAVAILABLE", warning.message);
      const term = normalizeSearch(query.search);
      const items = directory[kind].filter((item) =>
        normalizeSearch(
          `${item.name || ""} ${"number" in item ? item.number || "" : ""} ${item.id}`,
        ).includes(term),
      );
      res.json({
        data: items.slice(query.offset, query.offset + query.limit),
        total: items.length,
        limit: query.limit,
        offset: query.offset,
      });
    });
  }
  return router;
}
