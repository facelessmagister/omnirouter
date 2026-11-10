ALTER TABLE "mcp_tools" ALTER COLUMN "embedding" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_tools" ADD COLUMN "embedding_model" varchar(64);--> statement-breakpoint
ALTER TABLE "mcp_tools" ADD CONSTRAINT "tool_embedding_model_present" CHECK ("mcp_tools"."embedding" IS NULL OR "mcp_tools"."embedding_model" IS NOT NULL);