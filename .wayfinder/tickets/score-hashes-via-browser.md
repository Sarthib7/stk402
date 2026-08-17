# Score hashes via browser Wallet API

Labels: wayfinder:grilling
Status: closed
Assignee: agent (2026-08-15)

## Question

If mainnet discovery/proving URLs are still missing after Aug 20, do we push browser Wallet API invoice settles for the three score hashes, open a self-host prover task, or both?

## Resolution (2026-08-15)

**A — browser Wallet API primary.**

REPORTED: User chose path A in the wayfinder Q&A.

- Critical path for grill 3B score hashes is Consumer Ready/Xverse invoice settle that the Paid Resource accepts (HTTP 200 + pool-touching tx).
- Do **not** plan on self-hosting Stwo as the hash strategy. (Map out-of-scope contingency for self-host after Aug 20 remains only if browser path fails and URLs stay unpublished — reopen as a Task then, do not invent endpoints.)
- Agent mainnet CLI settle stays blocked on published URLs; Sepolia agent narrative stays honest for that rail.
- Next measured work: always-on (or tunnel) Consumer + Paid Resource, then prove one browser Receipt settle (Sepolia first if mainnet Merchant/funding not ready), then three mainnet invoice hashes into `strk20.json`.
