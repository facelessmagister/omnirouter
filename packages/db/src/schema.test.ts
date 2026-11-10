import { describe, expect, it } from "vitest";
import {
  authModeEnum,
  mcpServers,
  mcpTools,
  serverSources,
  serverStatusEnum,
  sourceKindEnum,
  transportTypeEnum,
  verificationClassEnum,
} from "./schema";

/**
 * These lock in the structural guarantees the schema is responsible for. They are cheap and
 * catch the two mistakes that are hardest to undo later: a credential/funds column creeping
 * in, and an enum drifting from what the rest of the code expects.
 */
describe("schema guardrails", () => {
  it("has no credential, wallet or balance column on any table", () => {
    // `owner_api_key_id` is allowed on purpose: it points at a *hashed* key row, which is an
    // identifier, not a secret. Everything else here would mean we started storing something
    // we must not.
    const forbidden =
      /access_?token|refresh_?token|client_?secret|password|credential|wallet|ledger|balance|payout|voucher/i;
    for (const table of [mcpServers, mcpTools, serverSources]) {
      for (const column of Object.values(table)) {
        const name = (column as { name?: string }).name ?? "";
        expect(name).not.toMatch(forbidden);
      }
    }
  });

  it("keeps the status machine closed to the five known states", () => {
    expect(serverStatusEnum.enumValues).toEqual([
      "pending_grade",
      "active",
      "degraded",
      "drift_quarantined",
      "offline",
    ]);
  });

  it("treats 'oauth_required' as a distinct class, not a failure", () => {
    // A 401 carrying OAuth metadata means the server is healthy and gated, so it must be its
    // own class. Collapsing it into 'broken' would overstate the failure rate.
    expect(verificationClassEnum.enumValues).toContain("oauth_required");
    expect(verificationClassEnum.enumValues).toContain("broken");
    expect(verificationClassEnum.enumValues).not.toContain("oauth_failed");
  });

  it("supports exactly the transports the executor can speak", () => {
    expect(transportTypeEnum.enumValues).toEqual(["http", "sse", "stdio"]);
  });

  it("records every auth mode the gateway implements", () => {
    expect(authModeEnum.enumValues).toEqual(["none", "byok", "vercel_connect"]);
  });

  it("keeps a dedicated provenance kind for imported listings", () => {
    expect(sourceKindEnum.enumValues).toContain("legacy_import");
    expect(sourceKindEnum.enumValues).toContain("official_registry");
  });

  it("declares the 1024-dimension embedding columns used by vector search", () => {
    // Dimensions are structural: a differently-sized vector cannot share the column, and the
    // HNSW index is built for cosine distance over exactly this size.
    const dims = (c: unknown) => (c as { config: { dimensions: number } }).config.dimensions;
    expect(dims(mcpServers.embedding)).toBe(1024);
    expect(dims(mcpTools.embedding)).toBe(1024);
  });
});
