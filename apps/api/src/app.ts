import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import pino from "pino";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import swaggerUi from "swagger-ui-express";
import { ZodError } from "zod";
import type { Pool } from "./database/pool.js";
import { AppError } from "./shared/errors.js";
import { AuthService } from "./modules/auth/auth-service.js";
import { authRoutes } from "./modules/auth/auth-routes.js";
import { requireAuth } from "./modules/auth/auth-middleware.js";
import { Sessions } from "./modules/sessions/session-service.js";
import { SessionRepository } from "./modules/sessions/session-repository.js";
import { sessionRoutes } from "./modules/sessions/session-routes.js";
import { ScheduleRepository } from "./modules/schedules/schedule-repository.js";
import { scheduleRoutes } from "./modules/schedules/schedule-routes.js";
import { MessageService } from "./modules/messages/message-service.js";
import { messageRoutes } from "./modules/messages/message-routes.js";
import { PollRepository } from "./modules/messages/poll-repository.js";
import { z } from "zod";
import { pagination } from "./http/query.js";
import { sessionIdSchema } from "./shared/validation.js";
import { openapi } from "./http/openapi.js";
import { integrationGuide } from "./http/integration-guide.js";

export interface Dependencies {
  pool: Pool;
  auth: AuthService;
  sessions: Sessions;
  sessionRepository: SessionRepository;
  schedules: ScheduleRepository;
  messages: MessageService;
  origins?: string[];
  logging?: boolean;
  trustProxy?: boolean;
}
export function buildApp(deps: Dependencies) {
  const app = express();
  app.disable("x-powered-by");
  if (deps.trustProxy) app.set("trust proxy", 1);
  app.use(
    pinoHttp({
      logger: pino({
        enabled: deps.logging ?? false,
        redact: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.body.password",
          "req.body.currentPassword",
          "req.body.newPassword",
        ],
      }),
      genReqId: () => randomUUID(),
    }),
  );
  app.use((req, res, next) => {
    res.setHeader("X-Request-ID", String(req.id));
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, !origin || (deps.origins ?? []).includes(origin)),
      allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
      exposedHeaders: ["X-Request-ID"],
    }),
  );
  app.use(express.json({ limit: "24mb" }));
  app.get("/health", async (_req, res) => {
    await deps.pool.query("SELECT 1");
    res.json({ status: "ok", database: "postgresql" });
  });
  app.get("/integration-guide", async (_req, res) => {
    res.type("html").send(await integrationGuide());
  });
  app.get("/openapi.json", (_req, res) => {
    res.json(openapi);
  });
  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(openapi, {
      customSiteTitle: "WappHub API · Documentação",
      swaggerOptions: { persistAuthorization: false },
    }),
  );
  app.use("/api/v1/auth", authRoutes(deps.auth));
  const api = express.Router();
  api.use(requireAuth(deps.auth));
  const polls = new PollRepository(deps.pool);
  api.get("/polls", async (req, res) => {
    const query = z
      .object({
        ...pagination,
        sessionId: sessionIdSchema.optional(),
        state: z.enum(["active", "expired", "all"]).default("active"),
      })
      .parse(req.query);
    res.json(
      await polls.list(query.sessionId, query.limit, query.offset, query.state),
    );
  });
  api.use("/sessions", sessionRoutes(deps.sessionRepository, deps.sessions));
  api.use("/messages", messageRoutes(deps.messages));
  api.use("/schedules", scheduleRoutes(deps.schedules, deps.sessions));
  api.get("/directory", async (_req, res) => {
    const rows = await deps.sessions.list();
    res.json({
      sessions: await Promise.all(
        rows.map(async (row) => {
          try {
            return {
              ...(await deps.sessions.directory(row.id)),
              status: row.status,
            };
          } catch (error) {
            return {
              sessionId: row.id,
              status: row.status,
              contacts: [],
              groups: [],
              error:
                error instanceof AppError
                  ? error.code
                  : "DIRECTORY_UNAVAILABLE",
            };
          }
        }),
      ),
    });
  });
  app.use("/api/v1", api);
  app.use("/api", (_req, _res, next) => {
    next(
      new AppError(404, "NOT_FOUND", "Rota não encontrada. Consulte /docs."),
    );
  });
  const webRoot = fileURLToPath(new URL("../../web/dist/", import.meta.url));
  if (existsSync(webRoot)) {
    app.use(express.static(webRoot, { etag: true, index: false }));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(`${webRoot}index.html`);
    });
  }
  app.use((_req, _res, next) => {
    next(new AppError(404, "NOT_FOUND", "Rota não encontrada."));
  });
  const errors: ErrorRequestHandler = (error, req, res, _next) => {
    if (res.headersSent) return _next(error);
    if (error instanceof ZodError) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Dados inválidos.",
        details: error.issues,
        requestId: req.id,
      });
      return;
    }
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
        requestId: req.id,
      });
      return;
    }
    if (error.status === 400 || error.status === 413) {
      res.status(error.status).json({
        error: "BAD_REQUEST",
        message:
          error.status === 413
            ? "Corpo da requisição muito grande."
            : "JSON inválido.",
        requestId: req.id,
      });
      return;
    }
    req.log.error({ err: error }, "Falha na requisição");
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro interno. Consulte o identificador da requisição nos logs.",
      requestId: req.id,
    });
  };
  app.use(errors);
  return app;
}
