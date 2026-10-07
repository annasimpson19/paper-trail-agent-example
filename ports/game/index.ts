// PAPER TRAIL for the Virtuals GAME SDK: four GameFunctions in a GameWorker "paper_trail_collector".
// The SDK holds no wallet; the developer passes a viem WalletClient (with an account) and it never leaves this module.
// Every arg arrives as a string (GAME passes { value: string }); they are parsed here. Dry run unless execute="true".
//
// API names used here were read from @virtuals-protocol/game 0.1.14 (GameFunction, GameWorker,
// ExecutableGameFunctionResponse, ExecutableGameFunctionStatus).
import { ExecutableGameFunctionResponse, ExecutableGameFunctionStatus, GameFunction, GameWorker } from "@virtuals-protocol/game";
import { formatEther, type PublicClient, type WalletClient } from "viem";
import {
  acquisitionRecord, applyToAgentStage, describeBrief, describePlan, describeStage, describeVerdict, fetchBrief,
  planMint, publicClient, stageFacts, tokenIdsFromReceipt, verifyWork, type Rules,
} from "../shared/paperTrail.js";

const FRAMEWORK = "paper-trail-agent-example/ports/game";
const done = (feedback: string) => new ExecutableGameFunctionResponse(ExecutableGameFunctionStatus.Done, feedback);
const failed = (e: unknown) => new ExecutableGameFunctionResponse(ExecutableGameFunctionStatus.Failed, `STOPPED: ${(e as Error).message ?? String(e)}`);

