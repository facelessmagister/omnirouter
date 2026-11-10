/**
 * Drizzle schema.
 *
 * The relational columns are the source of truth for every filter; JSONB carries
 * documents, and CHECK constraints keep each enum column consistent with its JSONB
 * counterpart. There is no credential, wallet or balance table here.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  vector,
} from "drizzle-orm/pg-core";
import type { AuthRequirementsBlock, McpDefinitionBlock, MonetizationBlock } from "./types";

export const serverStatusEnum = pgEnum("server_status", [
  "pending_grade",
  "active",
  "degraded",
  "drift_quarantined",
  "offline",
]);
export const transportTypeEnum = pgEnum("transport_type", ["http", "sse", "stdio"]);
export const authModeEnum = pgEnum("auth_mode", ["none", "byok", "vercel_connect"]);
export const monetizationModelEnum = pgEnum("monetization_model", [
  "free",
  "external_payment_link",
  "stripe_connect_direct",
]);
export const serverSourceEnum = pgEnum("server_source", ["crawler", "vendor_registration", "manual"]);
export const gradeOutcomeEnum = pgEnum("grade_outcome", ["pass", "degraded", "drift", "fail", "error"]);
/** How a target responded. 'oauth_required' is reachable-and-correct, NOT a failure. */
export const verificationClassEnum = pgEnum("verification_class", [
  "verified",
  "oauth_required",
  "byok_required",
  "payment_required",
  "broken",
]);
/** Where the entry came from. One row per (server, source) lives in server_sources. */
export const sourceKindEnum = pgEnum("source_kind", [
  "official_registry",
  "smithery",
  "apify",
  "claude_marketplace",
  "claude_plugins_repo",
  "hermes_marketplace",
  "github",
  "npm",
  "pypi",
  "well_known",
  "vendor_registration",
  "legacy_import",
]);

/** Core index of MCP servers */
export const mcpServers = pgTable(
  "mcp_servers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 128 }).notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    /** VERBATIM provider copy (registry entry / repo README). Never marketplace prose. */
    description: text("description").notNull(),
    /** Provenance of `description`: 'registry' | 'readme' | 'vendor' */
    descriptionSource: varchar("description_source", { length: 32 }).notNull().default("registry"),
    /** DERIVED by OmniRouter from tool names + schemas. Ours, not anyone else's prose. */
    intentSummary: text("intent_summary"),

    transportType: transportTypeEnum("transport_type").notNull(),
    endpointUrl: text("endpoint_url"),
    /** Canonical, versioned package ref, e.g. 'npm:@modelcontextprotocol/server-postgres@0.6.2' */
    packageIdentifier: varchar("package_identifier", { length: 256 }),
    installCommand: varchar("install_command", { length: 512 }),
    repositoryUrl: text("repository_url"),

    source: serverSourceEnum("source").notNull(),
    ownerVerifiedAt: timestamp("owner_verified_at", { withTimezone: true }),
    ownerApiKeyId: uuid("owner_api_key_id"),

    status: serverStatusEnum("status").default("pending_grade").notNull(),
    authMode: authModeEnum("auth_mode").notNull(),
    monetizationModel: monetizationModelEnum("monetization_model").default("free").notNull(),

    mcpDefinition: jsonb("mcp_definition").$type<McpDefinitionBlock>(),
    authRequirements: jsonb("auth_requirements").$type<AuthRequirementsBlock>().notNull(),
    monetization: jsonb("monetization").$type<MonetizationBlock>().default({ model: "free" }).notNull(),

    trustScore: numeric("trust_score", { precision: 5, scale: 2 }).default("0.00").notNull(),
    uptimePercentage: numeric("uptime_percentage", { precision: 5, scale: 2 }).default("0.00").notNull(),
    latencyP50Ms: integer("latency_p50_ms").default(0).notNull(),
    latencyP95Ms: integer("latency_p95_ms").default(0).notNull(),
    driftDetected: boolean("drift_detected").default(false).notNull(),
    consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
    verificationClass: verificationClassEnum("verification_class"),
    popularityScore: integer("popularity_score"),
    verifiedTier: varchar("verified_tier", { length: 32 }),
    firstListedAt: timestamp("first_listed_at", { withTimezone: true }),

    embedding: vector("embedding", { dimensions: 1024 }),
    embeddingModel: varchar("embedding_model", { length: 64 }),
    /** sha256 of the exact text embedded (intentSummary + tool names). v1's 384-dim vectors are NOT reused. */
    embeddingInputHash: varchar("embedding_input_hash", { length: 64 }),

    lastGradedAt: timestamp("last_graded_at", { withTimezone: true }),
    nextGradeAt: timestamp("next_grade_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("mcp_servers_slug_uidx").on(t.slug),
    uniqueIndex("mcp_servers_endpoint_uidx").on(t.endpointUrl).where(sql`${t.endpointUrl} IS NOT NULL`),
    uniqueIndex("mcp_servers_package_uidx").on(t.packageIdentifier).where(sql`${t.packageIdentifier} IS NOT NULL`),

    // HNSW (cosine). Used because the discovery query orders by distance.
    index("mcp_servers_embedding_hnsw_idx")
      .using("hnsw", t.embedding.op("vector_cosine_ops"))
      .with({ m: 16, ef_construction: 64 }),
    index("mcp_servers_filter_idx").on(t.status, t.transportType, t.authMode, t.monetizationModel),
    index("mcp_servers_next_grade_idx").on(t.nextGradeAt).where(sql`${t.status} <> 'offline'`),

    check("slug_format", sql`${t.slug} ~ '^[a-z0-9][a-z0-9-]{1,126}[a-z0-9]$'`),
    check("remote_requires_endpoint", sql`(${t.transportType} = 'stdio') = (${t.endpointUrl} IS NULL)`),
    check("stdio_requires_package", sql`${t.transportType} <> 'stdio' OR ${t.packageIdentifier} IS NOT NULL`),
    check("endpoint_https", sql`${t.endpointUrl} IS NULL OR ${t.endpointUrl} LIKE 'https://%'`),
    check("auth_mode_matches_json", sql`${t.authMode}::text = ${t.authRequirements}->>'mode'`),
    check("monetization_matches_json", sql`${t.monetizationModel}::text = ${t.monetization}->>'model'`),
    check(
      "active_has_embedding",
      sql`${t.status} NOT IN ('active','degraded') OR (${t.embedding} IS NOT NULL AND ${t.mcpDefinition} IS NOT NULL)`,
    ),
    check("trust_range", sql`${t.trustScore} BETWEEN 0 AND 100`),
    check(
      "active_not_broken",
      sql`${t.status} NOT IN ('active','degraded') OR ${t.verificationClass} IS DISTINCT FROM 'broken'`,
    ),
  ],
);

