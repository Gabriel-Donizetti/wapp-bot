import { DatabaseSync, backup } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createPool, transaction, type Pool } from "./pool.js";
import { migrate } from "./migrate.js";
import { projectRoot } from "../config/env.js";

export async function importSqlite(pool: Pool, path: string) {
  if (!existsSync(path)) throw new Error("Arquivo SQLite não encontrado.");
  const sqlite = new DatabaseSync(path, { readOnly: true });
  try {
    const backupPath = resolve(
      dirname(path),
      "backups",
      `wapp-${Date.now()}.sqlite`,
    );
    mkdirSync(dirname(backupPath), { recursive: true, mode: 0o700 });
    await backup(sqlite, backupPath);
    return await transaction(pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(93477003)");
      if (
        (
          await client.query(
            "SELECT name FROM data_imports WHERE name='sqlite-v1'",
          )
        ).rowCount
      )
        return { imported: false, sessions: 0, schedules: 0 };
      if ((await client.query("SELECT id FROM sessions LIMIT 1")).rowCount)
        throw new Error(
          "O PostgreSQL já contém sessões. Importação cancelada para não misturar dados.",
        );
      const sessions = sqlite.prepare("SELECT * FROM sessions").all();
      const schedules = sqlite.prepare("SELECT * FROM schedules").all();
      for (const row of sessions)
        await client.query(
          "INSERT INTO sessions(id,name,created_at) VALUES ($1,$2,$3)",
          [row.id, row.name, row.createdAt],
        );
      for (const row of schedules) {
        await client.query(
          "INSERT INTO sessions(id,name,deleted_at) VALUES ($1,$1,NOW()) ON CONFLICT DO NOTHING",
          [row.sessionId],
        );
        await client.query(
          `INSERT INTO schedules(id,session_id,recipient,text,send_at,status,created_at,sent_at,whatsapp_message_id,error)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            row.id,
            row.sessionId,
            row.to,
            row.text,
            row.sendAt,
            row.status === "sending" ? "unknown" : row.status,
            row.createdAt,
            row.sentAt,
            row.messageId,
            row.status === "sending"
              ? "Importado após interrupção. Confira o WhatsApp antes de reagendar."
              : row.error,
          ],
        );
      }
      await client.query("INSERT INTO data_imports(name) VALUES ('sqlite-v1')");
      return {
        imported: true,
        sessions: sessions.length,
        schedules: schedules.length,
      };
    });
  } finally {
    sqlite.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.env.DATABASE_URL) throw new Error("Defina DATABASE_URL.");
  const pool = createPool(process.env.DATABASE_URL);
  try {
    await migrate(pool);
    console.log(
      await importSqlite(
        pool,
        resolve(
          projectRoot,
          process.env.SQLITE_IMPORT_PATH || "data/wapp.sqlite",
        ),
      ),
    );
  } finally {
    await pool.end();
  }
}
