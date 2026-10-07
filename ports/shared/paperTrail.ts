// PAPER TRAIL collector core, on viem. Framework-neutral: the three ports (AgentKit, Virtuals GAME, OpenClaw)
// are thin wrappers over this file. It mirrors src/ (ethers) step for step:
//
//   discover  fetchBrief()                       https://missalsimpson.com/agents/paper-trail.json
//   verify    verifyWork(tokenId)                 leaf = keccak256(abi.encodePacked(uint256 tokenId, bytes32 sha256(passport)))
//                                                 root = fold the proof with sorted pairs; compare with passportRoot(collectionId)
//                                                 on the RUTHVEN registry 0xcAAa85A114586009DeDc0b887B0E756D5f55017c (Ethereum mainnet)
//   evaluate  evaluate(brief, verdicts, rules)    the operator's rules; nothing here favours buying
//   acquire   mintPublicCalldata / mintSignedCalldata  {to, data, value} for whatever wallet the framework holds
//             applyToAgentStage()                 sign the operator declaration → POST → single-use signed-mint permission
//
// Every number comes from the brief, the stage endpoint or the chain at run time. The only hard-coded values are
// the genuine contract address (so a port can refuse a brief that names another one) and the registry address.
// Dry run is the default everywhere; a port must pass execute=true explicitly to send anything.
//
// Self-test (no keys, nothing sent):   npx tsx ports/shared/paperTrail.ts
import {
  concat, createPublicClient, encodeFunctionData, encodePacked, formatEther, http, keccak256, parseAbi,
  recoverTypedDataAddress, zeroAddress, type Address, type Hex, type PublicClient, type WalletClient,
  type TransactionReceipt,
} from "viem";
import { mainnet } from "viem/chains";

export const BRIEF_URL = "https://missalsimpson.com/agents/paper-trail.json";
export const API = "https://ruthven.ai/api/ruthven";
export const REVEALED_INDEX = "https://ruthven.ai/origin/paper-trail/revealed.json";
/** The only genuine PAPER TRAIL contract, Ethereum mainnet. The collection exists on no other chain. */
export const GENUINE_CONTRACT: Address = "0x6eE9aaE76d422Bf4eC27449EB83245A79adAe105";
/** The RUTHVEN registry that holds passportRoot(collectionId). */
export const REGISTRY: Address = "0xcAAa85A114586009DeDc0b887B0E756D5f55017c";

// ---------------------------------------------------------------------------------------------- types

export interface AgentStageBrief { endpoint: string; price_eth: string; price_wei: string; max_per_wallet: number; start: string; end: string; signer: string; status?: string }

export interface Brief {
  collection: { name: string; artist?: string; chain: string; chain_id: number; contract: string; opensea: string; works?: number };
  public_stage: { start: string; end: string; price_eth: string; price_wei: string; max_per_wallet: number; supply_max: number; supply_minted_at_update?: number };
  agent_stage?: AgentStageBrief;
  mint: { seadrop_contract: string; nftContract: string; feeRecipient: string };
  verify_before_you_buy: { anchor: { registry: string; collection_root: string; block: number; scheme: string } };
  warnings?: Record<string, string>;
}

export interface ProofResponse {
  asset_id: string;
  sealed?: boolean;
  anchor?: {
    status: string; chain: string; registry: string; collection_id: string; root: string; block_number: number;
    scheme: string; token_id: number; passport_hash: string; leaf: string; proof: string[];
  };
}

export interface Verdict { asset_id: string; state: "VERIFIED" | "SEALED" | "MISMATCH" | "ERROR"; detail: string; root?: string }

export interface Rules { max_price_eth: string; min_verified_proofs: number; require_stage_open: boolean; min_remaining_supply: number }

/** The same defaults as rules.json at the repository root. Operators override them per call. */
export const DEFAULT_RULES: Rules = { max_price_eth: "0.09", min_verified_proofs: 3, require_stage_open: true, min_remaining_supply: 1 };

