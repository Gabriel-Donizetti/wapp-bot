import type { Pool } from "../../database/pool.js";
import { transaction } from "../../database/pool.js";
import { AppError } from "../../shared/errors.js";

export interface SessionRecord {
  id: string;
  name: string;
  createdAt: string;
}
const fields = 'id, name, created_at AS "createdAt"';
export class SessionRepository {
  constructor(readonly pool: Pool) {}
  async list(): Promise<SessionRecord[]> {
    return (
      await this.pool.query(
        `SELECT ${fields} FROM sessions WHERE deleted_at IS NULL ORDER BY created_at`,
      )
    ).rows;
  }
  async get(id: string): Promise<SessionRecord> {
    const row = (
      await this.pool.query(
        `SELECT ${fields} FROM sessions WHERE id=$1 AND deleted_at IS NULL`,
        [id],
      )
    ).rows[0];
    if (!row)
      throw new AppError(404, "SESSION_NOT_FOUND", "Sessão não encontrada.");
    return row;
  }
  async create(id: string, name: string): Promise<SessionRecord> {
    const result = await this.pool.query(
      `INSERT INTO sessions(id,name) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING ${fields}`,
      [id, name],
    );
    if (!result.rowCount)
      throw new AppError(
        409,
        "SESSION_EXISTS",
        "Esse identificador já foi utilizado por uma sessão.",
      );
    return result.rows[0];
  }
  async remove(id: string) {
    await transaction(this.pool, async (client) => {
      const session = await client.query(
        "SELECT id FROM sessions WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        [id],
      );
      if (!session.rowCount)
        throw new AppError(404, "SESSION_NOT_FOUND", "Sessão não encontrada.");
      const busy = await client.query(
        "SELECT id FROM schedules WHERE session_id=$1 AND status='sending' UNION ALL SELECT id FROM messages WHERE session_id=$1 AND status='sending'",
        [id],
      );
      if (busy.rowCount)
        throw new AppError(
          409,
          "SESSION_BUSY",
          "Aguarde o envio em andamento.",
        );
      await client.query(
        "UPDATE schedules SET status='cancelled', error='Sessão removida.' WHERE session_id=$1 AND status='pending'",
        [id],
      );
      await client.query("UPDATE sessions SET deleted_at=NOW() WHERE id=$1", [
        id,
      ]);
    });
  }
}