const intArg = (v: string | undefined, name: string, fallback?: number): number => {
  if (v === undefined || v === "") { if (fallback !== undefined) return fallback; throw new Error(`${name} is required`); }
  const n = Number(v); if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer, got "${v}"`); return n;
};
const boolArg = (v: string | undefined) => /^(true|yes|1)$/i.test((v ?? "").trim());

export interface PaperTrailWorkerOptions {
  /** viem WalletClient with an account, on Ethereum mainnet. Signs the declaration and sends the mint. */
  wallet: WalletClient;
  /** Read-only client; defaults to RPC_URL or viem's public mainnet RPC. */
  client?: PublicClient;
  /** Operator rules; defaults match rules.json at the repository root. */
  rules?: Partial<Rules>;
}

export function createPaperTrailFunctions({ wallet, client = publicClient(), rules }: PaperTrailWorkerOptions) {
  const account = wallet.account;
  if (!account) throw new Error("the WalletClient needs an account (createWalletClient({ account, chain: mainnet, transport }))");

  const brief = new GameFunction({
    name: "paper_trail_brief",
    description: "Read the PAPER TRAIL agent brief published by the artist: contract, stages, prices, windows, provenance anchor. Facts only; not a recommendation to buy.",
    args: [] as const,
    executable: async () => { try { return done(describeBrief(await fetchBrief())); } catch (e) { return failed(e); } },
  });

  const verify = new GameFunction({
    name: "paper_trail_verify",
    description: "Verify one PAPER TRAIL work's RUTHVEN Origin Passport against Ethereum: recompute the Merkle leaf and root from /proof and compare with passportRoot(collectionId) on the registry. Unrevealed works answer SEALED.",
    args: [{ name: "tokenId", description: "Token id, e.g. 1140 or PT-1140", type: "string" }] as const,
    executable: async (args, logger) => {
      try { const v = await verifyWork(args.tokenId ?? "", client); logger(`${v.asset_id} ${v.state}`); return done(describeVerdict(v)); } catch (e) { return failed(e); }
    },
  });

  const apply = new GameFunction({
    name: "paper_trail_apply_agent_stage",
    description: "Apply to the PAPER TRAIL AI Agents stage: sign the operator declaration with the collector wallet (personal_sign) and POST it; returns a single-use SeaDrop signed-mint permission. Nothing is sent to the chain. The acquisition will be recorded publicly as operator-declared.",
    args: [
      { name: "quantity", description: "Works to mint, 1–5 (string)", type: "string" },
      { name: "operator", description: "The operator's name, recorded publicly", type: "string" },
      { name: "agent", description: "The agent's name and version, recorded publicly", type: "string" },
      { name: "erc8004Registry", description: "Optional ERC-8004 identity registry address", type: "string", optional: true },
      { name: "erc8004AgentId", description: "Optional ERC-8004 agent id", type: "string", optional: true },
    ] as const,
    executable: async (args, logger) => {
      try {
        const f = await stageFacts();
        const erc8004 = args.erc8004Registry && args.erc8004AgentId ? { registry: args.erc8004Registry, agentId: args.erc8004AgentId } : undefined;
        const p = await applyToAgentStage(wallet, intArg(args.quantity, "quantity", 1), args.operator ?? "", args.agent ?? "", erc8004);
        logger(`permission issued, salt ${p.salt}`);
        return done([
          describeStage(f),
          `Permission issued for ${p.quantity} to ${p.declaration?.wallet}: value ${formatEther(BigInt(p.value_wei))} ETH, salt ${p.salt}. Single use; consumed by SeaDrop.mintSigned.`,
          `Declaration signed: "${p.declaration?.statement}"`,
          "Recorded as operator-declared; not an assertion of autonomy. Call paper_trail_mint with stage=agent to mint (it applies again and sends in one step).",
        ].join("\n"));
      } catch (e) { return failed(e); }
    },
  });

  const mint = new GameFunction({
    name: "paper_trail_mint",
    description: "Mint PAPER TRAIL from the collector wallet in the public stage (mintPublic) or the AI Agents stage (declaration → permission → mintSigned). Verifies featured Passports against Ethereum first, applies the operator's rules, re-reads the price from the chain and refuses if it differs from the brief. DRY RUN unless execute is \"true\".",
    args: [
      { name: "stage", description: "\"public\" or \"agent\" (default public)", type: "string", optional: true },
      { name: "quantity", description: "Works to mint (string, default 1)", type: "string", optional: true },
      { name: "execute", description: "\"true\" to send the transaction; anything else is a dry run (default)", type: "string", optional: true },
      { name: "operator", description: "Agent stage only: the operator's name", type: "string", optional: true },
      { name: "agent", description: "Agent stage only: the agent's name and version", type: "string", optional: true },
      { name: "maxPriceEth", description: "Operator rule: refuse above this price in ETH (default 0.09)", type: "string", optional: true },
    ] as const,
    executable: async (args, logger) => {
      try {
        const stage = (args.stage ?? "public").toLowerCase() === "agent" ? "agent" : "public";
        const execute = boolArg(args.execute);
        const r: Partial<Rules> = { ...rules }; if (args.maxPriceEth) r.max_price_eth = args.maxPriceEth;
        const plan = await planMint({ stage, quantity: intArg(args.quantity, "quantity", 1), wallet: account.address, signer: wallet, operator: args.operator, agent: args.agent, rules: r, client });
        const text = describePlan(plan, execute);
        logger(plan.evaluation.summary);
        if (!execute) return done(text);
        const hash = await wallet.sendTransaction({ account, chain: wallet.chain, to: plan.call!.to, data: plan.call!.data, value: plan.call!.value });
        const receipt = await client.waitForTransactionReceipt({ hash });
        const ids = tokenIdsFromReceipt(receipt, plan.brief.mint.nftContract);
        const record = acquisitionRecord(plan.brief, plan.stage, account.address, hash, ids, plan.priceWei, plan.quantity, FRAMEWORK, plan.permission?.declaration);
        return done(`${text}\nSENT ${hash}. Minted token ids ${ids.join(", ") || "(none found in receipt)"}. Acquisition method: ${record.acquisition_method}.\nRecord:\n${JSON.stringify(record, null, 2)}`);
      } catch (e) { return failed(e); }
    },
  });

  return { brief, verify, apply, mint };
}

/** The worker a GameAgent runs: id "paper_trail_collector". */
export function createPaperTrailWorker(opts: PaperTrailWorkerOptions): GameWorker {
  const fns = createPaperTrailFunctions(opts);
  return new GameWorker({
    id: "paper_trail_collector",
    name: "PAPER TRAIL collector",
    description: "Reads the PAPER TRAIL brief, verifies RUTHVEN Origin Passports against Ethereum, applies the operator's rules, and mints only when asked to execute. Facts only; never a recommendation to buy.",
    functions: [fns.brief, fns.verify, fns.apply, fns.mint],
    getEnvironment: async () => ({ wallet: opts.wallet.account?.address, chain: "ethereum mainnet", dry_run_by_default: true }),
  });
}