export interface StageFacts {
  endpoint: string; price_eth: string; price_wei: string; max_per_wallet: number; start: string; end: string; signer: string;
  signer_configured: boolean; template: string; recorded_as: string; nftContract: string; seadrop: string; feeRecipient: string;
}

export interface MintParams { mintPrice: string; maxTotalMintableByWallet: string; startTime: string; endTime: string; dropStageIndex: string; maxTokenSupplyForStage: string; feeBps: string; restrictFeeRecipients: boolean }

export interface Permission {
  seadrop: string; nftContract: string; feeRecipient: string; quantity: number; mintParams: MintParams; salt: string; signature: string; value_wei: string;
  /** Kept with the permission so the acquisition record can carry the declaration it was granted on. */
  declaration?: { statement: string; signature: string; wallet: string; operator: string; agent: string };
}

export interface Call { to: Address; data: Hex; value: bigint }

/** The minimum a port must give the core to sign the declaration: an address and personal_sign (EIP-191). */
export interface MessageSigner { address: Address; signMessage: (message: string) => Promise<Hex> }

// ------------------------------------------------------------------------------------------ discover

export async function fetchJson<T = unknown>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return (await r.json()) as T;
}

/** Fetch the brief and refuse it unless it names the genuine contract on Ethereum mainnet (as src/agent.ts does). */
export async function fetchBrief(): Promise<Brief> {
  const brief = await fetchJson<Brief>(BRIEF_URL);
  if (brief.collection.chain_id !== 1 || brief.collection.contract.toLowerCase() !== GENUINE_CONTRACT.toLowerCase())
    throw new Error("brief does not name the genuine contract on Ethereum mainnet; stop");
  return brief;
}

/** The works the collection index lists as featured (open before the reveal). */
export async function featuredNumbers(): Promise<number[]> {
  const j = await fetchJson<{ featured?: number[] }>(REVEALED_INDEX);
  return (j.featured ?? []).slice().sort((a, b) => a - b);
}

export const pad4 = (n: number) => String(n).padStart(4, "0");
/** "1140", 1140 or "PT-1140" → "PT-1140". */
export function assetId(tokenId: number | string): string {
  const s = String(tokenId).trim().toUpperCase();
  if (s.startsWith("PT-")) return `PT-${pad4(Number(s.slice(3)))}`;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) throw new Error(`not a PAPER TRAIL token id: ${tokenId}`);
  return `PT-${pad4(n)}`;
}

/** A read-only client for Ethereum mainnet. RPC_URL if set; otherwise viem's default public RPC for mainnet. */
export function publicClient(rpcUrl?: string): PublicClient {
  return createPublicClient({ chain: mainnet, transport: http(rpcUrl || process.env.RPC_URL || undefined) });
}

// -------------------------------------------------------------------------------------------- verify

const REGISTRY_ABI = parseAbi(["function passportRoot(bytes32 collectionId) view returns (bytes32)"]);

/** Recompute leaf and root exactly as src/verify.ts does (scheme ruthven-passport-merkle-v1). */
export function recomputeRoot(a: NonNullable<ProofResponse["anchor"]>): { leaf: Hex; root: Hex } {
  const sha = ("0x" + a.passport_hash.replace(/^sha256:/, "")) as Hex;
  const leaf = keccak256(encodePacked(["uint256", "bytes32"], [BigInt(a.token_id), sha]));
  let h: Hex = leaf;
  for (const s of a.proof) {
    const [x, y] = [h, s as Hex].sort((m, n) => (BigInt(m) < BigInt(n) ? -1 : 1));
    h = keccak256(concat([x, y]));
  }
  return { leaf, root: h };
}

