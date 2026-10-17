export const deliveryReceiptsSchema = `
CREATE TABLE message_receipts (
  session_id VARCHAR(64) NOT NULL REFERENCES sessions(id),
  message_id TEXT NOT NULL,
  ack SMALLINT CHECK (ack BETWEEN -1 AND 4),
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  played_at TIMESTAMPTZ,
  last_ack_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  PRIMARY KEY (session_id, message_id)
);
CREATE INDEX messages_whatsapp_id ON messages(session_id,whatsapp_message_id);
CREATE INDEX schedules_whatsapp_id ON schedules(session_id,whatsapp_message_id);
-- IDs legados comprovam submissão, mas não contêm um ACK de entrega.
INSERT INTO message_receipts(session_id,message_id,first_observed_at)
SELECT session_id,whatsapp_message_id,COALESCE(sent_at,created_at)
FROM messages WHERE whatsapp_message_id IS NOT NULL
UNION ALL
SELECT session_id,whatsapp_message_id,COALESCE(sent_at,created_at)
FROM schedules WHERE whatsapp_message_id IS NOT NULL
ON CONFLICT DO NOTHING;
`;
