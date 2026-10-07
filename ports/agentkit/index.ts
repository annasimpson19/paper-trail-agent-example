// PAPER TRAIL for Coinbase AgentKit: a customActionProvider with four actions over ports/shared/paperTrail.ts.
// The wallet is whatever EvmWalletProvider AgentKit was given (ViemWalletProvider, CdpEvmWalletProvider, …):
// signMessage() signs the operator declaration (personal_sign / EIP-191) and sendTransaction({to, data, value})
// sends the mint. Dry run by default: paper_trail_mint only sends when execute is true.
//
// API names used here were read from @coinbase/agentkit 0.10.4 source (customActionProvider, EvmWalletProvider,
// ViemWalletProvider). customActionProvider injects the wallet only when `invoke` declares exactly two parameters.
import { customActionProvider, EvmWalletProvider } from "@coinbase/agentkit";
import { z } from "zod";
import { formatEther, type Address, type Hex } from "viem";
import {
  acquisitionRecord, applyToAgentStage, describeBrief, describePlan, describeStage, describeVerdict, fetchBrief,
  planMint, stageFacts, tokenIdsFromReceipt, verifyWork, type MessageSigner, type Rules,
} from "../shared/paperTrail.js";

const FRAMEWORK = "paper-trail-agent-example/ports/agentkit";

function signerFrom(wallet: EvmWalletProvider): MessageSigner {
  return { address: wallet.getAddress() as Address, signMessage: (m: string) => wallet.signMessage(m) };
}

/** Re-read the stage price from the chain through the wallet's own public client, so no separate RPC is needed. */
const clientOf = (wallet: EvmWalletProvider) => wallet.getPublicClient();

const BriefSchema = z.object({});
const VerifySchema = z.object({ tokenId: z.union([z.number().int().min(1), z.string()]).describe("Token id, e.g. 1140 or PT-1140") });
const ApplySchema = z.object({
  quantity: z.number().int().min(1).max(5).default(1).describe("Works to mint, 1–5"),
  operator: z.string().min(1).describe("The operator's name, recorded publicly with the acquisition"),
  agent: z.string().min(1).describe("The agent's name and version, recorded publicly"),
  erc8004Registry: z.string().optional().describe("Optional ERC-8004 identity registry address"),
  erc8004AgentId: z.string().optional().describe("Optional ERC-8004 agent id"),
});
const MintSchema = z.object({
  stage: z.enum(["public", "agent"]).default("public").describe("public = SeaDrop.mintPublic at the public price; agent = the AI Agents stage via a signed operator declaration and SeaDrop.mintSigned"),
  quantity: z.number().int().min(1).default(1),
  execute: z.boolean().default(false).describe("false (default) = dry run, nothing is sent; true = send the transaction from this wallet"),
  operator: z.string().optional().describe("Required for the agent stage: the operator's name"),
  agent: z.string().optional().describe("Required for the agent stage: the agent's name and version"),
  erc8004Registry: z.string().optional(),
  erc8004AgentId: z.string().optional(),
  maxPriceEth: z.string().optional().describe("Operator rule: refuse if the stage price is above this (default 0.09)"),
  minVerifiedProofs: z.number().int().min(1).optional().describe("Operator rule: featured proofs that must VERIFY first (default 3)"),
});

function rulesFrom(a: { maxPriceEth?: string; minVerifiedProofs?: number }): Partial<Rules> {
  const r: Partial<Rules> = {};
  if (a.maxPriceEth) r.max_price_eth = a.maxPriceEth;
  if (a.minVerifiedProofs) r.min_verified_proofs = a.minVerifiedProofs;
  return r;
}
const erc8004Of = (a: { erc8004Registry?: string; erc8004AgentId?: string }) => a.erc8004Registry && a.erc8004AgentId ? { registry: a.erc8004Registry, agentId: a.erc8004AgentId } : undefined;

export const paperTrailActionProvider = () => customActionProvider<EvmWalletProvider>([
  {
    name: "paper_trail_brief",
    description: "Read the PAPER TRAIL agent brief published by the artist: contract, stages, prices, windows, provenance anchor. Facts only; not a recommendation to buy.",
    schema: BriefSchema,
    invoke: async (_args: z.infer<typeof BriefSchema>) => describeBrief(await fetchBrief()),
  },
  {
    name: "paper_trail_verify",
    description: "Verify one PAPER TRAIL work's RUTHVEN Origin Passport against Ethereum: recompute the Merkle leaf and root from the /proof response and compare with passportRoot(collectionId) on the registry. Unrevealed works answer SEALED.",
    schema: VerifySchema,
    invoke: async (wallet: EvmWalletProvider, args: z.infer<typeof VerifySchema>) => describeVerdict(await verifyWork(args.tokenId, clientOf(wallet))),
  },
  {
    name: "paper_trail_apply_agent_stage",
    description: "Apply to the PAPER TRAIL AI Agents stage: sign the operator declaration with this wallet (personal_sign) and POST it; returns a single-use SeaDrop signed-mint permission. Nothing is sent to the chain. The acquisition will be recorded publicly as operator-declared.",
    schema: ApplySchema,
    invoke: async (wallet: EvmWalletProvider, args: z.infer<typeof ApplySchema>) => {
      const f = await stageFacts();
      const p = await applyToAgentStage(signerFrom(wallet), args.quantity, args.operator, args.agent, erc8004Of(args));
      return [
        describeStage(f),
        `Permission issued for ${p.quantity} to ${p.declaration?.wallet}: value ${formatEther(BigInt(p.value_wei))} ETH, salt ${p.salt}. Single use; it is consumed by SeaDrop.mintSigned.`,
        `Declaration signed: "${p.declaration?.statement}"`,
        "Recorded as operator-declared; not an assertion of autonomy. Call paper_trail_mint with stage=agent to mint (it applies again and sends in one step).",
      ].join("\n");
    },
  },
  {
    name: "paper_trail_mint",
    description: "Mint PAPER TRAIL from this wallet in the public stage (mintPublic) or the AI Agents stage (declaration → permission → mintSigned). Verifies featured Passports against Ethereum first, applies the operator's rules, re-reads the price from the chain and refuses if it differs from the brief. Dry run unless execute=true.",
    schema: MintSchema,
    invoke: async (wallet: EvmWalletProvider, args: z.infer<typeof MintSchema>) => {
      const me = wallet.getAddress() as Address;
      const plan = await planMint({
        stage: args.stage, quantity: args.quantity, wallet: me, signer: signerFrom(wallet), operator: args.operator, agent: args.agent,
        erc8004: erc8004Of(args), rules: rulesFrom(args), client: clientOf(wallet),
      });
      const text = describePlan(plan, args.execute);
      if (!args.execute) return text;
      const hash = await wallet.sendTransaction({ to: plan.call!.to, data: plan.call!.data, value: plan.call!.value });
      const receipt = await wallet.waitForTransactionReceipt(hash as Hex);
      const ids = tokenIdsFromReceipt(receipt, plan.brief.mint.nftContract);
      const record = acquisitionRecord(plan.brief, plan.stage, me, hash, ids, plan.priceWei, plan.quantity, FRAMEWORK, plan.permission?.declaration);
      return `${text}\nSENT ${hash}. Minted token ids ${ids.join(", ") || "(none found in receipt)"}. ` +
        `Acquisition method: ${record.acquisition_method}.\nRecord:\n${JSON.stringify(record, null, 2)}`;
    },
  },
]);

export default paperTrailActionProvider;
