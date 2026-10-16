export const initialSchema = `
CREATE TABLE users (
  id UUID PRIMARY KEY, username VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','operator')),
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
CREATE TABLE sessions (
  id VARCHAR(64) PRIMARY KEY, name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE TABLE schedules (
  id UUID PRIMARY KEY, session_id VARCHAR(64) NOT NULL REFERENCES sessions(id),
  recipient TEXT NOT NULL, text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 4096),
  send_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','sending','sent','failed','unknown','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), sent_at TIMESTAMPTZ,
  whatsapp_message_id TEXT, error TEXT
);
CREATE INDEX schedules_due ON schedules(status, send_at);
CREATE TABLE messages (
  id UUID PRIMARY KEY, session_id VARCHAR(64) NOT NULL REFERENCES sessions(id),
  requested_by UUID NOT NULL REFERENCES users(id), recipient TEXT NOT NULL,
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 4096),
  status TEXT NOT NULL CHECK (status IN ('sending','sent','failed','unknown')),
  whatsapp_message_id TEXT, error TEXT, idempotency_key VARCHAR(128), request_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), sent_at TIMESTAMPTZ,
  UNIQUE(requested_by, idempotency_key)
);
CREATE INDEX messages_created ON messages(created_at DESC);
CREATE TABLE data_imports (name TEXT PRIMARY KEY, completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
`;
