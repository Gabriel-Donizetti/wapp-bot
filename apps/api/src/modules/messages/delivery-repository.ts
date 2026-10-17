import type { PoolClient } from "pg";
import type { Pool } from "../../database/pool.js";
export interface Receipt {
  sessionId: string;
  messageId: string;
  ack: number | null;
  checked?: boolean;
}
export const validAck = (ack: unknown): number | null =>
  typeof ack === "number" && Number.isInteger(ack) && ack >= -1 && ack <= 4
    ? ack
    : null;

export function deliveryState(alias: string) {
  return `CASE WHEN ${alias}.whatsapp_message_id IS NOT NULL THEN
    CASE r.ack WHEN -1 THEN 'failed' WHEN 1 THEN 'sent' WHEN 2 THEN 'delivered'
      WHEN 3 THEN 'read' WHEN 4 THEN 'played' ELSE 'submitted' END
    ELSE ${alias}.status END`;
}
export function deliveryJoin(alias: string) {
  return `LEFT JOIN message_receipts r ON r.session_id=${alias}.session_id AND r.message_id=${alias}.whatsapp_message_id`;
}
export function deliveryColumns(alias: string) {
  return `${deliveryState(alias)} AS status,
    ${alias}.whatsapp_message_id AS "messageId",
    CASE WHEN r.ack=-1 THEN 'O WhatsApp informou falha no envio. Confira a conversa antes de tentar novamente.'
      WHEN r.ack>=1 THEN NULL ELSE ${alias}.error END AS error,
    ${alias}.sent_at AS "submittedAt", r.server_at AS "sentAt",
    r.ack, r.delivered_at AS "deliveredAt", r.read_at AS "readAt", r.played_at AS "playedAt",
    r.last_ack_at AS "lastAckAt", r.last_checked_at AS "lastCheckedAt"`;
}

export async function recordReceipt(db: Pool | PoolClient, receipt: Receipt) {
  const ack = validAck(receipt.ack);
  await db.query(
    `INSERT INTO message_receipts(session_id,message_id,ack,server_at,delivered_at,read_at,played_at,last_ack_at,last_checked_at)
    VALUES ($1,$2,$3::smallint,CASE WHEN $3::smallint>=1 THEN NOW() END,CASE WHEN $3::smallint>=2 THEN NOW() END,
      CASE WHEN $3::smallint>=3 THEN NOW() END,CASE WHEN $3::smallint>=4 THEN NOW() END,CASE WHEN $3::smallint IS NOT NULL THEN NOW() END,CASE WHEN $4::boolean THEN NOW() END)
    ON CONFLICT(session_id,message_id) DO UPDATE SET
      ack=CASE
        WHEN EXCLUDED.ack IS NULL THEN message_receipts.ack
        WHEN message_receipts.ack>=1 THEN GREATEST(message_receipts.ack,EXCLUDED.ack)
        WHEN EXCLUDED.ack>=1 THEN EXCLUDED.ack
        WHEN message_receipts.ack=-1 OR EXCLUDED.ack=-1 THEN -1
        ELSE GREATEST(message_receipts.ack,EXCLUDED.ack) END,
      server_at=COALESCE(message_receipts.server_at,EXCLUDED.server_at),
      delivered_at=COALESCE(message_receipts.delivered_at,EXCLUDED.delivered_at),
      read_at=COALESCE(message_receipts.read_at,EXCLUDED.read_at),
      played_at=COALESCE(message_receipts.played_at,EXCLUDED.played_at),
      last_ack_at=COALESCE(EXCLUDED.last_ack_at,message_receipts.last_ack_at),
      last_checked_at=COALESCE(EXCLUDED.last_checked_at,message_receipts.last_checked_at)`,
    [receipt.sessionId, receipt.messageId, ack, receipt.checked ?? false],
  );
}
export class DeliveryRepository {
  constructor(readonly pool: Pool) {}
  async observe(receipt: Receipt) {
    await recordReceipt(this.pool, receipt);
  }
  async checked(sessionId: string, messageId: string) {
    await this.pool.query(
      "UPDATE message_receipts SET last_checked_at=NOW() WHERE session_id=$1 AND message_id=$2",
      [sessionId, messageId],
    );
  }
  async pending(sessionId: string, limit = 50): Promise<Receipt[]> {
    return (
      await this.pool.query(
        `SELECT DISTINCT r.session_id AS "sessionId",r.message_id AS "messageId",r.ack,r.last_checked_at
      FROM message_receipts r JOIN (
        SELECT session_id,whatsapp_message_id,type FROM messages WHERE whatsapp_message_id IS NOT NULL AND status<>'cancelled'
        UNION ALL SELECT session_id,whatsapp_message_id,type FROM schedules WHERE whatsapp_message_id IS NOT NULL AND status<>'cancelled'
      ) sent ON sent.session_id=r.session_id AND sent.whatsapp_message_id=r.message_id
      WHERE r.session_id=$1 AND (r.ack IS NULL OR r.ack<=2 OR (r.ack=3 AND sent.type IN ('voice','audio')))
      ORDER BY r.last_checked_at ASC NULLS FIRST,"messageId" LIMIT $2`,
        [sessionId, limit],
      )
    ).rows;
  }
}
