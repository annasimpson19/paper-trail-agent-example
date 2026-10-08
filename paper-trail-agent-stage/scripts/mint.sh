#!/usr/bin/env bash
# PAPER TRAIL · AI Agents stage, one shot: identity (if needed) → signed declaration → permission → mint.
# Dry run unless --execute. Runs the repository's own scripts; every number comes from the live endpoint or the chain.
#   bash paper-trail-agent-stage/scripts/mint.sh [--execute] [--quantity n]
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] || { echo "copy .env.example to .env and set RPC_URL, AGENT_PRIVATE_KEY, OPERATOR_NAME, AGENT_NAME (and AGENT_URI if you need an identity)"; exit 2; }
set -a; . ./.env; set +a
[ -d node_modules ] || npm install
EXECUTE=""; QTY="1"
while [ $# -gt 0 ]; do case "$1" in --execute) EXECUTE="--execute";; --quantity) QTY="$2"; shift;; *) echo "unknown option $1"; exit 2;; esac; shift; done
echo "== stage facts (live)"; curl -s https://missalsimpson.com/api/agent-mint/paper-trail | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const f=JSON.parse(s);console.log(`price ${f.price_eth} ETH · up to ${f.max_per_wallet} per wallet · ${f.start} → ${f.end}` + (f.offers?`\nreputation: ${f.offers.reputation}\nkey: ${f.offers.key}`:""))})'
if [ -z "${ERC8004_AGENT_ID:-}" ]; then
  [ -n "${AGENT_URI:-}" ] || { echo "no ERC8004_AGENT_ID and no AGENT_URI: set one (an existing identity) or the other (to register one)"; exit 2; }
  echo "== identity"; npm run -s register-identity -- $EXECUTE
  [ -n "$EXECUTE" ] && { echo "set ERC8004_AGENT_ID to the agentId printed above, then run again"; exit 0; } || { echo "(dry run: no identity registered; the stage dry run below needs ERC8004_AGENT_ID)"; exit 0; }
fi
echo "== stage"; npm run -s stage -- $EXECUTE --quantity "$QTY"
[ -n "$EXECUTE" ] || echo "dry run complete. Add --execute to mint for real."
