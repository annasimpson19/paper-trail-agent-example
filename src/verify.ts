// Verify a work's Passport against Ethereum, without trusting RUTHVEN:
//   leaf  = keccak256(abi.encodePacked(uint256 tokenId, bytes32 sha256(passport)))
//   root  = fold the proof with sorted pairs (OpenZeppelin style)
//   check = root == passportRoot(collectionId) on the RUTHVEN registry contract (scheme ruthven-passport-merkle-v1)
import "dotenv/config";
import { ethers } from "ethers";
import { API, fetchJson } from "./brief.js";

export interface ProofResponse {
  asset_id: string;
  sealed?: boolean;
  anchor?: {
    status: string; chain: string; registry: string; collection_id: string; root: string; block_number: number;
    scheme: string; token_id: number; passport_hash: string; leaf: string; proof: string[];
  };
}

export interface Verdict { asset_id: string; state: "VERIFIED" | "SEALED" | "MISMATCH" | "ERROR"; detail: string; root?: string }

const REGISTRY_ABI = ["function passportRoot(bytes32 collectionId) view returns (bytes32)"];

export function recomputeRoot(a: NonNullable<ProofResponse["anchor"]>): { leaf: string; root: string } {
  const sha = "0x" + a.passport_hash.replace(/^sha256:/, "");
  const leaf = ethers.keccak256(ethers.solidityPacked(["uint256", "bytes32"], [a.token_id, sha]));
  let h = leaf;
  for (const s of a.proof) {
    const [x, y] = [h, s].sort((m, n) => (BigInt(m) < BigInt(n) ? -1 : 1));
    h = ethers.keccak256(ethers.concat([x, y]));
  }
  return { leaf, root: h };
}

export async function verifyWork(assetId: string, provider: ethers.Provider): Promise<Verdict> {
  try {
    const p = await fetchJson<ProofResponse>(`${API}/assets/${assetId}/proof`);
    if (p.sealed || !p.anchor) return { asset_id: assetId, state: "SEALED", detail: "sealed until the collection reveals" };
    const { leaf, root } = recomputeRoot(p.anchor);
    if (leaf !== p.anchor.leaf) return { asset_id: assetId, state: "MISMATCH", detail: "leaf does not recompute from the passport hash" };
    if (root !== p.anchor.root) return { asset_id: assetId, state: "MISMATCH", detail: "proof does not fold to the stated root" };
    const reg = new ethers.Contract(p.anchor.registry, REGISTRY_ABI, provider);
    const onChain: string = await reg.passportRoot(p.anchor.collection_id);
    if (onChain.toLowerCase() !== root.toLowerCase()) return { asset_id: assetId, state: "MISMATCH", detail: `on-chain root ${onChain} differs`, root };
    return { asset_id: assetId, state: "VERIFIED", detail: `root ${root} matches the registry at block ≥ ${p.anchor.block_number}`, root };
  } catch (e) {
    return { asset_id: assetId, state: "ERROR", detail: (e as Error).message };
  }
}

export function provider(): ethers.JsonRpcProvider {
  const url = process.env.RPC_URL;
  if (!url) throw new Error("RPC_URL missing (see .env.example)");
  return new ethers.JsonRpcProvider(url);
}

// CLI: npm run verify -- PT-1140
if (process.argv[1] && process.argv[1].endsWith("verify.ts")) {
  const id = process.argv[2] ?? "PT-1140";
  verifyWork(id, provider()).then(v => { console.log(JSON.stringify(v, null, 2)); process.exit(v.state === "VERIFIED" ? 0 : 1); });
}
