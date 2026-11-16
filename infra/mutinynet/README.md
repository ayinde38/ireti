# Mutinynet test wallet

Alby Hub with its built-in Lightning node on Mutinynet, a Bitcoin test network with free coins.
Chain data comes from mutinynet.com, so it starts in about a minute with no chain download.

Don't start this by hand: `npm run setup` (from the repo root) starts it, sets up the node, creates
Ireti's wallet connection, connects to the faucet's node and writes `.env.local`.

- Dashboard: http://127.0.0.1:8081 (password `ireti-mutinynet-test`; test coins only, local port only)
- Stop: `docker compose -f infra/mutinynet/docker-compose.yml down`
- Delete the wallet: add `-v`, then re-run `npm run setup` for a fresh one

## Why a channel is needed

A Lightning wallet can only receive through a channel where the other side holds the coins. The faucet
opens one to you (capacity up to 1,000,000 sats) and can push part of it to your side so the wallet can
also pay out. Until then Alby Hub refuses invoices with "Failed to request inbound liquidity".
