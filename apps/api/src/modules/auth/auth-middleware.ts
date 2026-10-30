import type { RequestHandler } from "express";
import type { User } from "@wapp/contracts";
import { AppError } from "../../shared/errors.js";
import type { AuthService } from "./auth-service.js";
declare global {
  namespace Express {
    interface Locals {
      user: User;
      authSessionId: string | null;
    }
  }
}
export function requireAuth(auth: AuthService): RequestHandler {
  return async (req, res, next) => {
    const header = req.get("authorization");
    if (!header?.startsWith("Bearer "))
      throw new AppError(
        401,
        "UNAUTHORIZED",
        "Informe Authorization: Bearer <token>.",
      );
    const { user, sessionId } = await auth.verify(header.slice(7));
    res.locals.user = user;
    res.locals.authSessionId = sessionId;
    next();
  };
}
export const requireAdmin: RequestHandler = (_req, res, next) => {
  if (res.locals.user.role !== "admin")
    throw new AppError(
      403,
      "FORBIDDEN",
      "Somente administradores podem gerenciar usuários.",
    );
  next();
};
