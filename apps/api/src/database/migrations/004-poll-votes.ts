export const pollVotesSchema = `
CREATE TABLE poll_votes (
  session_id VARCHAR(64) NOT NULL REFERENCES sessions(id),
  message_id TEXT NOT NULL,
  voter TEXT NOT NULL,
  voted_at TIMESTAMPTZ NOT NULL,
  options JSONB NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(session_id,message_id,voter,voted_at)
);
CREATE TABLE poll_sync (
  session_id VARCHAR(64) NOT NULL REFERENCES sessions(id),
  message_id TEXT NOT NULL,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  PRIMARY KEY(session_id,message_id)
);
-- A ausência de prazo em registros antigos passa a significar um dia.
UPDATE messages SET content=jsonb_set(content,'{poll,durationHours}','24'::jsonb)
WHERE type='poll' AND content->'poll' IS NOT NULL AND NOT (content->'poll' ? 'durationHours');
UPDATE schedules SET content=jsonb_set(content,'{poll,durationHours}','24'::jsonb),
  payload=CASE WHEN payload IS NOT NULL THEN jsonb_set(payload,'{poll,durationHours}','24'::jsonb) ELSE NULL END
WHERE type='poll' AND content->'poll' IS NOT NULL AND NOT (content->'poll' ? 'durationHours');
`;