/** Verify one work's Passport against the registry on Ethereum, without trusting RUTHVEN's own answer. */
export async function verifyWork(tokenId: number | string, client: PublicClient = publicClient()): Promise<Verdict> {
  const id = assetId(tokenId);
  try {
    const p = await fetchJson<ProofResponse>(`${API}/assets/${id}/proof`);
    if (p.sealed || !p.anchor) return { asset_id: id, state: "SEALED", detail: "sealed until the collection reveals" };
    const { leaf, root } = recomputeRoot(p.anchor);
    if (leaf.toLowerCase() !== p.anchor.leaf.toLowerCase()) return { asset_id: id, state: "MISMATCH", detail: "leaf does not recompute from the passport hash" };
    if (root.toLowerCase() !== p.anchor.root.toLowerCase()) return { asset_id: id, state: "MISMATCH", detail: "proof does not fold to the stated root" };
    const onChain = await client.readContract({ address: p.anchor.registry as Address, abi: REGISTRY_ABI, functionName: "passportRoot", args: [p.anchor.collection_id as Hex] });
    if (onChain.toLowerCase() !== root.toLowerCase()) return { asset_id: id, state: "MISMATCH", detail: `on-chain root ${onChain} differs`, root };
    return { asset_id: id, state: "VERIFIED", detail: `root ${root} matches the registry at block ≥ ${p.anchor.block_number}`, root };
  } catch (e) {
    return { asset_id: id, state: "ERROR", detail: (e as Error).message };
  }
}

/** Verify a sample of the featured (revealed) works: the anchor they prove is the whole collection's. */
export async function verifyFeatured(count: number, client: PublicClient = publicClient()): Promise<Verdict[]> {
  const featured = await featuredNumbers();
  const sample = featured.slice(0, Math.max(count, 3));
  return Promise.all(sample.map(n => verifyWork(n, client)));
}

// ------------------------------------------------------------------------------------------ evaluate

export interface Evaluation { checks: Record<string, boolean>; pass: boolean; verified: number; mismatches: number; summary: string }

/**
 * The operator's rules, as in src/agent.ts. `priceEth` is the price of the stage being considered (public or
 * agent). A revealed work that fails to verify (MISMATCH) blocks the acquisition outright.
 */
export function evaluate(brief: Brief, verdicts: Verdict[], rules: Rules = DEFAULT_RULES, priceEth: string = brief.public_stage.price_eth, stage: { start: string; end: string } = brief.public_stage): Evaluation {
  const verified = verdicts.filter(v => v.state === "VERIFIED").length;
  const mismatches = verdicts.filter(v => v.state === "MISMATCH").length;
  const now = Date.now();
  const stageOpen = now >= Date.parse(stage.start) && now <= Date.parse(stage.end);
  const remaining = brief.public_stage.supply_max - (brief.public_stage.supply_minted_at_update ?? 0);
  const checks = {
    price_within_max: Number(priceEth) <= Number(rules.max_price_eth),
    enough_verified_proofs: verified >= rules.min_verified_proofs && mismatches === 0,
    stage_open: !rules.require_stage_open || stageOpen,
    supply_remaining: remaining >= rules.min_remaining_supply,
  };
  const pass = Object.values(checks).every(Boolean);
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  const summary = `${verified}/${verdicts.length} proofs VERIFIED against the registry (${mismatches} mismatches); ` +
    (pass ? "all rules pass" : `rules failed: ${failed.join(", ")}`) + ` → ${pass ? "may acquire" : "do not acquire"}`;
  return { checks, pass, verified, mismatches, summary };
}

// --------------------------------------------------------------------------------------- public stage

const SEADROP_ABI = parseAbi([
  "function mintPublic(address nftContract, address feeRecipient, address minterIfNotPayer, uint256 quantity) payable",
  "function getPublicDrop(address nftContract) view returns ((uint80 mintPrice,uint48 startTime,uint48 endTime,uint16 maxTotalMintableByWallet,uint16 feeBps,bool restrictFeeRecipients))",
  "function mintSigned(address nftContract, address feeRecipient, address minterIfNotPayer, uint256 quantity, (uint256 mintPrice,uint256 maxTotalMintableByWallet,uint256 startTime,uint256 endTime,uint256 dropStageIndex,uint256 maxTokenSupplyForStage,uint256 feeBps,bool restrictFeeRecipients) mintParams, uint256 salt, bytes signature) payable",
  "function getSignedMintValidationParams(address nftContract, address signer) view returns ((uint80 minMintPrice,uint24 maxMaxTotalMintableByWallet,uint40 minStartTime,uint40 maxEndTime,uint40 maxMaxTokenSupplyForStage,uint16 minFeeBps,uint16 maxFeeBps))",
]);
const NFT_ABI = parseAbi(["function getMintStats(address minter) view returns (uint256 minterNumMinted,uint256 currentTotalSupply,uint256 maxSupply)"]);

