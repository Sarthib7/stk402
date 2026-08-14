# Package CLI SDK and MCP surfaces

Labels: wayfinder:grilling
Status: closed

## Question

In what order and with what public API do we ship CLI, importable SDK, and MCP so an agent skill can call payable x402 endpoints through stk402?

## Resolution (2026-08-14)

Order locked:
1. CLI entrypoints (already existed: fund / pay / serve / recover).
2. SDK barrel `src/index.ts` via `package.json` `exports["."]`.
3. Thin MCP `src/mcp/server.ts` tools: `stk402_check_network`, `stk402_fund_payer`, `stk402_pay_resource`. Run: `npm run mcp:serve`.
4. Skill.md still fog (Not yet specified) until public demo URL exists.

Assets: `src/index.ts`, `src/index.test.ts`, `src/mcp/server.ts`, `src/check-mainnet.ts`, `.env.mainnet.example`.
