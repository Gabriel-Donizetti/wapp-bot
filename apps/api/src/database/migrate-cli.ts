import { createPool } from "./pool.js";
import { migrate } from "./migrate.js";
if (!process.env.DATABASE_URL) throw new Error("Defina DATABASE_URL.");
const pool = createPool(process.env.DATABASE_URL);
try {
  await migrate(pool);
  console.log("Migrações aplicadas.");
} finally {
  await pool.end();
}