export interface PublicStageOnChain { priceWei: bigint; start: string; end: string; open: boolean; maxPerWallet: number; minted: number; totalSupply: number; maxSupply: number }

/**
 * Re-read the public stage from SeaDrop and the token contract (as src/mint.ts does) and refuse if the on-chain
 * price is not the brief's, the stage is closed, supply is short, or the wallet is at its limit.
 */
export async function checkPublicStage(brief: Brief, quantity: number, minter: Address, client: PublicClient = publicClient()): Promise<PublicStageOnChain> {
  const d = await client.readContract({ address: brief.mint.seadrop_contract as Address, abi: SEADROP_ABI, functionName: "getPublicDrop", args: [brief.mint.nftContract as Address] });
  const now = Math.floor(Date.now() / 1000);
  const start = new Date(Number(d.startTime) * 1000).toISOString(), end = new Date(Number(d.endTime) * 1000).toISOString();
  const open = now >= Number(d.startTime) && now <= Number(d.endTime);
  if (!open) throw new Error(`public stage not open on-chain (start ${start}, end ${end})`);
  const price = BigInt(d.mintPrice);
  if (price.toString() !== brief.public_stage.price_wei) throw new Error(`price on-chain ${price} wei ≠ brief ${brief.public_stage.price_wei} wei; stop and re-read the brief`);
  const [minted, totalSupply, maxSupply] = await client.readContract({ address: brief.mint.nftContract as Address, abi: NFT_ABI, functionName: "getMintStats", args: [minter] });
  if (Number(totalSupply) + quantity > Number(maxSupply)) throw new Error("not enough supply left");
  if (Number(minted) + quantity > Number(d.maxTotalMintableByWallet)) throw new Error(`per-wallet limit (${d.maxTotalMintableByWallet}) would be exceeded`);
  return { priceWei: price, start, end, open, maxPerWallet: Number(d.maxTotalMintableByWallet), minted: Number(minted), totalSupply: Number(totalSupply), maxSupply: Number(maxSupply) };
}

/** mintPublic(nftContract, feeRecipient, 0x0, quantity) with value = price_wei × quantity, all from the brief. */
export function mintPublicCalldata(brief: Brief, quantity: number): Call {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("quantity must be a positive integer");
  return {
    to: brief.mint.seadrop_contract as Address,
    data: encodeFunctionData({ abi: SEADROP_ABI, functionName: "mintPublic", args: [brief.mint.nftContract as Address, brief.mint.feeRecipient as Address, zeroAddress, BigInt(quantity)] }),
    value: BigInt(brief.public_stage.price_wei) * BigInt(quantity),
  };
}

// ---------------------------------------------------------------------------------------- agent stage

