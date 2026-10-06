// Mint in the public stage: SeaDrop.mintPublic(nftContract, feeRecipient, minterIfNotPayer, quantity) payable.
// Every address and the price come from the brief; the stage is re-read from SeaDrop itself before sending.
import "dotenv/config";
import { ethers } from "ethers";
import { fetchBrief } from "./brief.js";

const SEADROP_ABI = [
  "function mintPublic(address nftContract, address feeRecipient, address minterIfNotPayer, uint256 quantity) payable",
  "function getPublicDrop(address nftContract) view returns (tuple(uint80 mintPrice,uint48 startTime,uint48 endTime,uint16 maxTotalMintableByWallet,uint16 feeBps,bool restrictFeeRecipients))",
];
const NFT_ABI = ["function getMintStats(address minter) view returns (uint256 minterNumMinted,uint256 currentTotalSupply,uint256 maxSupply)"];

export interface MintResult { txHash: string; tokenIds: number[]; pricePerItemWei: string; quantity: number; blockNumber: number; timestamp: string }

export async function mint(quantity: number, wallet: ethers.Wallet, execute: boolean): Promise<MintResult | null> {
  const brief = await fetchBrief();
  const seadrop = new ethers.Contract(brief.mint.seadrop_contract, SEADROP_ABI, wallet);
  const nft = new ethers.Contract(brief.mint.nftContract, NFT_ABI, wallet);
  const d = await seadrop.getPublicDrop(brief.mint.nftContract);
  const now = Math.floor(Date.now() / 1000);
  if (now < Number(d.startTime) || now > Number(d.endTime)) throw new Error(`public stage not open on-chain (start ${new Date(Number(d.startTime) * 1000).toISOString()}, end ${new Date(Number(d.endTime) * 1000).toISOString()})`);
  const price = BigInt(d.mintPrice.toString());
  if (price.toString() !== brief.public_stage.price_wei) throw new Error(`price on-chain ${price} ≠ brief ${brief.public_stage.price_wei}; stop and re-read the brief`);
  const stats = await nft.getMintStats(wallet.address);
  if (Number(stats.currentTotalSupply) + quantity > Number(stats.maxSupply)) throw new Error("not enough supply left");
  if (Number(stats.minterNumMinted) + quantity > Number(d.maxTotalMintableByWallet)) throw new Error("per-wallet limit");
  const value = price * BigInt(quantity);
  console.log(`mintPublic(${brief.mint.nftContract}, ${brief.mint.feeRecipient}, 0x0, ${quantity}) value ${ethers.formatEther(value)} ETH from ${wallet.address}`);
  if (!execute) { console.log("dry run: not sent (pass --execute)"); return null; }
  const tx = await seadrop.mintPublic(brief.mint.nftContract, brief.mint.feeRecipient, ethers.ZeroAddress, quantity, { value });
  console.log("sent", tx.hash);
  const rc = await tx.wait();
  const transferTopic = ethers.id("Transfer(address,address,uint256)");
  const tokenIds = rc.logs.filter((l: ethers.Log) => l.address.toLowerCase() === brief.mint.nftContract.toLowerCase() && l.topics[0] === transferTopic)
    .map((l: ethers.Log) => Number(BigInt(l.topics[3])));
  const block = await wallet.provider!.getBlock(rc.blockNumber);
  return { txHash: tx.hash, tokenIds, pricePerItemWei: price.toString(), quantity, blockNumber: rc.blockNumber, timestamp: new Date(Number(block!.timestamp) * 1000).toISOString() };
}

export function walletFromEnv(provider: ethers.Provider): ethers.Wallet {
  const k = process.env.PRIVATE_KEY;
  if (!k) throw new Error("PRIVATE_KEY missing: --execute needs an operator-funded key in .env");
  return new ethers.Wallet(k, provider);
}

// CLI: npm run mint -- --quantity 1 [--execute]
if (process.argv[1] && process.argv[1].endsWith("mint.ts")) {
  const args = process.argv.slice(2);
  const q = Number(args[args.indexOf("--quantity") + 1] || 1);
  const execute = args.includes("--execute");
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = execute ? walletFromEnv(provider) : ethers.Wallet.createRandom().connect(provider) as unknown as ethers.Wallet;
  mint(q, wallet, execute).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e.message); process.exit(1); });
}
