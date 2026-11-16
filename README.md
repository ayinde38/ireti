# Ireti

Medical fundraising for Nigeria. Donations go into a separate escrow per campaign, and only
the hospital that confirmed the bill can withdraw them. Every deposit and withdrawal is public,
provable and permanent.

Spec: the "Direct-to-Hospital Bitcoin Fundraising — Hackathon MVP Spec" doc.

## Review it

You need Node 22+. Docker is only needed for real (test-coin) payments.

**Quick look, no Docker:**

```bash
npm install
npm run dev            # http://localhost:3000
```

This uses a simulated wallet: the donate panel shows **Simulate payment**, so the whole loop runs in a
minute. Nothing is configured; the database is created and filled with sample data on first start.

**Real Lightning payments with free test coins (Mutinynet):**

```bash
npm install
npm run setup          # starts the test wallet in Docker and prints the one manual step
npm run dev
```

`npm run setup` runs Alby Hub on Mutinynet (a Bitcoin test network with free coins), creates Ireti's wallet
connection and writes `.env.local`. It then asks you to open a channel to the wallet from
https://faucet.mutinynet.com (GitHub sign-in, about a minute). Re-run `npm run setup` any time to check the
wallet; it prints "Ready" once it can receive. To donate, copy a campaign's payment request and pay it from
the faucet's Lightning box.

Logins for the sample data:

| Who | Where | Credentials |
| --- | --- | --- |
| Hospital | `/hospital` | `billing@harbourview.test` or `accounts@ibadanhills.test`, code `ireti-demo` |
| Admin | `/admin` | password `ireti-admin` (set `ADMIN_PASSWORD` in production) |
| Family | `/family/demo-family-emeka` | private link, also `-amara`, `-musa`, `-kemi` |

Other commands:

```bash
npm run test:ledger    # escrow and withdrawal checks against a throwaway database
npm run db:reset       # wipe the local database; it re-seeds on next start
docker compose -f infra/mutinynet/docker-compose.yml down      # stop the test wallet
docker compose -f infra/mutinynet/docker-compose.yml down -v   # stop it and delete it
```

Not covered by the test setup yet: hospital withdrawals on Mutinynet need the hospital's Lightning address
to be on Mutinynet too. Bank (naira) payouts are a demo stand-in, switched off with a real wallet. A Lightning
payout that can't be confirmed stays reserved and appears under "Payouts to check" on `/admin`.

## How it runs

- **Database:** without `DATABASE_URL`, PGlite (a full Postgres inside Node) in `.data/`. Set
  `DATABASE_URL` to use any hosted Postgres; migrations run on first connection either way.
- **Wallet:** any Nostr Wallet Connect wallet via `NWC_URL` (Alby Hub in the test setup). With none set,
  the simulated wallet. `LIGHTNING_NETWORK=mutinynet` shows a "Test network" bar and refuses real-money
  invoices; production refuses to start without a real wallet unless `ALLOW_DEMO_WALLET=true`.
- **Hosting later:** set `DATABASE_URL`, `NWC_URL`, `APP_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD`,
  `ADMIN_EMAIL` and `CRON_SECRET`, and call `/api/cron/reserves` hourly with
  `Authorization: Bearer $CRON_SECRET` (`vercel.ts` does this on Vercel).
  Add a hospital with `npm run hospital:add -- "Name" "City" "State" "pay@hospital.ng" "user@hospital.ng" "User Name" "access-code"`
  and verify it on `/admin`.

## Open-source SDKs used

| Job | Package |
| --- | --- |
| Donor pays from browser wallet, extension or NWC | `@getalby/bitcoin-connect-react` |
| Platform wallet: invoices, lookups, payouts, balance | `@getalby/sdk` (NWC client) |
| Pay the hospital's Lightning address | `@getalby/lightning-tools/lnurl` |
| Naira rate | `@getalby/lightning-tools/fiat` (note: `getFiatBtcRate` returns fiat per **sat**) |
| QR codes | `qrcode.react` |
| Database | `pg` (Postgres), `@electric-sql/pglite` (local, embedded) |

## Where things are

- `src/lib/campaigns.ts`: escrow balances, settling donations, withdrawals, receipts, reserves
- `src/lib/lightning/`: NWC and demo wallets behind one interface
- `src/lib/db.ts`: Postgres or embedded PGlite, migrations, local seeding
- `src/lib/store/`: the store contract and its SQL implementation
- `db/migrations/0001_init.sql`: schema plus triggers that make the ledger append-only
- `scripts/setup.ts`, `infra/mutinynet/`: the one-command test wallet
