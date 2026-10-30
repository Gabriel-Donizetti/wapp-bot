import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  AuthService,
  createUserSchema,
  passwordSchema,
  usernameSchema,
} from "./auth-service.js";
import { requireAdmin, requireAuth } from "./auth-middleware.js";
import { uuidParam } from "../../http/query.js";
export function authRoutes(auth: AuthService) {
  const router = Router();
  router.post(
    "/login",
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 10,
      skipSuccessfulRequests: true,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: "TOO_MANY_ATTEMPTS",
        message: "Muitas tentativas. Aguarde alguns minutos.",
      },
    }),
    async (req, res) => {
      const data = z
        .object({
          username: usernameSchema,
          password: z.string().min(1).max(128),
        })
        .strict()
        .parse(req.body);
      res.json(await auth.login(data.username, data.password));
    },
  );
  router.use(requireAuth(auth));
  router.get("/me", (_req, res) => {
    res.json(res.locals.user);
  });
  router.post("/logout", async (_req, res) => {
    if (res.locals.authSessionId)
      await auth.users.revoke(res.locals.authSessionId);
    else await auth.users.setIntegrationToken(res.locals.user.id, null);
    res.sendStatus(204);
  });
  router.post("/change-password", async (req, res) => {
    const data = z
      .object({
        currentPassword: z.string().min(1).max(128),
        newPassword: passwordSchema,
      })
      .strict()
      .parse(req.body);
    await auth.changePassword(
      res.locals.user,
      data.currentPassword,
      data.newPassword,
    );
    res.sendStatus(204);
  });
  router.get("/users", requireAdmin, async (_req, res) => {
    res.json({ users: await auth.users.list() });
  });
  router.post("/users", requireAdmin, async (req, res) => {
    res.status(201).json(await auth.create(createUserSchema.parse(req.body)));
  });
  router.post("/users/:id/token", requireAdmin, async (req, res) => {
    res.json(await auth.rotateIntegrationToken(uuidParam(req.params)));
  });
  router.delete("/users/:id/token", requireAdmin, async (req, res) => {
    await auth.users.setIntegrationToken(uuidParam(req.params), null);
    res.sendStatus(204);
  });
  return router;
}
