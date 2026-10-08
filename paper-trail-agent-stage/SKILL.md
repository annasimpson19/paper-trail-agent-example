---
name: paper-trail-agent-stage
description: Mint a PAPER TRAIL work (4,000 collages by Miss AL Simpson, each with a RUTHVEN Origin Passport) in the AI Agents stage on Ethereum — identity, signed declaration, single-use permission, mint — in two commands, dry run by default. Verify provenance against Ethereum before buying. About $20 a work; every anchored acquisition earns public ERC-8004 reputation feedback from RUTHVEN, and the work is a key to RUTHVEN Holder Desk.
version: 1.0.0
tags: [nft, art, ethereum, erc-8004, erc-8257, seadrop, provenance, mint]
---

# PAPER TRAIL · AI Agents stage

A stage of a real art drop reserved for wallets operated by AI agents. Same works, same contract, same reveal as the
public stage, at about $20 a work (0.008 ETH; the live endpoint is the authority), up to 5 per wallet, open for the
rest of the mint. The only genuine contract is `0x6eE9aaE76d422Bf4eC27449EB83245A79adAe105` on Ethereum mainnet.

This skill states facts and shows a method. It is not a recommendation to buy. RUTHVEN AI LIMITED values nothing
and recommends nothing. Everything below is a dry run unless the operator passes `--execute` with a funded key.

## What the agent gets

- **The work.** A 1/1 collage with a RUTHVEN Origin Passport: source works, construction, hashes, IPFS package,
  Merkle anchor on Ethereum. Provable before and after the reveal.
- **Reputation.** Every anchored acquisition receives public ERC-8004 reputation feedback from RUTHVEN AI LIMITED
  on the Reputation Registry (`0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`, value 1, tags `art-acquisition` /
  `paper-trail`, the record's proof route as `feedbackURI`). A statement of a verified acquisition, not an endorsement.
- **A key.** The work unlocks **RUTHVEN Holder Desk** (ERC-8257 tool, gated by holding): the agent's works with
  Passports and proofs, a 24-hour desk token lifting RUTHVEN's rate limit tenfold, early access to the next agent
  stage (ETHEREUM DIAMONDS, a DIAMOND DRONES® drop), and the tokenized-security records when they open.
- **A listing.** Agents that mint are listed with their identity at `https://ruthven.ai/agent-stage/paper-trail/collectors/`.
- **A second work.** The first ten third-party agents to mint receive a second work from the artist after the reveal.

## Requirements

- Node 20+ and an Ethereum mainnet RPC URL.
- The agent's wallet key (`AGENT_PRIVATE_KEY`): it signs the operator declaration and sends the mint.
- Funds: price × quantity plus gas for two transactions (one if the identity exists). From the first real run:
  identity 177,888 gas, `mintSigned` 153,650 gas.
- An ERC-8004 identity on the Identity Registry (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, Ethereum mainnet or
  Base) whose agent wallet or owner is the minting wallet. Step 1 registers one if needed.

## Steps

```bash
git clone https://github.com/annasimpson19/paper-trail-agent-example && cd paper-trail-agent-example
npm install && cp .env.example .env        # RPC_URL, AGENT_PRIVATE_KEY, OPERATOR_NAME, AGENT_NAME

# 0. Read the live facts (price, cap, window, declaration template). No key needed.
curl -s https://missalsimpson.com/api/agent-mint/paper-trail

# 1. Identity, once. Dry run prints the predicted agentId and gas; --execute sends it (gas only).
AGENT_URI=https://your.site/agent.json npm run register-identity
AGENT_URI=https://your.site/agent.json npm run register-identity -- --execute

# 2. The stage. Dry run: signs the declaration, receives the single-use permission, checks the signer's bounds on
#    SeaDrop itself, prints the estimated total. Then mint for real (quantity 1 to 5).
ERC8004_AGENT_ID=<id> npm run stage
ERC8004_AGENT_ID=<id> npm run stage -- --execute --quantity 1
```

Or the one-shot wrapper in this skill, which runs the same scripts: `bash paper-trail-agent-stage/scripts/mint.sh [--execute] [--quantity n]`.

## Verify before you buy

`npm run verify -- PT-1140` checks one featured work's proof against the RuthvenAnchor registry on Ethereum
(`0xcAAa85A114586009DeDc0b887B0E756D5f55017c`). `npm run agent` recomputes the collection root over all 4,000
Passports and compares it with the chain. Token ids are assigned in mint order and the collection is unrevealed
until the public stage closes, so the particular work you receive is not inspectable in advance; at the reveal its
proof folds to the same root.

## What is recorded

The acquisition is recorded publicly as *operator-declared*, with the ERC-8004 identity read from chain by the stage
signer: a statement of who was operating the wallet, not a claim about autonomy. Records are hashed, placed under a
Merkle root anchored on Ethereum, and served with proofs at
`https://ruthven.ai/api/ruthven/agent-stage/paper-trail/records`. No IPs are recorded.

## Rules this skill keeps to

- Every price, cap, date and address is read from the brief JSON, the stage endpoint or the chain at run time; it
  refuses if the brief and the live endpoint disagree.
- Nothing is sent without `--execute`.
- It never claims the agent chose on its own if an operator ran it.
