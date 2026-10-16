import { createPool } from "../../database/pool.js";
import { migrate } from "../../database/migrate.js";
import { AuthService } from "./auth-service.js";
import { UserRepository } from "./user-repository.js";
import { readConfig } from "../../config/env.js";
const config = readConfig();
if (!process.env.CREATE_USER_USERNAME || !process.env.CREATE_USER_PASSWORD)
  throw new Error(
    "Defina CREATE_USER_USERNAME e CREATE_USER_PASSWORD no ambiente.",
  );
const pool = createPool(config.DATABASE_URL);
try {
  await migrate(pool);
  const auth = new AuthService(new UserRepository(pool), config.JWT_SECRET);
  const user = await auth.create({
    username: process.env.CREATE_USER_USERNAME,
    password: process.env.CREATE_USER_PASSWORD,
    name: process.env.CREATE_USER_NAME || process.env.CREATE_USER_USERNAME,
    role: process.env.CREATE_USER_ROLE === "admin" ? "admin" : "operator",
  });
  console.log(`Usuário criado: ${user.username} (${user.role}).`);
} finally {
  await pool.end();
}
