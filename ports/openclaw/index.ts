// PAPER TRAIL for OpenClaw: a tool plugin (defineToolPlugin form, TypeBox schemas) with four tools over
// ports/shared/paperTrail.ts. OpenClaw ships no wallet: the collector key comes from the plugin config
// (privateKey, marked sensitive) and becomes a viem WalletClient inside execute(). Dry run unless execute=true.
//
// REQUIREMENTS / UNVERIFIED (see README):
//   - openclaw needs Node >= 24.16 (<25) or >= 26.1; this repository was built on Node 20, so openclaw itself
//     was NOT installed here and `openclaw/plugin-sdk/tool-plugin`'s .d.ts was NOT checked. The import below and the
//     tool() option names (name, label, description, parameters, outputSchema, execute(params, config, context))
//     follow docs/plugins/tool-plugins.md verbatim; `types/openclaw-stub.d.ts` is a local stand-in for typechecking only.
//   - whether tool() also accepts `optional`/`factory` is UNVERIFIED (the doc lists them; the .d.ts was not read).
//   - `uiHints.privateKey.sensitive` on the config schema is the documented way to mark a secret — UNVERIFIED
//     against the .d.ts; it is passed through as-is.
import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { createWalletClient, formatEther, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import {
  acquisitionRecord, applyToAgentStage, describeBrief, describePlan, describeStage, describeVerdict, fetchBrief,
  planMint, publicClient, stageFacts, tokenIdsFromReceipt, verifyWork, type Rules,
} from "../shared/paperTrail.js";

const FRAMEWORK = "paper-trail-agent-example/ports/openclaw";

interface PluginConfig { privateKey?: string; rpcUrl?: string }

function walletOf(config: PluginConfig) {
  if (!config.privateKey) throw new Error("plugin config privateKey is not set; the collector wallet is needed to sign or mint");
  const account = privateKeyToAccount(config.privateKey as Hex);
  return { account, wallet: createWalletClient({ account, chain: mainnet, transport: http(config.rpcUrl) }), client: publicClient(config.rpcUrl) };
}

export default defineToolPlugin({
  id: "paper-trail",
  name: "PAPER TRAIL collector",
  description: "Read the PAPER TRAIL brief, verify RUTHVEN Origin Passports against Ethereum, apply to the AI Agents stage, mint (dry run by default). Facts only; never a recommendation to buy.",
  configSchema: Type.Object({
    privateKey: Type.Optional(Type.String({ description: "Collector wallet private key (0x…). Only needed to sign the declaration or mint." })),
    rpcUrl: Type.Optional(Type.String({ description: "Ethereum mainnet RPC URL. Defaults to viem's public mainnet RPC." })),
  }),
  // UNVERIFIED field name; documented as the way to mark a config value sensitive in the OpenClaw UI.
  uiHints: { privateKey: { sensitive: true } },
  tools: (tool) => [
    tool({
      name: "paper_trail_brief",
      label: "PAPER TRAIL brief",
      description: "Read the PAPER TRAIL agent brief published by the artist: contract, stages, prices, windows, provenance anchor. Facts only; not a recommendation to buy.",
      parameters: Type.Object({}),
      async execute(_params: Record<string, never>, _config: PluginConfig, context) {
        context?.signal?.throwIfAborted();
        return { text: describeBrief(await fetchBrief()) };
      },
    }),
    tool({
      name: "paper_trail_verify",
      label: "Verify a PAPER TRAIL Passport",
      description: "Verify one PAPER TRAIL work's RUTHVEN Origin Passport against Ethereum: recompute the Merkle leaf and root from /proof and compare with passportRoot(collectionId) on the registry. Unrevealed works answer SEALED.",
      parameters: Type.Object({ tokenId: Type.String({ description: "Token id, e.g. 1140 or PT-1140" }) }),
      async execute({ tokenId }: { tokenId: string }, config: PluginConfig, context) {
        context?.signal?.throwIfAborted();
        const v = await verifyWork(tokenId, publicClient(config.rpcUrl));
        return { state: v.state, text: describeVerdict(v) };
      },
    }),
    tool({
      name: "paper_trail_apply_agent_stage",
      label: "Apply to the AI Agents stage",
      description: "Sign the operator declaration with the collector wallet (personal_sign) and POST it to the PAPER TRAIL AI Agents stage; returns a single-use SeaDrop signed-mint permission. Nothing is sent to the chain. The acquisition will be recorded publicly as operator-declared.",
      parameters: Type.Object({
        quantity: Type.Integer({ minimum: 1, maximum: 5, default: 1 }),
        operator: Type.String({ description: "The operator's name, recorded publicly" }),
        agent: Type.String({ description: "The agent's name and version, recorded publicly" }),
        erc8004Registry: Type.Optional(Type.String()),
        erc8004AgentId: Type.Optional(Type.String()),
      }),
      async execute(params: { quantity?: number; operator: string; agent: string; erc8004Registry?: string; erc8004AgentId?: string }, config: PluginConfig, context) {
        context?.signal?.throwIfAborted();
        const { wallet } = walletOf(config);
        const f = await stageFacts();
        const erc8004 = params.erc8004Registry && params.erc8004AgentId ? { registry: params.erc8004Registry, agentId: params.erc8004AgentId } : undefined;
        const p = await applyToAgentStage(wallet, params.quantity ?? 1, params.operator, params.agent, erc8004);
        return {
          salt: p.salt, value_eth: formatEther(BigInt(p.value_wei)), quantity: p.quantity, recorded_as: "operator-declared",
          text: [
            describeStage(f),
            `Permission issued for ${p.quantity} to ${p.declaration?.wallet}: value ${formatEther(BigInt(p.value_wei))} ETH, salt ${p.salt}. Single use; consumed by SeaDrop.mintSigned.`,
            `Declaration signed: "${p.declaration?.statement}"`,
            "Recorded as operator-declared; not an assertion of autonomy. Use paper_trail_mint with stage=agent to mint (it applies again and sends in one step).",
          ].join("\n"),
        };
      },
    }),
    tool({
      name: "paper_trail_mint",
      label: "Mint PAPER TRAIL",
      description: "Mint PAPER TRAIL from the collector wallet in the public stage (mintPublic) or the AI Agents stage (declaration → permission → mintSigned). Verifies featured Passports against Ethereum first, applies the operator's rules, re-reads the price from the chain and refuses if it differs from the brief. DRY RUN unless execute is true.",
      parameters: Type.Object({
        stage: Type.Optional(Type.Union([Type.Literal("public"), Type.Literal("agent")], { default: "public" })),
        quantity: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
        execute: Type.Optional(Type.Boolean({ default: false, description: "true sends the transaction; default false is a dry run" })),
        operator: Type.Optional(Type.String({ description: "Agent stage: the operator's name" })),
        agent: Type.Optional(Type.String({ description: "Agent stage: the agent's name and version" })),
        maxPriceEth: Type.Optional(Type.String({ description: "Operator rule: refuse above this price in ETH (default 0.09)" })),
        minVerifiedProofs: Type.Optional(Type.Integer({ minimum: 1, description: "Operator rule: featured proofs that must VERIFY first (default 3)" })),
      }),
      async execute(params: { stage?: "public" | "agent"; quantity?: number; execute?: boolean; operator?: string; agent?: string; maxPriceEth?: string; minVerifiedProofs?: number }, config: PluginConfig, context) {
        context?.signal?.throwIfAborted();
        const { account, wallet, client } = walletOf(config);
        const rules: Partial<Rules> = {};
        if (params.maxPriceEth) rules.max_price_eth = params.maxPriceEth;
        if (params.minVerifiedProofs) rules.min_verified_proofs = params.minVerifiedProofs;
        const execute = params.execute === true;
        const plan = await planMint({ stage: params.stage ?? "public", quantity: params.quantity ?? 1, wallet: account.address, signer: wallet, operator: params.operator, agent: params.agent, rules, client });
        const text = describePlan(plan, execute);
        if (!execute) return { dry_run: true, text };
        const hash = await wallet.sendTransaction({ account, chain: mainnet, to: plan.call!.to, data: plan.call!.data, value: plan.call!.value });
        const receipt = await client.waitForTransactionReceipt({ hash });
        const ids = tokenIdsFromReceipt(receipt, plan.brief.mint.nftContract);
        const record = acquisitionRecord(plan.brief, plan.stage, account.address, hash, ids, plan.priceWei, plan.quantity, FRAMEWORK, plan.permission?.declaration);
        return { dry_run: false, transaction: hash, token_ids: ids, record, text: `${text}\nSENT ${hash}. Minted token ids ${ids.join(", ") || "(none found in receipt)"}. Acquisition method: ${record.acquisition_method}.` };
      },
    }),
  ],
});
