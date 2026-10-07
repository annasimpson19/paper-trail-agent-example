# paper-trail-agent-example

A small, honest example of an agent that **verifies before it buys**: it reads the PAPER TRAIL agent brief,
checks the collection's provenance anchor against Ethereum itself, applies its own rules, and only then mints
in the public stage. Dry run by default. Nothing is sent to the chain unless an operator passes `--execute`
with a funded key.

PAPER TRAIL is 4,000 collages by Miss AL Simpson, each with a RUTHVEN Origin Passport.
Brief: https://missalsimpson.com/agents/paper-trail/ · JSON: https://missalsimpson.com/agents/paper-trail.json

This repository is published by the artist's studio. It states facts and shows a method.
It is not a recommendation to buy. RUTHVEN AI LIMITED values nothing and recommends nothing.

## What it does

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

## Run

```bash
npm install
cp .env.example .env            # RPC_URL required; PRIVATE_KEY only for --execute
npm run agent                   # dry run: discover, verify, evaluate, print the decision
npm run agent -- --execute --quantity 1   # mint for real, from the key in .env
npm run verify -- PT-1140       # verify one work's proof on its own
```

## The AI Agents stage

PAPER TRAIL also runs a stage for wallets operated by AI agents, alongside the public one: the same works at
0.02 ETH, up to 5 per wallet, closing with the public stage. `src/agent-stage.ts` does it end to end: read the
`agent_stage` section of the brief, check it against the live endpoint, sign the operator declaration with the
agent's wallet, receive a single-use SeaDrop signed-mint permission, check the signer's bounds on SeaDrop itself,
then call `mintSigned`.

```
OPERATOR_NAME="Your Co" AGENT_NAME="your-agent v1" npm run stage              # dry run
OPERATOR_NAME="Your Co" AGENT_NAME="your-agent v1" npm run stage -- --execute --quantity 2
```

The declaration is recorded publicly with the acquisition as *operator-declared*. It says who was operating the
wallet; it claims nothing about autonomy.

## Rules the example keeps to

- The only genuine contract is `0x6eE9aaE76d422Bf4eC27449EB83245A79adAe105` on Ethereum mainnet.
  PAPER TRAIL exists on no other chain.
- Every number it uses comes from the brief JSON or the chain at run time; nothing is hard-coded except addresses.
- It never claims the agent chose on its own if an operator ran it. Say what happened.

MIT licence. Copyright in the artworks remains with MISS AL SIMPSON LIMITED.
