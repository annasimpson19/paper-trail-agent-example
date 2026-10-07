// Mint in the AI Agents stage: a declaration signed by the agent's wallet → a single-use SeaDrop signed-mint
// permission from the studio → SeaDrop.mintSigned. Same works, same contract, same reveal as the public stage.
// The facts come from the brief's agent_stage section and are re-read from the stage endpoint before signing.
import "dotenv/config";
import { ethers } from "ethers";
import { fetchBrief } from "./brief.js";

const SEADROP_ABI = [
  "function mintSigned(address nftContract, address feeRecipient, address minterIfNotPayer, uint256 quantity, tuple(uint256 mintPrice,uint256 maxTotalMintableByWallet,uint256 startTime,uint256 endTime,uint256 dropStageIndex,uint256 maxTokenSupplyForStage,uint256 feeBps,bool restrictFeeRecipients) mintParams, uint256 salt, bytes signature) payable",
  "function getSignedMintValidationParams(address nftContract, address signer) view returns (tuple(uint80 minMintPrice,uint24 maxMaxTotalMintableByWallet,uint40 minStartTime,uint40 maxEndTime,uint40 maxMaxTokenSupplyForStage,uint16 minFeeBps,uint16 maxFeeBps))",
];

export interface StageFacts { endpoint: string; price_wei: string; max_per_wallet: number; start: string; end: string; signer: string }

/** Read the stage from the brief, then the live endpoint; refuse if they disagree on price or cap. */
export async function stageFacts(): Promise<StageFacts & { template: string }> {
  const brief = await fetchBrief() as unknown as { agent_stage?: StageFacts };
  if (!brief.agent_stage) throw new Error("the brief has no agent_stage section");
  const live = await (await fetch(brief.agent_stage.endpoint, { headers: { accept: "application/json" } })).json();
  if (live.price_wei !== brief.agent_stage.price_wei || live.max_per_wallet !== brief.agent_stage.max_per_wallet)
    throw new Error(`stage endpoint (${live.price_wei}, ${live.max_per_wallet}/wallet) disagrees with the brief; stop and re-read`);
  return { ...brief.agent_stage, template: live.qualification.statement_template as string };
}

/** Sign the operator declaration with the agent's wallet and ask the studio for a signed-mint permission. */
export async function apply(wallet: ethers.Wallet, quantity: number, operator: string, agent: string, erc8004?: { registry: string; agentId: string }) {
  const f = await stageFacts();
  const statement = f.template.replace("{wallet}", wallet.address).replace("{operator}", operator).replace("{agent}", agent)
    .replace("{YYYY-MM-DD}", new Date().toISOString().slice(0, 10));
  const signature = await wallet.signMessage(statement);
  const r = await fetch(f.endpoint, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet: wallet.address, quantity, declaration: { statement, signature }, erc8004 }) });
  const out = await r.json();
  if (!r.ok) throw new Error(`stage refused (${r.status}): ${out.error}`);
  return out as { seadrop: string; nftContract: string; feeRecipient: string; quantity: number; mintParams: Record<string, string | boolean>; salt: string; signature: string; value_wei: string };
}

/** Check the permission against SeaDrop's own bounds for the studio signer, then mint (or dry-run). */
export async function mintInAgentStage(wallet: ethers.Wallet, quantity: number, operator: string, agent: string, execute: boolean, erc8004?: { registry: string; agentId: string }) {
  const p = await apply(wallet, quantity, operator, agent, erc8004);
  const seadrop = new ethers.Contract(p.seadrop, SEADROP_ABI, wallet);
  const signer = ethers.verifyTypedData(
    { name: "SeaDrop", version: "1.0", chainId: 1, verifyingContract: p.seadrop },
    { SignedMint: [{ name: "nftContract", type: "address" }, { name: "minter", type: "address" }, { name: "feeRecipient", type: "address" }, { name: "mintParams", type: "MintParams" }, { name: "salt", type: "uint256" }],
      MintParams: [{ name: "mintPrice", type: "uint256" }, { name: "maxTotalMintableByWallet", type: "uint256" }, { name: "startTime", type: "uint256" }, { name: "endTime", type: "uint256" }, { name: "dropStageIndex", type: "uint256" }, { name: "maxTokenSupplyForStage", type: "uint256" }, { name: "feeBps", type: "uint256" }, { name: "restrictFeeRecipients", type: "bool" }] },
    { nftContract: p.nftContract, minter: wallet.address, feeRecipient: p.feeRecipient, mintParams: p.mintParams, salt: p.salt }, p.signature);
  const bounds = await seadrop.getSignedMintValidationParams(p.nftContract, signer);
  if (Number(bounds.maxEndTime) === 0) throw new Error(`the token contract has not authorised signer ${signer} yet; the stage is not live on-chain`);
  if (BigInt(p.mintParams.mintPrice as string) < BigInt(bounds.minMintPrice.toString())) throw new Error("permission price below the on-chain minimum");
  const value = BigInt(p.value_wei);
  console.log(`mintSigned(…, ${quantity}) value ${ethers.formatEther(value)} ETH from ${wallet.address}; signer ${signer} authorised until ${new Date(Number(bounds.maxEndTime) * 1000).toISOString()}`);
  if (!execute) { console.log("dry run: not sent (pass --execute)"); return null; }
  const tx = await seadrop.mintSigned(p.nftContract, p.feeRecipient, ethers.ZeroAddress, quantity, p.mintParams, p.salt, p.signature, { value });
  console.log("sent", tx.hash); const rc = await tx.wait(); return { txHash: tx.hash, blockNumber: rc.blockNumber };
}

if (process.argv[1]?.endsWith("agent-stage.ts")) {
  const execute = process.argv.includes("--execute");
  const qty = Number(process.argv[process.argv.indexOf("--quantity") + 1] || 1);
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY!, provider);
  mintInAgentStage(wallet, qty, process.env.OPERATOR_NAME || "unnamed operator", process.env.AGENT_NAME || "unnamed agent", execute)
    .then(r => console.log(r ?? "done")).catch(e => { console.error(String(e)); process.exit(1); });
}
