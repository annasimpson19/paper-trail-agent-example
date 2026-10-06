// The loop: discover → verify → evaluate → (acquire) → record.  Dry run unless --execute.
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ethers } from "ethers";
import { fetchBrief, featuredNumbers, pad4 } from "./brief.js";
import { verifyWork, provider } from "./verify.js";
import { mint, walletFromEnv } from "./mint.js";

interface Rules { max_price_eth: string; min_verified_proofs: number; require_stage_open: boolean; min_remaining_supply: number; quantity: number }

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const quantity = Number(args[args.indexOf("--quantity") + 1] || 0) || undefined;

(async () => {
  const rules: Rules = JSON.parse(readFileSync(new URL("../rules.json", import.meta.url), "utf8"));
  const q = quantity ?? rules.quantity;
  const prov = provider();

  // 1. discover
  const brief = await fetchBrief();
  console.log(`DISCOVERED ${brief.collection.name} · ${brief.collection.contract} on ${brief.collection.chain}`);
  if (brief.collection.chain_id !== 1 || brief.collection.contract.toLowerCase() !== "0x6ee9aae76d422bf4ec27449eb83245a79adae105") throw new Error("brief does not name the genuine contract; stop");

  // 2. verify: the featured works are open before the reveal; the anchor they prove is the whole collection's
  const featured = await featuredNumbers();
  const sample = featured.slice(0, Math.max(rules.min_verified_proofs, 3));
  const verdicts = await Promise.all(sample.map(n => verifyWork(`PT-${pad4(n)}`, prov)));
  for (const v of verdicts) console.log(`  ${v.state.padEnd(9)} ${v.asset_id} · ${v.detail}`);
  const verified = verdicts.filter(v => v.state === "VERIFIED").length;
  const mismatches = verdicts.filter(v => v.state === "MISMATCH").length;
  console.log(`VERIFIED ${verified}/${verdicts.length} proofs against the registry (${mismatches} mismatches)`);

  // 3. evaluate, by the operator's rules — nothing here favours buying
  const now = Date.now();
  const stageOpen = now >= Date.parse(brief.public_stage.start) && now <= Date.parse(brief.public_stage.end);
  const remaining = brief.public_stage.supply_max - (brief.public_stage as { supply_minted_at_update?: number }).supply_minted_at_update!;
  const checks = {
    price_within_max: Number(brief.public_stage.price_eth) <= Number(rules.max_price_eth),
    enough_verified_proofs: verified >= rules.min_verified_proofs && mismatches === 0,
    stage_open: !rules.require_stage_open || stageOpen,
    supply_remaining: remaining >= rules.min_remaining_supply,
  };
  const pass = Object.values(checks).every(Boolean);
  console.log("EVALUATED", JSON.stringify(checks), "→", pass ? "ACQUIRE" : "DO NOT ACQUIRE");
  if (!pass) process.exit(0);

  // 4. acquire (only with --execute and an operator-funded key)
  const wallet = execute ? walletFromEnv(prov) : (ethers.Wallet.createRandom().connect(prov) as unknown as ethers.Wallet);
  const result = await mint(q, wallet, execute);
  if (!result) { console.log("dry run complete: rules passed, nothing minted"); return; }

  // 5. record, honestly: an operator ran this
  const rec = {
    collection: brief.collection.name, contract: brief.collection.contract, chain: "ethereum",
    wallet: wallet.address, token_ids: result.tokenIds, transaction: result.txHash, block: result.blockNumber, timestamp: result.timestamp,
    price_per_item_eth: ethers.formatEther(result.pricePerItemWei), quantity: result.quantity,
    acquisition_method: "operator-authorised agent run (paper-trail-agent-example)",
    rules_applied: rules, checks, proofs_verified_before_mint: verdicts,
    verify_after_reveal: result.tokenIds.map(id => `https://ruthven.ai/api/ruthven/assets/PT-${pad4(id)}/proof`),
  };
  mkdirSync(new URL("../acquisitions/", import.meta.url), { recursive: true });
  const out = new URL(`../acquisitions/${result.txHash}.json`, import.meta.url);
  writeFileSync(out, JSON.stringify(rec, null, 2));
  console.log(`ACQUIRED ${result.tokenIds.map(pad4).join(", ")} · recorded ${out.pathname}`);
})().catch(e => { console.error("STOPPED:", e.message); process.exit(1); });
