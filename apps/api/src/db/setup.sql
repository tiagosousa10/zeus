CREATE TABLE IF NOT EXISTS "user" (id text PRIMARY KEY,name text NOT NULL,email text NOT NULL UNIQUE,"emailVerified" boolean NOT NULL DEFAULT false,image text,"createdAt" timestamptz NOT NULL,"updatedAt" timestamptz NOT NULL,"twoFactorEnabled" boolean DEFAULT false,role text NOT NULL DEFAULT 'member',active boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS session (id text PRIMARY KEY,"expiresAt" timestamptz NOT NULL,token text NOT NULL UNIQUE,"createdAt" timestamptz NOT NULL,"updatedAt" timestamptz NOT NULL,"ipAddress" text,"userAgent" text,"userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS session_user_idx ON session("userId");
CREATE TABLE IF NOT EXISTS account (id text PRIMARY KEY,"accountId" text NOT NULL,"providerId" text NOT NULL,"userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,"accessToken" text,"refreshToken" text,"idToken" text,"accessTokenExpiresAt" timestamptz,"refreshTokenExpiresAt" timestamptz,scope text,password text,"createdAt" timestamptz NOT NULL,"updatedAt" timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS account_user_idx ON account("userId");
CREATE TABLE IF NOT EXISTS verification (id text PRIMARY KEY,identifier text NOT NULL,value text NOT NULL,"expiresAt" timestamptz NOT NULL,"createdAt" timestamptz NOT NULL,"updatedAt" timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS "twoFactor" (id text PRIMARY KEY,secret text NOT NULL,"backupCodes" text NOT NULL,"userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,verified boolean DEFAULT false);
CREATE INDEX IF NOT EXISTS two_factor_user_idx ON "twoFactor"("userId");
CREATE TABLE IF NOT EXISTS member_state (user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,ciphertext text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS invite (id text PRIMARY KEY,email text NOT NULL,token_hash text NOT NULL UNIQUE,created_by text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,used_at timestamptz);
CREATE TABLE IF NOT EXISTS addon (id text PRIMARY KEY,name text NOT NULL,description text NOT NULL DEFAULT '',manifest_url text NOT NULL UNIQUE,status text NOT NULL DEFAULT 'pending');

ALTER TABLE "twoFactor" ADD COLUMN IF NOT EXISTS "failedVerificationCount" integer DEFAULT 0;
ALTER TABLE "twoFactor" ADD COLUMN IF NOT EXISTS "lockedUntil" timestamptz;
CREATE TABLE IF NOT EXISTS verified_session (session_id text PRIMARY KEY REFERENCES session(id) ON DELETE CASCADE);

ALTER TABLE addon ADD COLUMN IF NOT EXISTS config_fields jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE addon ADD COLUMN IF NOT EXISTS configuration_required boolean NOT NULL DEFAULT false;
ALTER TABLE addon ADD COLUMN IF NOT EXISTS configurable boolean NOT NULL DEFAULT false;
ALTER TABLE addon ADD COLUMN IF NOT EXISTS resources jsonb NOT NULL DEFAULT '["stream"]'::jsonb;
