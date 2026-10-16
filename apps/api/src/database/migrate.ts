import { transaction, type Pool } from "./pool.js";
import { initialSchema } from "./migrations/001-initial.js";

export async function migrate(pool: Pool) {
  await transaction(pool, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(93477001)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    );
    const existing = await client.query(
      "SELECT version FROM schema_migrations WHERE version = 1",
    );
    if (!existing.rowCount) {
      await client.query(initialSchema);
      await client.query("INSERT INTO schema_migrations(version) VALUES (1)");
    }
  });
}
