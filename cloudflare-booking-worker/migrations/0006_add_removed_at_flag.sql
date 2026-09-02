-- Compatibility migration retained because 0006 has already been recorded in production.
-- The removed_at column is created by 0005 on fresh databases, so this migration is intentionally a no-op.
SELECT 1;
