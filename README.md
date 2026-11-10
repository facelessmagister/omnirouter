# OmniRouter

The discovery and execution layer for AI agent tools.

An agent searches for a capability, inspects its schema, and executes it through one endpoint.
OmniRouter stores no user credentials, holds no funds, and takes no markup.

> **Status: early development.** The database layer exists and works. The HTTP surface, the
> grading sandbox and the crawler are not built yet. Nothing here is production-ready.

## What works today

- **Database schema** (`packages/db`) — Drizzle definitions and migrations for an MCP server
  catalogue: servers, tools, and the provenance of each listing.
- **Vector search** — 1024-dimension embeddings with HNSW indexes on both server and tool
  granularity, verified to use the index rather than a sequential scan.
- **Guardrails as code** (`scripts/check-rules.mjs`) — a linter that fails the build when a
  change would, for example, introduce a credential column, a wallet table, or wholesale
  request-header forwarding.

## Design principles

| Principle | Why |
| :--- | :--- |
| **No credentials stored** | A credential vault is a liability. Callers bring their own keys for the length of one request. |
| **No money held** | Payments go directly to vendors on their own connected accounts. OmniRouter is never a merchant of record. |
| **Ranking in the database** | Approximate-nearest-neighbour search runs in Postgres, index-first, so latency does not scale with catalogue size. |
| **Provider copy stays provider copy** | Descriptions are stored verbatim with their source. Derived summaries are ours and are labelled as such. |

## Layout

```
packages/db/          Drizzle schema, migrations, JSONB types
scripts/              Guardrail linter, contract checker
.github/workflows/    CI
```

## Development

Requires Node ≥ 24 and pnpm 12.

```sh
pnpm install
pnpm verify        # typecheck → lint → test → integration → contract → guardrails
```

`check-contract` reports **NOT IMPLEMENTED** until the HTTP contract and the worker exist.
It exits 0 while they are absent and flips to a hard failure once the worker appears, so the
check can never be silently skipped afterwards.

### Database

Migrations live in `packages/db/drizzle`. After editing `packages/db/src/schema.ts`:

```sh
cd packages/db
pnpm exec drizzle-kit generate --name=<change>
OMR_MIGRATION_URL=postgres://... pnpm exec drizzle-kit migrate
```

Target is Postgres 17 with the `vector` extension. The schema lives in a dedicated
`omnirouter` schema, not `public`.

### Version control

Enable the secret guard once per clone:

```sh
git config core.hooksPath .git-hooks
git config core.autocrlf false
```

The pre-commit hook blocks staging `.env` files and anything that looks like a credential.

## Licence

Not yet chosen.
