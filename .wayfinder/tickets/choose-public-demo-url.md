# Choose public demo URL shape

Labels: wayfinder:grilling
Status: closed

## Question

What exact URL and flow do judges open: skill+CLI/MCP against hosted Paid Resource, browser pay page, or both?

## Resolution (2026-08-14)

**B + skill URL on the same origin.**

- `demo_url` = always-on **Consumer pay page** (Ready/Xverse Wallet API), prefilled with the Paid Resource URL.
- Same host serves **`/SKILL.md`** so an agent can load the skill and pay via CLI or MCP against that Paid Resource.
- Paid Resource stays a separate always-on HTTPS URL (may be same project, different path or service).
- Tunnel OK for first public proof. Always-on host before the demo video ([Hosting and out-of-scope defaults](decide-hosting-and-scope.md)).
