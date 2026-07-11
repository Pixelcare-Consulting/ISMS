-- Run once against local Postgres after first migration
-- Example: psql "$DATABASE_URL" -f database/extensions.sql
-- Or: docker compose exec -T postgres psql -U isms -d isms < database/extensions.sql
CREATE EXTENSION IF NOT EXISTS "pgvector";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