/** Read the stage from the brief, then the live endpoint; refuse if they disagree on price or cap. */
export async function stageFacts(brief?: Brief): Promise<StageFacts> {
  const b = brief ?? await fetchBrief();
  if (!b.agent_stage) throw new Error("the brief has no agent_stage section");
  const live = await fetchJson<Record<string, any>>(b.agent_stage.endpoint);
  if (live.price_wei !== b.agent_stage.price_wei || live.max_per_wallet !== b.agent_stage.max_per_wallet)
    throw new Error(`stage endpoint (${live.price_wei} wei, ${live.max_per_wallet}/wallet) disagrees with the brief; stop and re-read`);
  if (live.nftContract?.toLowerCase() !== GENUINE_CONTRACT.toLowerCase()) throw new Error("stage endpoint does not name the genuine contract; stop");
  return {
    ...b.agent_stage,
    signer: String(live.signer ?? b.agent_stage.signer),
    signer_configured: Boolean(live.signer_configured),
    template: String(live.qualification?.statement_template ?? ""),
    recorded_as: String(live.qualification?.recorded_as ?? "operator-declared agent acquisition").replace(/\.$/, ""),
    nftContract: live.nftContract, seadrop: live.seadrop, feeRecipient: live.feeRecipient,
  };
}

/** Fill the declaration template exactly as src/agent-stage.ts does. */
export function declarationStatement(template: string, wallet: Address, operator: string, agent: string, date = new Date()): string {
  return template.replace("{wallet}", wallet).replace("{operator}", operator).replace("{agent}", agent).replace("{YYYY-MM-DD}", date.toISOString().slice(0, 10));
}

function signerOf(w: WalletClient | MessageSigner): MessageSigner {
  if ("signMessage" in w && "address" in w) return w as MessageSigner;
  const wc = w as WalletClient;
  if (!wc.account) throw new Error("the viem WalletClient has no account; create it with an account");
  const account = wc.account;
  return { address: account.address, signMessage: (message: string) => wc.signMessage({ account, message }) };
}

/**
 * Sign the operator declaration with the agent's wallet (personal_sign / EIP-191), POST it to the stage endpoint
 * and return the single-use SeaDrop signed-mint permission. Nothing is sent to the chain here.
 * Accepts a viem WalletClient (with an account) or any { address, signMessage } pair.
 */
export async function applyToAgentStage(wallet: WalletClient | MessageSigner, quantity: number, operator: string, agent: string, erc8004?: { registry: string; agentId: string }): Promise<Permission> {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("quantity must be a positive integer");
  if (!operator.trim() || !agent.trim()) throw new Error("operator and agent names are required for the declaration");
  const f = await stageFacts();
  if (quantity > f.max_per_wallet) throw new Error(`the agent stage allows at most ${f.max_per_wallet} per wallet`);
  const s = signerOf(wallet);
  const statement = declarationStatement(f.template, s.address, operator, agent);
  const signature = await s.signMessage(statement);
  const r = await fetch(f.endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ wallet: s.address, quantity, declaration: { statement, signature }, erc8004 }) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`stage refused (${r.status}): ${out.error ?? JSON.stringify(out)}`);
  const p = out as Permission;
  if (p.nftContract?.toLowerCase() !== GENUINE_CONTRACT.toLowerCase()) throw new Error("the permission names a contract that is not PAPER TRAIL; stop");
  if (String(p.mintParams?.mintPrice) !== f.price_wei) throw new Error(`permission price ${p.mintParams?.mintPrice} ≠ stage price ${f.price_wei}; stop and re-read`);
  if (BigInt(p.value_wei) !== BigInt(f.price_wei) * BigInt(quantity)) throw new Error("permission value_wei is not price × quantity; stop");
  p.declaration = { statement, signature, wallet: s.address, operator, agent };
  return p;
}

export interface PermissionCheck { signer: Address; authorisedUntil: string; minMintPriceWei: bigint }

