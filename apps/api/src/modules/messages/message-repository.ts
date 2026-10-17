import { randomUUID } from "node:crypto";
import type { Message, Page } from "@wapp/contracts";
import { transaction, type Pool } from "../../database/pool.js";
import type { MessageInput } from "../../shared/validation.js";
import { AppError } from "../../shared/errors.js";
import {
  normalize,
  messageText,
  preview,
  requestHash,
} from "./message-content.js";
import {
  deliveryColumns,
  deliveryJoin,
  deliveryState,
  recordReceipt,
} from "./delivery-repository.js";
const fields = `m.id,m.session_id AS "sessionId",m.recipient AS "to",m.text,m.type,m.content,m.created_at AS "createdAt",${deliveryColumns("m")}`;
const source = `FROM messages m ${deliveryJoin("m")}`;
export class MessageRepository {
  constructor(readonly pool: Pool) {}
  async reserve(
    input: MessageInput,
    userId: string,
    key?: string,
  ): Promise<{ record: Message; created: boolean }> {
    const data = normalize(input);
    const hash = requestHash(data);
    const previous = async () => {
      if (!key) return;
      const row = (
        await this.pool.query(
          `SELECT ${fields},m.request_hash ${source} WHERE m.requested_by=$1 AND m.idempotency_key=$2`,
          [userId, key],
        )
      ).rows[0];
      if (row && row.request_hash !== hash)
        throw new AppError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "A chave de idempotência já foi usada com outros dados.",
        );
      if (row) {
        const { request_hash: _, ...record } = row;
        return record as Message;
      }
    };
    const existing = await previous();
    if (existing) return { record: existing, created: false };
    const result = await this.pool.query(
      `WITH active AS (SELECT id FROM sessions WHERE id=$2 AND deleted_at IS NULL FOR SHARE)
      INSERT INTO messages(id,session_id,requested_by,recipient,text,status,idempotency_key,request_hash,type,content)
      SELECT $1,s.id,$3,$4,$5,'sending',$6,$7,$8,$9 FROM active s
      ON CONFLICT(requested_by,idempotency_key) DO NOTHING RETURNING id`,
      [
        randomUUID(),
        input.sessionId,
        userId,
        input.to,
        messageText(data),
        key ?? null,
        hash,
        data.type,
        JSON.stringify(preview(data)),
      ],
    );
    if (result.rowCount)
      return { record: await this.get(result.rows[0].id), created: true };
    const raced = await previous();
    if (raced) return { record: raced, created: false };
    throw new AppError(404, "SESSION_NOT_FOUND", "Sessão não encontrada.");
  }
  async finish(
    id: string,
    status: string,
    whatsappId: string | null,
    error: string | null,
    ack: number | null = null,
  ) {
    await transaction(this.pool, async (client) => {
      const result = await client.query(
        "UPDATE messages SET status=$2,whatsapp_message_id=$3,error=$4,sent_at=CASE WHEN $2='sent' THEN NOW() ELSE NULL END WHERE id=$1 AND (whatsapp_message_id IS NULL OR $3::text IS NOT NULL) RETURNING session_id",
        [id, status, whatsappId, error],
      );
      if (whatsappId && result.rowCount)
        await recordReceipt(client, {
          sessionId: result.rows[0].session_id,
          messageId: whatsappId,
          ack,
        });
    });
    return this.get(id);
  }
  async get(id: string): Promise<Message> {
    const row = (
      await this.pool.query(`SELECT ${fields} ${source} WHERE m.id=$1`, [id])
    ).rows[0];
    if (!row)
      throw new AppError(404, "MESSAGE_NOT_FOUND", "Mensagem não encontrada.");
    return row;
  }
  async list(
    sessionId?: string,
    status?: string,
    limit = 50,
    offset = 0,
  ): Promise<Page<Message>> {
    const args = [sessionId ?? null, status ?? null];
    const where = `WHERE ($1::text IS NULL OR m.session_id=$1) AND ($2::text IS NULL OR ${deliveryState("m")}=$2)`;
    const [result, count] = await Promise.all([
      this.pool.query(
        `SELECT ${fields} ${source} ${where} ORDER BY m.created_at DESC,m.id LIMIT $3 OFFSET $4`,
        [...args, limit, offset],
      ),
      this.pool.query(`SELECT COUNT(*)::int AS total ${source} ${where}`, args),
    ]);
    return { data: result.rows, total: count.rows[0].total, limit, offset };
  }
  async recoverInterrupted() {
    await this.pool.query(
      "UPDATE messages SET status='unknown',error='Processo interrompido durante envio. Confira o WhatsApp antes de repetir.' WHERE status='sending'",
    );
  }
}
