import { randomUUID } from "node:crypto";
import type { Schedule, Page } from "@wapp/contracts";
import { transaction, type Pool } from "../../database/pool.js";
import { AppError } from "../../shared/errors.js";
import type { MessageInput } from "../../shared/validation.js";

import {
  normalize,
  preview,
  messageText,
} from "../messages/message-content.js";

import {
  deliveryColumns,
  deliveryJoin,
  deliveryState,
  recordReceipt,
} from "../messages/delivery-repository.js";
export const scheduleFields = `s.id,s.session_id AS "sessionId",s.recipient AS "to",s.text,s.type,s.content,s.send_at AS "sendAt",s.created_at AS "createdAt",${deliveryColumns("s")}`;
const source = `FROM schedules s ${deliveryJoin("s")}`;
export class ScheduleRepository {
  constructor(readonly pool: Pool) {}
  async create(input: MessageInput & { sendAt: string }): Promise<Schedule> {
    const { sendAt: _, ...message } = input;
    const data = normalize(message);
    const result = await this.pool.query(
      `WITH active AS (SELECT id FROM sessions WHERE id=$2 AND deleted_at IS NULL FOR SHARE)
      INSERT INTO schedules(id,session_id,recipient,text,send_at,status,type,content,payload)
      SELECT $1,s.id,$3,$4,$5,'pending',$6,$7,$8 FROM active s RETURNING id`,
      [
        randomUUID(),
        input.sessionId,
        input.to,
        messageText(data),
        input.sendAt,
        data.type,
        JSON.stringify(preview(data)),
        JSON.stringify(data),
      ],
    );
    if (!result.rowCount)
      throw new AppError(404, "SESSION_NOT_FOUND", "Sessão não encontrada.");
    return this.get(result.rows[0].id);
  }
  async list(
    sessionId?: string,
    status?: string,
    limit = 50,
    offset = 0,
    order: "asc" | "desc" = "desc",
  ): Promise<Page<Schedule>> {
    const args = [sessionId ?? null, status ?? null];
    const where = `WHERE ($1::text IS NULL OR s.session_id=$1) AND ($2::text IS NULL OR ${deliveryState("s")}=$2)`;
    const [rows, count] = await Promise.all([
      this.pool.query(
        `SELECT ${scheduleFields} ${source} ${where} ORDER BY s.send_at ${order === "asc" ? "ASC" : "DESC"},s.id LIMIT $3 OFFSET $4`,
        [...args, limit, offset],
      ),
      this.pool.query(`SELECT COUNT(*)::int AS total ${source} ${where}`, args),
    ]);
    return { data: rows.rows, total: count.rows[0].total, limit, offset };
  }
  async get(id: string): Promise<Schedule> {
    const row = (
      await this.pool.query(
        `SELECT ${scheduleFields} ${source} WHERE s.id=$1`,
        [id],
      )
    ).rows[0];
    if (!row)
      throw new AppError(
        404,
        "SCHEDULE_NOT_FOUND",
        "Agendamento não encontrado.",
      );
    return row;
  }
  async cancel(id: string): Promise<Schedule> {
    const result = await this.pool.query(
      `UPDATE schedules SET status='cancelled',payload=NULL WHERE id=$1 AND status='pending' RETURNING id`,
      [id],
    );
    if (result.rowCount) return this.get(result.rows[0].id);
    await this.get(id);
    throw new AppError(
      409,
      "SCHEDULE_NOT_PENDING",
      "Só é possível cancelar agendamentos pendentes.",
    );
  }
  async due(now: string): Promise<Schedule[]> {
    return (
      await this.pool.query(
        `SELECT ${scheduleFields} ${source} WHERE s.status='pending' AND s.send_at <= $1 ORDER BY s.send_at`,
        [now],
      )
    ).rows;
  }
  async deliveryInput(id: string): Promise<MessageInput> {
    const row = (
      await this.pool.query(
        'SELECT payload,session_id AS "sessionId",recipient AS "to",text FROM schedules WHERE id=$1',
        [id],
      )
    ).rows[0];
    if (!row)
      throw new AppError(
        404,
        "SCHEDULE_NOT_FOUND",
        "Agendamento não encontrado.",
      );
    return (
      row.payload ?? { sessionId: row.sessionId, to: row.to, text: row.text }
    );
  }
  async claim(id: string) {
    return (
      (
        await this.pool.query(
          "UPDATE schedules SET status='sending' WHERE id=$1 AND status='pending' RETURNING id",
          [id],
        )
      ).rowCount === 1
    );
  }
  async finish(
    id: string,
    status: Schedule["status"],
    messageId: string | null,
    error: string | null,
    ack: number | null = null,
  ) {
    await transaction(this.pool, async (client) => {
      const result = await client.query(
        "UPDATE schedules SET status=$2, payload=CASE WHEN $2 IN ('sent','failed','unknown','cancelled') THEN NULL ELSE payload END, whatsapp_message_id=$3, error=$4, sent_at=CASE WHEN $2='sent' THEN NOW() ELSE NULL END WHERE id=$1 AND (whatsapp_message_id IS NULL OR $3::text IS NOT NULL) RETURNING session_id",
        [id, status, messageId, error],
      );
      if (messageId && result.rowCount)
        await recordReceipt(client, {
          sessionId: result.rows[0].session_id,
          messageId,
          ack,
        });
    });
  }
  async recoverInterrupted() {
    await this.pool.query(
      "UPDATE schedules SET status='unknown', payload=NULL, error='Processo interrompido durante envio. Confira o WhatsApp antes de reagendar.' WHERE status='sending'",
    );
  }
}
