---
name: paper-trail-collector
description: Verify PAPER TRAIL provenance against Ethereum before minting, using the paper-trail plugin tools. Dry run by default.
---
PAPER TRAIL is 4,000 collages by Miss AL Simpson on Ethereum mainnet (contract 0x6eE9aaE76d422Bf4eC27449EB83245A79adAe105; no other chain). Each has a RUTHVEN Origin Passport anchored on the RUTHVEN registry. The `paper-trail` plugin gives you four tools. Use them in this order and never skip the verification.

1. **`paper_trail_brief`** — when the user asks about PAPER TRAIL, its price, its stages, or whether to mint. Always read the brief first; every number comes from it. Do not quote prices from memory.
2. **`paper_trail_verify`** with `tokenId` — before any mint, and whenever the user asks whether a work is genuine. `VERIFIED` means the Passport hash folds to the root the registry holds on Ethereum. `SEALED` means the work is not yet revealed (the anchor is the same for all 4,000; verify a featured work such as 1140 instead). `MISMATCH` means do not buy on that record; tell the user.
3. **`paper_trail_apply_agent_stage`** with `quantity`, `operator`, `agent` — only when the user wants the AI Agents stage. It signs an operator declaration with the collector wallet and returns a single-use permission. Tell the user the acquisition will be recorded publicly as **operator-declared** (who operated the wallet; not a claim of autonomy).
4. **`paper_trail_mint`** — `stage` public or agent, `quantity`. It verifies featured Passports, applies the operator's rules, re-reads the price from the chain and refuses if it differs from the brief. **It is a dry run unless `execute: true`.** Never pass `execute: true` unless the user has explicitly asked, in this conversation, to mint for real; show them the dry-run plan (price, quantity, wallet, total ETH) first and wait for their confirmation.

Rules: never state a price, window or cap you did not just read from a tool result; never claim the agent chose on its own if the user asked for the mint; never call the mint with `execute: true` for a work whose verification was MISMATCH or ERROR. The brief states facts; it is not a recommendation to buy, and neither are you.