/** Tool-level index for search_granularity = 'tool' */
export const mcpTools = pgTable(
  "mcp_tools",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => mcpServers.id, { onDelete: "cascade" }),
    toolName: varchar("tool_name", { length: 256 }).notNull(),
    toolTitle: varchar("tool_title", { length: 256 }),
    toolDescription: text("tool_description").notNull().default(""),
    inputSchema: jsonb("input_schema").$type<Record<string, unknown>>().notNull(),
    outputSchema: jsonb("output_schema").$type<Record<string, unknown>>(),
    annotations: jsonb("annotations").$type<Record<string, unknown>>(),
    /** base64url SHA-256, 43 chars */
    schemaFingerprint: varchar("schema_fingerprint", { length: 64 }).notNull(),
    /** NULL until the tool is embedded. Rows arrive before vectors (import, first grade);
     *  the check below keeps a vector from landing without a model tag. */
    embedding: vector("embedding", { dimensions: 1024 }),
    /** e.g. 'bge-large-en-v1.5:cls' — records which model produced `embedding`. */
    embeddingModel: varchar("embedding_model", { length: 64 }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("mcp_tools_server_tool_uidx").on(t.serverId, t.toolName),
    index("mcp_tools_embedding_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    check("tool_embedding_model_present", sql`${t.embedding} IS NULL OR ${t.embeddingModel} IS NOT NULL`),
  ],
);

/** Provenance: which catalogue(s) list this server, and with what metadata. */
export const serverSources = pgTable(
  "server_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => mcpServers.id, { onDelete: "cascade" }),
    source: sourceKindEnum("source").notNull(),
    /** Stable id inside that source: qualifiedName, plugin name, marketplace slug, registry name */
    sourceId: varchar("source_id", { length: 256 }).notNull(),
    listingUrl: text("listing_url"),
    /** Raw popularity as published by THAT source (compare only within the same source) */
    rawPopularity: integer("raw_popularity"),
    verifiedTier: varchar("verified_tier", { length: 32 }),
    category: varchar("category", { length: 64 }),
    /** Source-specific extras (plugin source sha, actor pricing, etc.) — untrusted */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    /** Set when the listing disappears from the source; server itself is NOT deleted on source removal */
    delistedAt: timestamp("delisted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("server_sources_unique_idx").on(t.serverId, t.source, t.sourceId),
    index("server_sources_source_pop_idx").on(t.source, t.rawPopularity.desc()),
  ],
);