/** Recover the studio signer from the permission and check SeaDrop's own bounds for it (as src/agent-stage.ts). */
export async function checkPermission(p: Permission, minter: Address, client: PublicClient = publicClient()): Promise<PermissionCheck> {
  const signer = await recoverTypedDataAddress({
    domain: { name: "SeaDrop", version: "1.0", chainId: 1, verifyingContract: p.seadrop as Address },
    types: {
      SignedMint: [{ name: "nftContract", type: "address" }, { name: "minter", type: "address" }, { name: "feeRecipient", type: "address" }, { name: "mintParams", type: "MintParams" }, { name: "salt", type: "uint256" }],
      MintParams: [{ name: "mintPrice", type: "uint256" }, { name: "maxTotalMintableByWallet", type: "uint256" }, { name: "startTime", type: "uint256" }, { name: "endTime", type: "uint256" }, { name: "dropStageIndex", type: "uint256" }, { name: "maxTokenSupplyForStage", type: "uint256" }, { name: "feeBps", type: "uint256" }, { name: "restrictFeeRecipients", type: "bool" }],
    },
    primaryType: "SignedMint",
    message: { nftContract: p.nftContract as Address, minter, feeRecipient: p.feeRecipient as Address, mintParams: mintParamsTuple(p.mintParams), salt: BigInt(p.salt) },
    signature: p.signature as Hex,
  });
  const b = await client.readContract({ address: p.seadrop as Address, abi: SEADROP_ABI, functionName: "getSignedMintValidationParams", args: [p.nftContract as Address, signer] });
  if (Number(b.maxEndTime) === 0) throw new Error(`the token contract has not authorised signer ${signer} yet; the stage is not live on-chain`);
  if (BigInt(p.mintParams.mintPrice) < BigInt(b.minMintPrice)) throw new Error("permission price below the on-chain minimum");
  if (Number(b.maxEndTime) * 1000 < Date.now()) throw new Error("the signer's on-chain authorisation has ended; the stage is closed");
  return { signer, authorisedUntil: new Date(Number(b.maxEndTime) * 1000).toISOString(), minMintPriceWei: BigInt(b.minMintPrice) };
}

function mintParamsTuple(m: MintParams) {
  return {
    mintPrice: BigInt(m.mintPrice), maxTotalMintableByWallet: BigInt(m.maxTotalMintableByWallet), startTime: BigInt(m.startTime), endTime: BigInt(m.endTime),
    dropStageIndex: BigInt(m.dropStageIndex), maxTokenSupplyForStage: BigInt(m.maxTokenSupplyForStage), feeBps: BigInt(m.feeBps), restrictFeeRecipients: Boolean(m.restrictFeeRecipients),
  };
}

/** mintSigned(nftContract, feeRecipient, 0x0, quantity, mintParams, salt, signature) with value = value_wei. */
export function mintSignedCalldata(p: Permission): Call {
  return {
    to: p.seadrop as Address,
    data: encodeFunctionData({ abi: SEADROP_ABI, functionName: "mintSigned", args: [p.nftContract as Address, p.feeRecipient as Address, zeroAddress, BigInt(p.quantity), mintParamsTuple(p.mintParams), BigInt(p.salt), p.signature as Hex] }),
    value: BigInt(p.value_wei),
  };
}

// ---------------------------------------------------------------------------------------------- after

const TRANSFER_TOPIC = keccak256(new TextEncoder().encode("Transfer(address,address,uint256)"));

/** Token ids minted to anyone in this receipt, read from the token contract's Transfer logs. */
export function tokenIdsFromReceipt(receipt: Pick<TransactionReceipt, "logs">, nftContract: string): number[] {
  return receipt.logs
    .filter(l => l.address.toLowerCase() === nftContract.toLowerCase() && l.topics[0] === TRANSFER_TOPIC && l.topics[3])
    .map(l => Number(BigInt(l.topics[3] as Hex)));
}

export interface AcquisitionRecord {
  collection: string; contract: string; chain: "ethereum"; stage: "public" | "agent"; wallet: string; token_ids: number[]; transaction: string;
  price_per_item_eth: string; quantity: number; acquisition_method: string; declaration?: Permission["declaration"]; verify_after_reveal: string[];
}

