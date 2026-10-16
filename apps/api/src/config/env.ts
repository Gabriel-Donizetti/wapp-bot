import { z } from "zod";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const projectRoot = fileURLToPath(
  new URL("../../../../", import.meta.url),
);
export function readConfig(env = process.env) {
  const parsed = z
    .object({
      NODE_ENV: z
        .enum(["development", "production", "test"])
        .default("development"),
      HOST: z.string().default("127.0.0.1"),
      PORT: z.coerce.number().int().min(1).max(65535).default(3000),
      DATABASE_URL: z.string().min(1),
      JWT_SECRET: z.string().min(32),
      JWT_TTL_SECONDS: z.coerce
        .number()
        .int()
        .min(60)
        .max(86400)
        .default(28800),
      DATA_DIR: z.string().default("data"),
      SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
      CORS_ORIGINS: z
        .string()
        .default("http://127.0.0.1:5173,http://localhost:5173"),
      TRUST_PROXY: z.enum(["true", "false"]).default("false"),
      BOOTSTRAP_ADMIN_USERNAME: z.string().optional(),
      BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
    })
    .parse(env);
  return {
    ...parsed,
    DATA_DIR: resolve(projectRoot, parsed.DATA_DIR),
    origins: parsed.CORS_ORIGINS.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}
