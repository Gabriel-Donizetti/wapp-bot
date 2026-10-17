import type { Page, PollOverview } from "@wapp/contracts";
import type { Pool } from "../../database/pool.js";
import { deliveryState, deliveryJoin } from "./delivery-repository.js";

const source = `FROM (
  SELECT 'messages' AS kind,m.id AS "recordId",m.session_id AS "sessionId",
    m.recipient AS "to",m.content->'poll' AS poll,m.created_at AS "createdAt",
    m.sent_at AS "startedAt",m.whatsapp_message_id AS "messageId",
    ${deliveryState("m")} AS "deliveryStatus",NULL::timestamptz AS "sendAt"
  FROM messages m ${deliveryJoin("m")} WHERE m.type='poll'
  UNION ALL
  SELECT 'schedules',s.id,s.session_id,s.recipient,s.content->'poll',s.created_at,
    s.sent_at,s.whatsapp_message_id,${deliveryState("s")},s.send_at
  FROM schedules s ${deliveryJoin("s")} WHERE s.type='poll'
) p`;

export class PollRepository {
  constructor(readonly pool: Pool) {}
  async list(
    sessionId?: string,
    limit = 50,
    offset = 0,
  ): Promise<Page<PollOverview>> {
    const where = 'WHERE ($1::text IS NULL OR p."sessionId"=$1)';
    const [rows, count] = await Promise.all([
      this.pool.query(
        `SELECT p.* ${source} ${where} ORDER BY p."createdAt" DESC,p."recordId",p.kind LIMIT $2 OFFSET $3`,
        [sessionId ?? null, limit, offset],
      ),
      this.pool.query(`SELECT COUNT(*)::int AS total ${source} ${where}`, [
        sessionId ?? null,
      ]),
    ]);
    return { data: rows.rows, total: count.rows[0].total, limit, offset };
  }
}