/** The honest record src/agent.ts writes: who ran it, what was paid, and how to verify after the reveal. */
export function acquisitionRecord(brief: Brief, stage: "public" | "agent", wallet: string, txHash: string, tokenIds: number[], pricePerItemWei: bigint, quantity: number, framework: string, declaration?: Permission["declaration"]): AcquisitionRecord {
  return {
    collection: brief.collection.name, contract: brief.collection.contract, chain: "ethereum", stage, wallet, token_ids: tokenIds, transaction: txHash,
    price_per_item_eth: formatEther(pricePerItemWei), quantity,
    acquisition_method: stage === "agent"
      ? `operator-declared agent acquisition in the AI Agents stage (${framework}); not an assertion of autonomy`
      : `operator-authorised agent run in the public stage (${framework})`,
    declaration,
    verify_after_reveal: tokenIds.map(id => `${API}/assets/PT-${pad4(id)}/proof`),
  };
}

// --------------------------------------------------------------------------------------- plain words

export function describeBrief(b: Brief): string {
  const ps = b.public_stage, as = b.agent_stage;
  const lines = [
    `${b.collection.name} by ${b.collection.artist ?? "Miss AL Simpson"}: ${b.collection.works ?? 4000} works, ERC-721 at ${b.collection.contract} on Ethereum mainnet (the only genuine contract).`,
    `Public stage: ${ps.price_eth} ETH each, up to ${ps.max_per_wallet} per wallet, ${ps.start} → ${ps.end}; ${ps.supply_minted_at_update ?? "?"} of ${ps.supply_max} minted at the brief's last update.`,
  ];
  if (as) lines.push(`AI Agents stage: ${as.price_eth} ETH each, up to ${as.max_per_wallet} per wallet, ${as.start} → ${as.end}, via ${as.endpoint}; an acquisition there is recorded publicly as operator-declared (not an assertion of autonomy).`);
  lines.push(`Provenance: every work has a RUTHVEN Origin Passport anchored at ${b.verify_before_you_buy.anchor.registry} (root ${b.verify_before_you_buy.anchor.collection_root}, block ${b.verify_before_you_buy.anchor.block}). Verify before you buy.`);
  lines.push("This brief states facts. It is not a recommendation to buy; the studio values nothing and recommends nothing.");
  return lines.join("\n");
}

export function describeVerdict(v: Verdict): string {
  switch (v.state) {
    case "VERIFIED": return `${v.asset_id}: VERIFIED — the Passport hash folds to the root the registry holds on Ethereum (${v.detail}).`;
    case "SEALED": return `${v.asset_id}: SEALED — not yet revealed; the proof opens at the collection reveal. The anchor is the same for all 4,000 works, so verify a featured work instead.`;
    case "MISMATCH": return `${v.asset_id}: MISMATCH — ${v.detail}. Do not buy on this record.`;
    default: return `${v.asset_id}: ERROR — ${v.detail}.`;
  }
}

export function describeStage(f: StageFacts): string {
  return `AI Agents stage of PAPER TRAIL: ${f.price_eth} ETH each, up to ${f.max_per_wallet} per wallet, ${f.start} → ${f.end}. ` +
    `Studio signer ${f.signer}${f.signer_configured ? " (configured)" : " (NOT yet configured: POST answers 503)"}. ` +
    `Qualification: an operator declaration signed by the minting wallet; the acquisition is recorded publicly as ${f.recorded_as}. ` +
    "Facts only; not a recommendation to buy.";
}

// ---------------------------------------------------------------------------------- one-call pipeline

export interface MintPlan {
  stage: "public" | "agent"; quantity: number; wallet: Address; brief: Brief; verdicts: Verdict[]; evaluation: Evaluation;
  call?: Call; permission?: Permission; priceWei: bigint; notes: string[];
}

/**
 * Everything a port does before (and instead of, in a dry run) sending: discover, verify the featured works,
 * evaluate the rules, re-read the stage from the chain, build the call. Throws if any rule or check fails.
 * For the agent stage it signs the declaration with `signer` and obtains the single-use permission.
 */
