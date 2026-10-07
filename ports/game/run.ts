// Example runner: GAME_API_KEY + PRIVATE_KEY + RPC_URL in the environment. One step, verbose. Dry run unless the
// agent passes execute="true" to paper_trail_mint — put that behind your own confirmation.
import "dotenv/config";
import { GameAgent } from "@virtuals-protocol/game";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { createPaperTrailWorker } from "./index.js";

const wallet = createWalletClient({ account: privateKeyToAccount(process.env.PRIVATE_KEY as Hex), chain: mainnet, transport: http(process.env.RPC_URL) });
const agent = new GameAgent(process.env.GAME_API_KEY!, {
  name: "PAPER TRAIL collector",
  goal: "Read the PAPER TRAIL brief, verify a featured work's Passport against Ethereum, and dry-run a mint of one in the AI Agents stage. Do not pass execute=true unless the operator has said so.",
  description: "An agent that verifies before it buys. Operator: " + (process.env.OPERATOR_NAME ?? "unnamed operator") + ". Agent: " + (process.env.AGENT_NAME ?? "paper-trail-game v1") + ".",
  workers: [createPaperTrailWorker({ wallet })],
});
await agent.init();
await agent.step({ verbose: true });
