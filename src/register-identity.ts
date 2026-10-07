// Register this agent's ERC-8004 identity on the Ethereum mainnet Identity Registry (one transaction, gas only), so the
// agent qualifies for an Agent Stage: the identity's agent wallet (set to the registering wallet) must be the minting wallet.
//   AGENT_URI=https://…/agent.json npm run register-identity              # dry run: static call, predicted agentId, gas
//   AGENT_URI=… npm run register-identity -- --execute                   # sends it
import "dotenv/config";
import { ethers } from "ethers";
const REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const ABI = ["function register(string agentURI) returns (uint256 agentId)", "function getAgentWallet(uint256 agentId) view returns (address)", "function ownerOf(uint256) view returns (address)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"];
const execute = process.argv.includes("--execute");
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY!, provider);
const uri = process.env.AGENT_URI; if (!uri) throw new Error("set AGENT_URI to the agent registration file (ERC-8004: type, name, description, image, services, x402Support, active, registrations)");
const reg = new ethers.Contract(REGISTRY, ABI, wallet);
const predicted = await reg.register.staticCall(uri);
const gas = await reg.register.estimateGas(uri); const fee = await provider.getFeeData();
console.log(`register(${uri}) from ${wallet.address} → agentId ${predicted} · gas ≈ ${gas} ≈ ${ethers.formatEther(gas * (fee.maxFeePerGas ?? fee.gasPrice!))} ETH · balance ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH`);
if (!execute) { console.log("dry run: not sent (pass --execute)"); process.exit(0); }
const tx = await reg.register(uri); console.log("sent", tx.hash); const rc = await tx.wait();
let id: string | null = null; for (const l of rc.logs) { try { const e = reg.interface.parseLog(l); if (e?.name === "Transfer") id = e.args.tokenId.toString(); } catch {} }
console.log(`mined in block ${rc.blockNumber} · agentId ${id} · agent wallet ${id ? await reg.getAgentWallet(id) : "?"}`);