export async function planMint(opts: { stage: "public" | "agent"; quantity: number; wallet: Address; signer?: MessageSigner | WalletClient; operator?: string; agent?: string; erc8004?: { registry: string; agentId: string }; rules?: Partial<Rules>; client?: PublicClient }): Promise<MintPlan> {
  const client = opts.client ?? publicClient();
  const rules: Rules = { ...DEFAULT_RULES, ...opts.rules };
  const brief = await fetchBrief();
  const verdicts = await verifyFeatured(rules.min_verified_proofs, client);
  const notes: string[] = [];
  if (opts.stage === "public") {
    const evaluation = evaluate(brief, verdicts, rules);
    if (!evaluation.pass) throw new Error(`rules not met: ${evaluation.summary}`);
    const onChain = await checkPublicStage(brief, opts.quantity, opts.wallet, client);
    const call = mintPublicCalldata(brief, opts.quantity);
    notes.push(`public stage open on-chain until ${onChain.end}; ${onChain.totalSupply}/${onChain.maxSupply} minted; this wallet has ${onChain.minted} of ${onChain.maxPerWallet}`);
    return { stage: "public", quantity: opts.quantity, wallet: opts.wallet, brief, verdicts, evaluation, call, priceWei: onChain.priceWei, notes };
  }
  if (!brief.agent_stage) throw new Error("the brief has no agent_stage section");
  if (!opts.signer || !opts.operator || !opts.agent) throw new Error("the agent stage needs a signer, an operator name and an agent name");
  const evaluation = evaluate(brief, verdicts, rules, brief.agent_stage.price_eth, brief.agent_stage);
  if (!evaluation.pass) throw new Error(`rules not met: ${evaluation.summary}`);
  const permission = await applyToAgentStage(opts.signer, opts.quantity, opts.operator, opts.agent, opts.erc8004);
  const check = await checkPermission(permission, opts.wallet, client);
  const call = mintSignedCalldata(permission);
  notes.push(`single-use permission issued by studio signer ${check.signer}, authorised on-chain until ${check.authorisedUntil}; the acquisition will be recorded as operator-declared`);
  return { stage: "agent", quantity: opts.quantity, wallet: opts.wallet, brief, verdicts, evaluation, call, permission, priceWei: BigInt(permission.mintParams.mintPrice), notes };
}

export function describePlan(p: MintPlan, execute: boolean): string {
  const fn = p.stage === "public" ? "SeaDrop.mintPublic" : "SeaDrop.mintSigned";
  return [
    `Plan: ${fn} × ${p.quantity} from ${p.wallet}, value ${formatEther(p.call!.value)} ETH (${formatEther(p.priceWei)} ETH each) to ${p.call!.to}.`,
    p.evaluation.summary,
    ...p.verdicts.map(describeVerdict),
    ...p.notes,
    execute ? "Sending now." : "DRY RUN: nothing sent. Pass execute=true to mint for real from a funded wallet.",
  ].join("\n");
}

// ------------------------------------------------------------------------------------------ self-test
// npx tsx ports/shared/paperTrail.ts   — fetches the brief, verifies PT-1140, GETs the stage facts. No keys, no sends.
if (process.argv[1]?.endsWith("paperTrail.ts")) {
  (async () => {
    await import("dotenv/config").catch(() => undefined);
    const brief = await fetchBrief();
    console.log(describeBrief(brief));
    const client = publicClient();
    console.log(`\nRPC: ${process.env.RPC_URL ? "RPC_URL from .env" : "viem's default public mainnet RPC (set RPC_URL for your own)"}`);
    const v = await verifyWork("PT-1140", client);
    console.log(describeVerdict(v));
    const f = await stageFacts(brief);
    console.log("\n" + describeStage(f));
    const call = mintPublicCalldata(brief, 1);
    console.log(`\nmintPublic calldata for 1 (not sent): to ${call.to}, value ${formatEther(call.value)} ETH, data ${call.data.slice(0, 10)}…`);
    if (v.state !== "VERIFIED") { console.error("self-test: PT-1140 did not verify"); process.exit(1); }
    console.log("\nself-test OK — nothing was signed or sent");
  })().catch(e => { console.error("STOPPED:", (e as Error).message); process.exit(1); });
}
