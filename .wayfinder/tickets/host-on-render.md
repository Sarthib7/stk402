# Host on Render (deploy on hold)

Labels: wayfinder:grilling
Status: closed
Assignee: agent (2026-08-15)

## Question

Which always-on host for Consumer pay page + Paid Resource before the demo video?

## Resolution (2026-08-15)

**Render.**

REPORTED: User locked hosting to Render. Deployment is **on hold** until they say go.

- Target: always-on Consumer (`demo_url`) + Paid Resource (same or sibling Render service) + `/SKILL.md` on the demo origin.
- Tunnel remains OK for first public proof / local wallet tests before Render deploy.
- Do not deploy or write Render secrets until the user unblocks this hold.
- Persistent SQLite path and HTTPS public origin still required for mainnet Paid Resource startup (existing server config rules).
