# PAPER TRAIL × Coinbase AgentKit

Four actions for an AgentKit agent, over the shared viem core in `../shared/paperTrail.ts`:

| action | what it does | sends anything? |
|---|---|---|
| `paper_trail_brief` | reads https://missalsimpson.com/agents/paper-trail.json and states the facts | no |
| `paper_trail_verify` | `tokenId` → recomputes the Merkle leaf/root from `/proof` and compares with `passportRoot(collectionId)` on the RUTHVEN registry, through the wallet's own public client | no |
| `paper_trail_apply_agent_stage` | signs the operator declaration with the wallet (`EvmWalletProvider.signMessage`, EIP-191) and POSTs it; returns the single-use signed-mint permission | no (an HTTP POST, no chain write) |
| `paper_trail_mint` | `stage` public or agent, `quantity`, `execute` (**default false = dry run**): verifies featured Passports, applies the operator's rules, re-reads the price from SeaDrop and refuses if it differs from the brief, then `sendTransaction({to, data, value})` | only with `execute: true` |

Every price, window, cap and address comes from the brief, the stage endpoint or the chain at run time. The only hard-coded values are the genuine contract (`0x6eE9aaE76d422Bf4eC27449EB83245A79adAe105`, so the actions refuse any brief that names another) and the registry.

An acquisition in the AI Agents stage is recorded publicly as **operator-declared**. The declaration names the operator and the agent; it claims nothing about autonomy. The actions say so in their results.

## Install

From the repository root (`npm install` there already installs `@coinbase/agentkit`, `viem` and `zod`). To run an LLM loop you also need a framework extension; the example below uses LangChain:

```bash
npm install @coinbase/agentkit-langchain langchain @langchain/langgraph @langchain/openai
```

`@coinbase/agentkit` pins `viem` 2.38.3; the root `package.json` pins the same version so there is one copy.

## Run

```ts
import { AgentKit, ViemWalletProvider } from "@coinbase/agentkit";
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { paperTrailActionProvider } from "./ports/agentkit/index.js";

const walletProvider = new ViemWalletProvider(
  createWalletClient({ account: privateKeyToAccount(process.env.PRIVATE_KEY as Hex), chain: mainnet, transport: http(process.env.RPC_URL) }),
);
const agentKit = await AgentKit.from({ walletProvider, actionProviders: [paperTrailActionProvider()] });
const tools = await getLangChainTools(agentKit);
const agent = createAgent({ model: new ChatOpenAI({ model: "gpt-4o-mini" }), tools, checkpointer: new MemorySaver() });

const stream = await agent.stream(
  { messages: [new HumanMessage("Read the PAPER TRAIL brief, verify PT-1140, and dry-run a mint of one in the agent stage. Operator: Example Co. Agent: example-agent v1.")] },
  { configurable: { thread_id: "paper-trail" } },
);
for await (const chunk of stream) if ("tools" in chunk) for (const t of chunk.tools.messages) console.log(t.name, t.content);
```

Any other `EvmWalletProvider` works the same way (`CdpEvmWalletProvider.configureWithWallet(...)` for a CDP server wallet). PAPER TRAIL exists only on Ethereum mainnet: the wallet client must be on `mainnet`, or the brief check refuses.

To mint for real the model must call `paper_trail_mint` with `execute: true` from a funded wallet. Keep that behind your own confirmation; the action itself never defaults to sending.

## Two things observed running @coinbase/agentkit 0.10.4

- AgentKit prefixes every action name with the provider class, so the model sees `CustomActionProvider_paper_trail_brief`, `…_verify`, `…_apply_agent_stage`, `…_mint`. Match on the suffix if you look them up by name.
- On every action invocation AgentKit POSTs an analytics event to `cca-lite.coinbase.com` and does not catch a failed response. In our dry run that endpoint answered 400 and the resulting unhandled rejection crashed Node 20 after the first action. A `process.on("unhandledRejection", …)` handler keeps the agent running (the action itself completes correctly); decide for yourself whether that telemetry is acceptable.

## Dry run observed (7 Oct 2026, throwaway unfunded key, nothing sent)

```
PT-1140: VERIFIED — the Passport hash folds to the root the registry holds on Ethereum (…)
Plan: SeaDrop.mintPublic × 1 from 0x490b…D302, value 0.09 ETH (0.09 ETH each) to 0x00005EA0…4bf5.
3/3 proofs VERIFIED against the registry (0 mismatches); all rules pass → may acquire
public stage open on-chain until 2026-10-13T21:00:00.000Z; 21/4000 minted; this wallet has 0 of 1000
DRY RUN: nothing sent. Pass execute=true to mint for real from a funded wallet.
```

`paper_trail_apply_agent_stage` was not exercised in that run: it signs and POSTs a real declaration and the studio issues a real single-use permission, which is not something to do with a throwaway key. Its logic is the same code path as `src/agent-stage.ts`.

Not a recommendation to buy. RUTHVEN AI LIMITED values nothing and recommends nothing.
