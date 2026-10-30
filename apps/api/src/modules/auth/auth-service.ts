import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import type {
  CreatedUser,
  IntegrationToken,
  Login,
  User,
} from "@wapp/contracts";
import { AppError } from "../../shared/errors.js";
import { UserRepository } from "./user-repository.js";
import { hashPassword, verifyPassword } from "./password.js";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.-]{3,64}$/);
export const passwordSchema = z.string().min(12).max(128);
const normalUserSchema = z
  .object({
    type: z.literal("user").default("user"),
    username: usernameSchema,
    name: z.string().trim().min(1).max(100),
    password: passwordSchema,
    role: z.enum(["admin", "operator"]).default("operator"),
  })
  .strict();
export const createUserSchema = z.union([
  normalUserSchema,
  z
    .object({
      type: z.literal("integration"),
      name: z.string().trim().min(1).max(100),
    })
    .strict(),
]);
const generateToken = () => `wapp_int_${randomBytes(32).toString("base64url")}`;
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const dummyHash = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;
export class AuthService {
  private secret: Uint8Array;
  constructor(
    readonly users: UserRepository,
    secret: string,
    readonly ttl = 28800,
  ) {
    if (secret.length < 32)
      throw new Error("JWT_SECRET deve ter pelo menos 32 caracteres.");
    this.secret = new TextEncoder().encode(secret);
  }
  async create(input: z.input<typeof createUserSchema>): Promise<CreatedUser> {
    const data = createUserSchema.parse(input);
    if (data.type === "integration") {
      const token = generateToken();
      const user = await this.users.createIntegration(
        data.name,
        hashToken(token),
      );
      return { ...user, token };
    }
    return this.users.create(
      data.username,
      data.name,
      await hashPassword(data.password),
      data.role,
    );
  }
  async bootstrap(username?: string, password?: string) {
    if ((await this.users.list()).length) return;
    if (!username || !password)
      throw new Error(
        "Banco sem usuários. Configure BOOTSTRAP_ADMIN_USERNAME e BOOTSTRAP_ADMIN_PASSWORD para o primeiro acesso.",
      );
    await this.create({
      username,
      name: "Administrador",
      password,
      role: "admin",
    });
  }
  async login(username: string, password: string): Promise<Login> {
    const record = await this.users.find(username);
    const valid = await verifyPassword(
      password,
      record?.passwordHash ?? dummyHash,
    );
    if (!record || !valid || !record.active)
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Usuário ou senha inválidos.",
      );
    const { passwordHash: _, ...user } = record;
    const sessionId = await this.users.createLogin(user.id, this.ttl);
    const accessToken = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(user.id)
      .setJti(sessionId)
      .setIssuer("wapp")
      .setAudience("wapp-api")
      .setIssuedAt()
      .setExpirationTime(`${this.ttl}s`)
      .sign(this.secret);
    return { accessToken, tokenType: "Bearer", expiresIn: this.ttl, user };
  }
  async verify(
    token: string,
  ): Promise<{ user: User; sessionId: string | null }> {
    if (token.startsWith("wapp_int_")) {
      const user = /^wapp_int_[A-Za-z0-9_-]{43}$/.test(token)
        ? await this.users.integrationByToken(hashToken(token))
        : undefined;
      if (!user)
        throw new AppError(
          401,
          "INVALID_TOKEN",
          "Token de integração inválido ou revogado.",
        );
      return { user, sessionId: null };
    }
    let subject: string;
    let sessionId: string;
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ["HS256"],
        issuer: "wapp",
        audience: "wapp-api",
      });
      subject = z.uuid().parse(payload.sub);
      sessionId = z.uuid().parse(payload.jti);
    } catch {
      throw new AppError(
        401,
        "INVALID_TOKEN",
        "Sua sessão expirou ou o token é inválido. Entre novamente.",
      );
    }
    const user = await this.users.authenticated(subject, sessionId);
    if (!user)
      throw new AppError(
        401,
        "INVALID_TOKEN",
        "Sessão encerrada. Entre novamente.",
      );
    return { user, sessionId };
  }
  async changePassword(
    user: User,
    currentPassword: string,
    newPassword: string,
  ) {
    if (user.type !== "user" || !user.username)
      throw new AppError(
        403,
        "INTEGRATION_PASSWORD_UNAVAILABLE",
        "Integrações usam token e não possuem senha.",
      );
    const record = await this.users.find(user.username);
    if (
      !record?.passwordHash ||
      !(await verifyPassword(currentPassword, record.passwordHash))
    )
      throw new AppError(
        400,
        "INVALID_PASSWORD",
        "A senha atual está incorreta.",
      );
    await this.users.changePassword(
      user.id,
      await hashPassword(passwordSchema.parse(newPassword)),
    );
  }
  async rotateIntegrationToken(id: string): Promise<IntegrationToken> {
    const token = generateToken();
    return {
      user: await this.users.setIntegrationToken(id, hashToken(token)),
      token,
    };
  }
}
