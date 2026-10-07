# PAPER TRAIL × Virtuals GAME SDK

A `GameWorker` with id `paper_trail_collector` holding four `GameFunction`s, over the shared viem core in `../shared/paperTrail.ts`:

| function | args (all strings, as GAME passes them) | sends anything? |
|---|---|---|
| `paper_trail_brief` | — | no |
| `paper_trail_verify` | `tokenId` | no |
| `paper_trail_apply_agent_stage` | `quantity`, `operator`, `agent`, optional `erc8004Registry`, `erc8004AgentId` | no (signs the declaration, POSTs it, returns the single-use permission) |
| `paper_trail_mint` | `stage` (`public`/`agent`), `quantity`, `execute` (**`"true"` to send; default dry run**), `operator`, `agent`, `maxPriceEth` | only with `execute="true"` |

The GAME SDK has no wallet of its own. You create a viem `WalletClient` (with an account, on `mainnet`) and pass it to `createPaperTrailWorker({ wallet })`; the key never reaches Virtuals' service. Reads (verification, stage checks) use `RPC_URL` or, if unset, viem's public mainnet RPC.

Every price, window, cap and address is read from the brief, the stage endpoint or the chain at run time; the mint refuses if the on-chain price differs from the brief. An acquisition in the AI Agents stage is recorded publicly as **operator-declared** — the function results say so; it claims nothing about autonomy.

## Install

From the repository root, `npm install` already installs `@virtuals-protocol/game`, `viem`, `dotenv` and `tsx`. You need a GAME API key from https://console.game.virtuals.io/ .

## Run

```bash
GAME_API_KEY=apt-… RPC_URL=https://… PRIVATE_KEY=0x… OPERATOR_NAME="Example Co" AGENT_NAME="example-agent v1" \
  npx tsx ports/game/run.ts
```

`run.ts` builds the worker, creates a `GameAgent` whose goal is a dry run, and takes one `step({ verbose: true })`. Use `agent.run(60, { verbose: true })` for a loop. Minting for real means the model calling `paper_trail_mint` with `execute="true"` from a funded wallet; keep that behind your own confirmation.

## Dry run observed (7 Oct 2026, throwaway unfunded key, nothing sent)

`worker.functions` → `paper_trail_brief, paper_trail_verify, paper_trail_apply_agent_stage, paper_trail_mint`; `paper_trail_verify` with `tokenId="PT-1140"` → `done`, VERIFIED; `paper_trail_mint` with `stage="public"`, `quantity="1"` → `done`, 3/3 featured proofs VERIFIED, on-chain price 0.09 ETH equal to the brief, 21/4000 minted, `DRY RUN: nothing sent`. The GAME reasoning loop itself (`GameAgent`, which needs a `GAME_API_KEY`) was not run. `paper_trail_apply_agent_stage` was not exercised (it POSTs a real declaration and consumes a real permission).

The official `@virtuals-protocol/game-on-chain-actions-plugin` (GOAT SDK) was not used: it exposes ETH/ERC-20/Uniswap tools but no `personal_sign` or arbitrary contract call with value, which this stage needs.

Not a recommendation to buy. RUTHVEN AI LIMITED values nothing and recommends nothing.
