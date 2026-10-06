// The agent's first step: read the brief the artist publishes for agents.
export const BRIEF_URL = "https://missalsimpson.com/agents/paper-trail.json";
export const API = "https://ruthven.ai/api/ruthven";

export interface Brief {
  collection: { name: string; chain: string; chain_id: number; contract: string; opensea: string };
  public_stage: { start: string; end: string; price_eth: string; price_wei: string; max_per_wallet: number; supply_max: number };
  mint: { seadrop_contract: string; nftContract: string; feeRecipient: string };
  verify_before_you_buy: { anchor: { registry: string; collection_root: string; block: number; scheme: string } };
}

export async function fetchBrief(): Promise<Brief> {
  const r = await fetch(BRIEF_URL, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`brief ${r.status}`);
  return (await r.json()) as Brief;
}

export async function fetchJson<T = unknown>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return (await r.json()) as T;
}

/** The works the collection index lists as featured (open before the reveal). */
export async function featuredNumbers(): Promise<number[]> {
  const j = await fetchJson<{ featured?: number[] }>("https://ruthven.ai/origin/paper-trail/revealed.json");
  return (j.featured ?? []).slice().sort((a, b) => a - b);
}

export const pad4 = (n: number) => String(n).padStart(4, "0");
