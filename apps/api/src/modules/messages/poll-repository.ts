import type { Page, PollOverview } from "@wapp/contracts";
import type { Pool } from "../../database/pool.js";
import { deliveryState, deliveryJoin } from "./delivery-repository.js";

const source = `FROM (SELECT raw.*,
  CASE WHEN raw.kind='schedules' AND raw."deliveryStatus"='pending' THEN NULL
    ELSE COALESCE(raw."startedAt",raw."createdAt") +
      COALESCE((raw.poll->>'durationHours')::double precision,24)*INTERVAL '1 hour' END AS "expiresAt"
FROM (
  SELECT 'messages' AS kind,m.id AS "recordId",m.session_id AS "sessionId",
    m.recipient AS "to",m.content->'poll' AS poll,m.created_at AS "createdAt",
    m.sent_at AS "startedAt",m.whatsapp_message_id AS "messageId",
    ${deliveryState("m")} AS "deliveryStatus",NULL::timestamptz AS "sendAt"
  FROM messages m ${deliveryJoin("m")} WHERE m.type='poll'
  UNION ALL
  SELECT 'schedules',s.id,s.session_id,s.recipient,s.content->'poll',s.created_at,
    s.sent_at,s.whatsapp_message_id,${deliveryState("s")},s.send_at
  FROM schedules s ${deliveryJoin("s")} WHERE s.type='poll'
) raw) p`;

export class PollRepository {
  constructor(readonly pool: Pool) {}
  async list(
    sessionId?: string,
    limit = 50,
    offset = 0,
    state: "active" | "expired" | "all" = "active",
  ): Promise<Page<PollOverview>> {
    const where = `WHERE ($1::text IS NULL OR p."sessionId"=$1)
      AND ($4='all' OR ($4='active' AND (p."expiresAt" IS NULL OR p."expiresAt">NOW()))
        OR ($4='expired' AND p."expiresAt"<=NOW()))`;
    const [rows, count] = await Promise.all([
      this.pool.query(
        `SELECT p.*,(p."expiresAt"<=NOW()) IS TRUE AS "expired" ${source} ${where} ORDER BY p."createdAt" DESC,p."recordId",p.kind LIMIT $2 OFFSET $3`,
        [sessionId ?? null, limit, offset, state],
      ),
      this.pool.query(
        `SELECT COUNT(*)::int AS total ${source} ${where.replaceAll("$4", "$2")}`,
        [sessionId ?? null, state],
      ),
    ]);
    return { data: rows.rows, total: count.rows[0].total, limit, offset };
  }
  async pending(sessionId: string): Promise<PollOverview[]> {
    return (
      await this.pool.query(
        `SELECT p.*,(p."expiresAt"<=NOW()) IS TRUE AS expired ${source}
      LEFT JOIN poll_sync sync ON sync.session_id=p."sessionId" AND sync.message_id=p."messageId"
      WHERE p."sessionId"=$1 AND p."messageId" IS NOT NULL AND p."deliveryStatus"<>'cancelled'
        AND p."expiresAt">NOW()
      ORDER BY sync.last_checked_at ASC NULLS FIRST,p."createdAt" LIMIT 50`,
        [sessionId],
      )
    ).rows;
  }
}
