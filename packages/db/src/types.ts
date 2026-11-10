/**
 * JSONB document types. These describe the shape of the `jsonb`
 * columns in `schema.ts`. They carry no secrets: `authRequirements` holds only
 * public, non-secret configuration.
 */

export type TransportType = "http" | "sse" | "stdio";
export type ProtocolVersion = "2026-07-28" | "2025-11-25" | "2025-06-18" | "2025-03-26";
export type ServerStatus = "pending_grade" | "active" | "degraded" | "drift_quarantined" | "offline";

/** MCP Tool, per https://modelcontextprotocol.io/specification/2026-07-28/server/tools */
export interface McpToolAnnotation {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpToolIcon {
  src: string;
  mimeType?: string;
  sizes?: string[];
}

export interface McpToolSchemaDefinition {
  /** SHOULD be 1..128 chars of [A-Za-z0-9_.-]; non-conforming names are kept but lower the compliance score */
  name: string;
  title?: string;
  description?: string;
  /** Any JSON Schema 2020-12 keywords allowed (SEP-2106). Must be an object schema. */
  inputSchema: { type: "object"; properties?: Record<string, any>; [k: string]: unknown };
  outputSchema?: Record<string, unknown>;
  annotations?: McpToolAnnotation;
  icons?: McpToolIcon[];
  /** base64url SHA-256 (43 chars) of canonical {description,inputSchema,title}; */
  schemaFingerprint: string;
}

export interface McpToolLightweightSummary {
  name: string;
  title?: string;
  description: string;
  schemaFingerprint: string;
  annotations?: McpToolAnnotation;
}

export interface McpDefinitionBlock {
  protocolVersion: ProtocolVersion;
  transportType: TransportType;
  capabilities: {
    tools?: { listChanged?: boolean };
    resources?: { listChanged?: boolean; subscribe?: boolean };
    prompts?: { listChanged?: boolean };
    completions?: Record<string, never>;
    extensions?: Record<string, unknown>;
  };
  serverInfo: { name: string; version: string; title?: string };
  tools: McpToolSchemaDefinition[];
  /** tools rejected by the grader (e.g. invalid x-mcp-header), excluded from `tools` */
  rejectedTools?: Array<{ name: string; reason: string }>;
  baselineFingerprints: Record<string, string>;
  /** CacheableResult fields from tools/list (required in 2026-07-28) */
  ttlMs?: number;
  cacheScope?: "public" | "private";
}

/** Auth requirements: public, non-secret configuration only */
export interface PublicAuthRequirement {
  mode: "none";
}

export interface ByokAuthRequirement {
  mode: "byok";
  targetHeaderName: string;
  headerPrefix: string;
  documentationUrl: string;
  envVarHint?: string;
}

export interface VercelConnectAuthRequirement {
  mode: "vercel_connect";
  connectorType:
    | "slack"
    | "github"
    | "linear"
    | "microsoft-entra"
    | "snowflake"
    | "salesforce"
    | "oauth"
    | "api-key"
    | "custom";
  /** Documentation only, e.g. 'slack/<your-connector>'. NEVER used as a runtime fallback. */
  connectorUidExample: string;
  supportedSubjects: Array<"app" | "user">;
  requiredScopes: string[];
  resourceIndicators?: string[];
  requiresInstallationId: boolean;
  targetHeaderName: string;
  headerPrefix: string;
}

export type AuthRequirementsBlock = PublicAuthRequirement | ByokAuthRequirement | VercelConnectAuthRequirement;

/** Monetization: strictly peer-to-peer */
export interface FreeMonetizationBlock {
  model: "free";
}

export interface ExternalUrlMonetizationBlock {
  model: "external_payment_link";
  paymentLinkUrl: string;
  pricingSummary: string;
  currency: string;
  displayAmountCents: number;
  entitlementHeaderName: string;
}

export interface StripeConnectDirectChargeBlock {
  model: "stripe_connect_direct";
  stripeConnectedAccountId: `acct_${string}`;
  billingInterval: "session_24h" | "monthly_pass";
  currency: string;
  unitAmountCents: number;
  productName: string;
  platformApplicationFeeCents: 0;
  successUrlTemplate: string;
  cancelUrlTemplate: string;
}

export type MonetizationBlock = FreeMonetizationBlock | ExternalUrlMonetizationBlock | StripeConnectDirectChargeBlock;
