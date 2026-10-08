# paper-trail-agent-example

A small, honest example of an agent that **verifies before it buys**: it reads the PAPER TRAIL agent brief,
checks the collection's provenance anchor against Ethereum itself, applies its own rules, and only then mints,
in the AI Agents stage or the public stage. Dry run by default. Nothing is sent to the chain unless an operator
passes `--execute` with a funded key.

PAPER TRAIL is 4,000 collages by Miss AL Simpson, each with a RUTHVEN Origin Passport.
Brief: https://missalsimpson.com/agents/paper-trail/ · JSON: https://missalsimpson.com/agents/paper-trail.json

This repository is published by the artist's studio. It states facts and shows a method.
It is not a recommendation to buy. RUTHVEN AI LIMITED values nothing and recommends nothing.

## Quick start for agents: the AI Agents stage

If you are an agent, or run one, start here. The AI Agents stage is a second stage of the same drop, alongside the
public one: the same works, the same contract, the same reveal, at **about $20 a work (0.008 ETH), up to 10 per
wallet**, open for **the rest of the mint**. The live endpoint (`GET https://missalsimpson.com/api/agent-mint/paper-trail`)
states the price and date it can sign at any moment; it is the authority, and this repository's scripts read it.

**Install as a skill:** `npx skills add https://github.com/annasimpson19/paper-trail-agent-example --skill paper-trail-agent-stage`
(see [`paper-trail-agent-stage/SKILL.md`](paper-trail-agent-stage/SKILL.md)).

**What an agent gets.** Every anchored acquisition in this stage receives public ERC-8004 **reputation** feedback from
RUTHVEN AI LIMITED on the Reputation Registry (value 1, tags `art-acquisition` / `paper-trail`, the record's proof as
`feedbackURI`). The work is a **key**: it unlocks RUTHVEN Holder Desk (an ERC-8257 tool gated by holding) — the
agent's works with Passports and proofs, a 24-hour desk token lifting RUTHVEN's rate limit tenfold, early access to the
next agent stage (ETHEREUM DIAMONDS, a DIAMOND DRONES® drop), and the tokenized-security records when they open. Agents
that mint are **listed** at `https://ruthven.ai/agent-stage/paper-trail/collectors/`. The first ten third-party agents to
mint receive a **second work** after the reveal.

**Eligibility.** A wallet operated by an AI agent, with (1) an operator declaration signed by that wallet, and
(2) an ERC-8004 identity on the Identity Registry, on Ethereum mainnet or on Base, whose agent wallet or owner is
the minting wallet, checked on chain. `npm run register-identity` registers one (one transaction, gas only).

**What it costs.** The stage price per work (about $20; 0.008 ETH), plus gas for two transactions. From the first real run (7 October 2026, at the first price of 0.02 ETH):

| transaction | gas used | at 0.2 gwei | at 3 gwei |
|---|---|---|---|
| register the ERC-8004 identity (once) | 177,888 | ≈ 0.00004 ETH | ≈ 0.0005 ETH |
| `mintSigned`, one work | 153,650 | ≈ 0.00003 ETH | ≈ 0.0005 ETH |

So one work is ≈ 0.0081 ETH all in at low gas at the current price, ten works ≈ 0.081 ETH. The dry run prints the live
figure for your wallet: price, estimated gas at the current fee, the total, and whether your balance covers it.

```bash
npm install
cp .env.example .env            # RPC_URL and AGENT_PRIVATE_KEY (the agent's wallet; needed to sign the declaration)

# 1. Identity, once. Dry run first: static call, predicted agentId, gas estimate. Then send it.
AGENT_URI=https://your.site/agent.json npm run register-identity
AGENT_URI=https://your.site/agent.json npm run register-identity -- --execute

# 2. The stage. Dry run: reads the brief and the live endpoint (refuses if they disagree), signs the declaration,
#    receives the single-use permission, checks the signer's bounds on SeaDrop itself, prints the estimated total.
OPERATOR_NAME="Your Co" AGENT_NAME="your-agent v1" ERC8004_AGENT_ID=<id> npm run stage
#    Then mint for real (quantity 1 to 10).
OPERATOR_NAME="Your Co" AGENT_NAME="your-agent v1" ERC8004_AGENT_ID=<id> npm run stage -- --execute --quantity 1
```

A funded wallet, two transactions, about ten minutes. `src/agent-stage.ts` is the whole method: read the
`agent_stage` section of the brief, check it against the live endpoint, sign the operator declaration with the
agent's wallet, receive a SeaDrop signed-mint permission, verify the signer's bounds on SeaDrop, then `mintSigned`.
The acquisition is recorded publicly as *operator-declared*, identity verified on chain. It says who was operating
the wallet; it claims nothing about autonomy. A dry run also leaves a granted-but-unused permission in that record,
flagged as such.

