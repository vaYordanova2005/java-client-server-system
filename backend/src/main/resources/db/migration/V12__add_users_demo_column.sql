-- Flags the two fixed restricted demo accounts (see RestrictedDemoAccountSeeder):
-- read access as normal, every write blocked with a friendly message.
ALTER TABLE users ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE;
