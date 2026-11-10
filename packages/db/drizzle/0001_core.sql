CREATE TYPE "omnirouter"."auth_mode" AS ENUM('none', 'byok', 'vercel_connect');--> statement-breakpoint
CREATE TYPE "omnirouter"."grade_outcome" AS ENUM('pass', 'degraded', 'drift', 'fail', 'error');--> statement-breakpoint
CREATE TYPE "omnirouter"."monetization_model" AS ENUM('free', 'external_payment_link', 'stripe_connect_direct');--> statement-breakpoint
CREATE TYPE "omnirouter"."server_source" AS ENUM('crawler', 'vendor_registration', 'manual');--> statement-breakpoint
CREATE TYPE "omnirouter"."server_status" AS ENUM('pending_grade', 'active', 'degraded', 'drift_quarantined', 'offline');--> statement-breakpoint
CREATE TYPE "omnirouter"."source_kind" AS ENUM('official_registry', 'smithery', 'apify', 'claude_marketplace', 'claude_plugins_repo', 'hermes_marketplace', 'github', 'npm', 'pypi', 'well_known', 'vendor_registration', 'legacy_import');--> statement-breakpoint
CREATE TYPE "omnirouter"."transport_type" AS ENUM('http', 'sse', 'stdio');--> statement-breakpoint
CREATE TYPE "omnirouter"."verification_class" AS ENUM('verified', 'oauth_required', 'byok_required', 'payment_required', 'broken');--> statement-breakpoint
CREATE TABLE "omnirouter"."mcp_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(128) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text NOT NULL,
	"description_source" varchar(32) DEFAULT 'registry' NOT NULL,
	"intent_summary" text,
	"transport_type" "omnirouter"."transport_type" NOT NULL,
	"endpoint_url" text,
	"package_identifier" varchar(256),
	"install_command" varchar(512),
	"repository_url" text,
	"source" "omnirouter"."server_source" NOT NULL,
	"owner_verified_at" timestamp with time zone,
	"owner_api_key_id" uuid,
	"status" "omnirouter"."server_status" DEFAULT 'pending_grade' NOT NULL,
	"auth_mode" "omnirouter"."auth_mode" NOT NULL,
	"monetization_model" "omnirouter"."monetization_model" DEFAULT 'free' NOT NULL,
	"mcp_definition" jsonb,
	"auth_requirements" jsonb NOT NULL,
	"monetization" jsonb DEFAULT '{"model":"free"}'::jsonb NOT NULL,
	"trust_score" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"uptime_percentage" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"latency_p50_ms" integer DEFAULT 0 NOT NULL,
	"latency_p95_ms" integer DEFAULT 0 NOT NULL,
	"drift_detected" boolean DEFAULT false NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"verification_class" "omnirouter"."verification_class",
	"popularity_score" integer,
	"verified_tier" varchar(32),
	"first_listed_at" timestamp with time zone,
	"embedding" vector(1024),
	"embedding_model" varchar(64),
	"embedding_input_hash" varchar(64),
	"last_graded_at" timestamp with time zone,
	"next_grade_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slug_format" CHECK ("mcp_servers"."slug" ~ '^[a-z0-9][a-z0-9-]{1,126}[a-z0-9]$'),
	CONSTRAINT "remote_requires_endpoint" CHECK (("mcp_servers"."transport_type" = 'stdio') = ("mcp_servers"."endpoint_url" IS NULL)),
	CONSTRAINT "stdio_requires_package" CHECK ("mcp_servers"."transport_type" <> 'stdio' OR "mcp_servers"."package_identifier" IS NOT NULL),
	CONSTRAINT "endpoint_https" CHECK ("mcp_servers"."endpoint_url" IS NULL OR "mcp_servers"."endpoint_url" LIKE 'https://%'),
	CONSTRAINT "auth_mode_matches_json" CHECK ("mcp_servers"."auth_mode"::text = "mcp_servers"."auth_requirements"->>'mode'),
	CONSTRAINT "monetization_matches_json" CHECK ("mcp_servers"."monetization_model"::text = "mcp_servers"."monetization"->>'model'),
	CONSTRAINT "active_has_embedding" CHECK ("mcp_servers"."status" NOT IN ('active','degraded') OR ("mcp_servers"."embedding" IS NOT NULL AND "mcp_servers"."mcp_definition" IS NOT NULL)),
	CONSTRAINT "trust_range" CHECK ("mcp_servers"."trust_score" BETWEEN 0 AND 100),
	CONSTRAINT "active_not_broken" CHECK ("mcp_servers"."status" NOT IN ('active','degraded') OR "mcp_servers"."verification_class" IS DISTINCT FROM 'broken')
);
--> statement-breakpoint
CREATE TABLE "omnirouter"."mcp_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"tool_name" varchar(256) NOT NULL,
	"tool_title" varchar(256),
	"tool_description" text DEFAULT '' NOT NULL,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb,
	"annotations" jsonb,
	"schema_fingerprint" varchar(64) NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "omnirouter"."server_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"source" "omnirouter"."source_kind" NOT NULL,
	"source_id" varchar(256) NOT NULL,
	"listing_url" text,
	"raw_popularity" integer,
	"verified_tier" varchar(32),
	"category" varchar(64),
	"metadata" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delisted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "omnirouter"."mcp_tools" ADD CONSTRAINT "mcp_tools_server_id_mcp_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "omnirouter"."mcp_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "omnirouter"."server_sources" ADD CONSTRAINT "server_sources_server_id_mcp_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "omnirouter"."mcp_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_servers_slug_uidx" ON "omnirouter"."mcp_servers" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_servers_endpoint_uidx" ON "omnirouter"."mcp_servers" USING btree ("endpoint_url") WHERE "mcp_servers"."endpoint_url" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_servers_package_uidx" ON "omnirouter"."mcp_servers" USING btree ("package_identifier") WHERE "mcp_servers"."package_identifier" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "mcp_servers_embedding_hnsw_idx" ON "omnirouter"."mcp_servers" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX "mcp_servers_filter_idx" ON "omnirouter"."mcp_servers" USING btree ("status","transport_type","auth_mode","monetization_model");--> statement-breakpoint
CREATE INDEX "mcp_servers_next_grade_idx" ON "omnirouter"."mcp_servers" USING btree ("next_grade_at") WHERE "mcp_servers"."status" <> 'offline';--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_tools_server_tool_uidx" ON "omnirouter"."mcp_tools" USING btree ("server_id","tool_name");--> statement-breakpoint
CREATE INDEX "mcp_tools_embedding_hnsw_idx" ON "omnirouter"."mcp_tools" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "server_sources_unique_idx" ON "omnirouter"."server_sources" USING btree ("server_id","source","source_id");--> statement-breakpoint
CREATE INDEX "server_sources_source_pop_idx" ON "omnirouter"."server_sources" USING btree ("source","raw_popularity" DESC NULLS LAST);