**Before you buy, what you can check.** Token ids are assigned in mint order and the collection is unrevealed until
the public stage closes, so you cannot inspect the particular work you will receive. You can check the 30 featured
works (full Passport, source works, hashes, proof: `npm run verify -- PT-1140`) and the collection commitment, a
Merkle root over all 4,000 Passports anchored on Ethereum, which `npm run agent` recomputes and compares with the
registry. At the reveal your own work's proof folds to that same root.

## The public stage: what the full agent does

1. **Discover** — fetch `paper-trail.json` (contract, stage window, price, mint call).
2. **Verify** — for the featured works, fetch each `/proof`, recompute the Merkle leaf and root locally,
   and compare the root with `passportRoot(collectionId)` on the RUTHVEN registry contract on Ethereum.
   Works that are not yet revealed answer `sealed`; the anchor is the same for all 4,000.
3. **Evaluate** — apply the operator's rules in `rules.json` (max price, minimum verified proofs, stage open,
   remaining supply). The agent's decision is its own; nothing here is weighted toward buying.
4. **Acquire** — if the rules pass and `--execute` is given, call `mintPublic` on SeaDrop with the exact
   fee recipient the drop requires, paying `price × quantity`.
5. **Record** — write `acquisitions/<tx>.json` with wallet, token ids, price, timestamp, the rules that passed,
   and `acquisition_method: "operator-authorised agent run"`. If a human pressed the button, the record says so.

## Run the public stage (0.09 ETH, up to 1,000 per wallet)

```bash
npm install
cp .env.example .env            # RPC_URL required; PRIVATE_KEY only for --execute
npm run agent                   # dry run: discover, verify, evaluate, print the decision
npm run agent -- --execute --quantity 1   # mint for real, from the key in .env
npm run verify -- PT-1140       # verify one work's proof on its own
```

## Ports

The same method, wrapped for three agent frameworks, under `ports/`. All three share one viem core,
`ports/shared/paperTrail.ts` (discover → verify → evaluate → calldata, plus the agent-stage declaration), which
you can also run on its own as a self-test that fetches the brief, verifies PT-1140 and reads the stage facts
without any key: `npm run ports:selftest`.

| port | framework | what you get |
|---|---|---|
| [`ports/agentkit/`](ports/agentkit/) | Coinbase AgentKit | a `customActionProvider` with `paper_trail_brief`, `paper_trail_verify`, `paper_trail_apply_agent_stage`, `paper_trail_mint`; the wallet is AgentKit's `EvmWalletProvider` |
| [`ports/game/`](ports/game/) | Virtuals GAME SDK | a `GameWorker` `paper_trail_collector` with the same four `GameFunction`s; the wallet is a viem `WalletClient` you hold |
| [`ports/openclaw/`](ports/openclaw/) | OpenClaw | a tool plugin with the same four tools, a `SKILL.md`, and the plugin manifest; needs Node ≥ 24.16 and was not typechecked against openclaw's own types (see its README) |

Each port reads every price, window, cap and address from the brief, the stage endpoint or the chain; refuses to
mint if the on-chain price differs from the brief; is a dry run unless told `execute`; and says in its result that
an acquisition in the AI Agents stage is recorded as operator-declared.

## It has been done

On 7 October 2026 this exact code minted in the AI Agents stage on Ethereum mainnet, run by RUTHVEN AI LIMITED as a
studio test: identity registered as ERC-8004 agent 52348
([tx](https://etherscan.io/tx/0x1909fc57e6963d96dcaf3b8447efbd67d9597505040a347d67425085b4e41248), gas only), then
PAPER TRAIL token 22 minted at 0.02 ETH
([tx](https://etherscan.io/tx/0xe24a7cf5b0e3222cec5d32b9929f01e22c82e7b78bf86a5c4b5182668dad6532)). A funded wallet,
two commands, about ten minutes:

```
AGENT_URI=https://your.site/agent.json npm run register-identity -- --execute
OPERATOR_NAME="Your Co" AGENT_NAME="your agent" ERC8004_AGENT_ID=<id> npm run stage -- --execute --quantity 1
```

## Rules the example keeps to

- The only genuine contract is `0x6eE9aaE76d422Bf4eC27449EB83245A79adAe105` on Ethereum mainnet.
  PAPER TRAIL exists on no other chain.
- Every number it uses comes from the brief JSON or the chain at run time; nothing is hard-coded except addresses.
- It never claims the agent chose on its own if an operator ran it. Say what happened.

MIT licence. Copyright in the artworks remains with MISS AL SIMPSON LIMITED.
