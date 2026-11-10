#!/usr/bin/env node
/**
 * check-rules.mjs — mechanical enforcement of OmniRouter's engineering guardrails.
 *
 * A markdown file cannot stop an agent. This script can: it exits non-zero, and
 * `pnpm verify` (CI) treats that as a failed build.
 *
 * Usage:  node scripts/check-rules.mjs [--json]
 * Exit:   0 = clean, 1 = violations
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN = ["apps", "packages"].filter((d) => existsSync(join(ROOT, d)));
const SKIP = new Set(["node_modules", "dist", ".wrangler", ".turbo", "coverage"]);
const EXT = /\.(ts|tsx|js|mjs|sql)$/;

const violations = [];
const add = (rule, file, line, msg) => violations.push({ rule, file, line, msg });

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (EXT.test(name)) yield p;
  }
}

const files = SCAN.flatMap((d) => [...walk(join(ROOT, d))]);

for (const abs of files) {
  const rel = relative(ROOT, abs).replaceAll("\\", "/");
  const src = readFileSync(abs, "utf8");
  const lines = src.split("\n");
  const isTest = /\.(test|spec)\.[tj]sx?$/.test(rel) || rel.includes("/test/") || rel.includes("/fixtures/");

  lines.forEach((line, i) => {
    const n = i + 1;
    const code = line.replace(/\/\/.*$/, "");

    // H1 / H2 — credential & money storage. Any table/column that would persist a secret or a balance.
    if (/\b(pgTable|pgSchema)\(/.test(code)) {
      if (
        /api_?key|access_?token|refresh_?token|client_?secret|password|credential/i.test(code) &&
        !/hash/i.test(code) &&
        !/clientId|keyPrefix|tokenEndpointAuth/.test(code)
      ) {
        add("H1", rel, n, "possible credential column — store a hash or an identifier, never a secret");
      }
      if (/wallet|ledger|balance|credit_?balance|payout|voucher/i.test(code)) {
        add("H2", rel, n, "wallet/ledger table — OmniRouter must never hold funds");
      }
    }
    if (/application_fee_amount/.test(code) && !/['"`]?0['"`]?|omit|undefined|null/.test(code)) {
      add("H2", rel, n, "application_fee_amount must be 0 or omitted");
    }

    // H3 / H4 — the index must never write to a foreign, externally-owned schema.
    if (
      /\bexternal_schema\b/.test(code) &&
      /(insert into|update|delete from|create\s+(table|view|trigger))/i.test(code)
    ) {
      add("H3", rel, n, "writes to an externally-owned schema — it is read-only");
    }

    // H5 — wholesale caller header forwarding.
    if (/\.\.\.\s*c\.req\.header\(\)/.test(code)) {
      add("H5", rel, n, "spreading c.req.header() forwards Cookie/CF-* — use the allow-list");
    }

    // H6 — v1 embeddings are 384-dim; ours are 1024.
    if (/dimensions:\s*384/.test(code)) {
      add("H6", rel, n, "vector(384) — OmniRouter uses 1024-dim cls embeddings");
    }

    // H8 — shell interpolation of untrusted values.
    if (/\b(exec|execSync|spawnSync)\s*\(/.test(code) && !isTest) {
      add("H8", rel, n, "shell exec in app code — use execFile with an argv array, or the E2B job file");
    }
    if (/commands\.run\(\s*`/.test(code)) {
      add("H8", rel, n, "template literal passed to sandbox commands.run — pass argv, not a shell string");
    }

    // H9 — a 401 with OAuth metadata is not "broken".
    if (/verificationClass\s*[:=].*['"]broken['"]/.test(code) && /401/.test(code)) {
      add("H9", rel, n, "401 mapped to broken — check for WWW-Authenticate first");
    }

    // H10 — Vercel Connect cache bypass.
    if (/\bgetToken\s*\(/.test(code) && !/forceRefresh/.test(code) && !isTest) {
      add("H10", rel, n, "getToken() without forceRefresh: true");
    }
  });
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ violations, filesScanned: files.length }, null, 2));
} else if (violations.length === 0) {
  console.log(`check-rules: OK (${files.length} files scanned)`);
} else {
  console.error(`check-rules: ${violations.length} violation(s)\n`);
  for (const v of violations) console.error(`  [${v.rule}] ${v.file}:${v.line}  ${v.msg}`);
  console.error("\nA guardrail violation is a build failure, not a style note.");
}

process.exit(violations.length === 0 ? 0 : 1);
