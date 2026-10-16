import { randomUUID } from "node:crypto";
import type { User } from "@wapp/contracts";
import { type Pool, transaction } from "../../database/pool.js";
import { AppError } from "../../shared/errors.js";
const fields = 'id,username,name,role,active,created_at AS "createdAt"';
export class UserRepository {
  constructor(readonly pool: Pool) {}
  async find(
    username: string,
  ): Promise<(User & { passwordHash: string }) | undefined> {
    return (
      await this.pool.query(
        `SELECT ${fields},password_hash AS "passwordHash" FROM users WHERE username=$1`,
        [username.toLowerCase()],
      )
    ).rows[0];
  }
  async list(): Promise<User[]> {
    return (
      await this.pool.query(`SELECT ${fields} FROM users ORDER BY created_at`)
    ).rows;
  }
  async create(
    username: string,
    name: string,
    passwordHash: string,
    role: User["role"],
  ): Promise<User> {
    const result = await this.pool.query(
      `INSERT INTO users(id,username,name,password_hash,role) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (username) DO NOTHING RETURNING ${fields}`,
      [randomUUID(), username.toLowerCase(), name, passwordHash, role],
    );
    if (!result.rowCount)
      throw new AppError(409, "USERNAME_EXISTS", "Esse usuário já existe.");
    return result.rows[0];
  }
  async createLogin(userId: string, ttl: number) {
    const id = randomUUID();
    await this.pool.query(
      "INSERT INTO auth_sessions(id,user_id,expires_at) VALUES ($1,$2,NOW()+($3::int * interval '1 second'))",
      [id, userId, ttl],
    );
    return id;
  }
  async authenticated(
    userId: string,
    sessionId: string,
  ): Promise<User | undefined> {
    return (
      await this.pool.query(
        `SELECT u.id,u.username,u.name,u.role,u.active,u.created_at AS "createdAt"
      FROM users u JOIN auth_sessions s ON s.user_id=u.id
      WHERE u.id=$1 AND s.id=$2 AND u.active AND s.revoked_at IS NULL AND s.expires_at>NOW()`,
        [userId, sessionId],
      )
    ).rows[0];
  }
  async revoke(sessionId: string) {
    await this.pool.query(
      "UPDATE auth_sessions SET revoked_at=NOW() WHERE id=$1",
      [sessionId],
    );
  }
  async changePassword(userId: string, hash: string) {
    await transaction(this.pool, async (client) => {
      await client.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
        userId,
        hash,
      ]);
      await client.query(
        "UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL",
        [userId],
      );
    });
  }
}
