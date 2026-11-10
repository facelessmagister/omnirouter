-- 0000_extensions. Must run before 0001_core: the schema, the vector
-- column, gen_random_uuid() default and the HNSW index all depend on this file.
CREATE SCHEMA IF NOT EXISTS "omnirouter";

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Filtered ANN: let HNSW keep scanning until LIMIT is satisfied after WHERE filters.
-- The roles are created in 0004_roles; these ALTERs are applied there instead so this
-- migration stays runnable on a database where the roles do not exist yet.
