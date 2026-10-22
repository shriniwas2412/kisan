-- Failed sign-in attempts, for rate limiting. `key` is "email:<address>" or
-- "ip:<sha-256 of the address>"; raw IP addresses are never stored.
CREATE TABLE login_attempt (key TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX login_attempt_key_at ON login_attempt(key, at);
