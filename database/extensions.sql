-- Postgres extensions the schema relies on. Applied by the `migrator` service
-- on every deploy (idempotent), or by hand:
--   psql "$DIRECT_URL" -f database/extensions.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- pgvector is not used by any migration and is not bundled in postgres:*-alpine.
-- If it is ever needed, switch the postgres image to pgvector/pgvector:pg16 and add:
-- CREATE EXTENSION IF NOT EXISTS "vector";
