# Run one production private payment on Sepolia

Status: open
Type: task
Parent: [STK402 Mainnet Readiness Map](../map.md)

## Question

Can a throwaway funded Sepolia account produce a real STRK20 proof, submit a private transfer, and unlock the SHA-256 endpoint?

## Required inputs

- A funded throwaway Sepolia account address.
- Its private key stored only in local `.env.sepolia`.
- Its viewing key stored only in local `.env.sepolia`.
- An enrolled private recipient address and viewing key for server-side discovery.
- Explicit approval before the transaction is submitted.

## Evidence required

- Prover returns non-empty proof facts for the transfer.
- Starknet receipt succeeds on Sepolia.
- Discovery history binds the transaction hash to the expected incoming note.
- HTTP retry returns the deterministic tool result.
- The same receipt fails on replay.
