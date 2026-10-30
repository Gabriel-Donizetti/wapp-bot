export const integrationTokensSchema = `
ALTER TABLE users ADD COLUMN type TEXT NOT NULL DEFAULT 'user'
  CHECK (type IN ('user','integration'));
ALTER TABLE users ALTER COLUMN username DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN api_token_hash TEXT UNIQUE;
ALTER TABLE users ADD CONSTRAINT users_auth_method CHECK (
  (type='user' AND username IS NOT NULL AND password_hash IS NOT NULL AND api_token_hash IS NULL)
  OR (type='integration' AND username IS NULL AND password_hash IS NULL AND role='operator')
);
`;
