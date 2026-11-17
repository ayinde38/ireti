# Ireti

Medical fundraising for hospital bills across Africa. Each hospital registers with its country, and its campaigns
are priced in that country's currency. Donations go into a separate escrow per campaign, and only
the hospital that confirmed the bill can withdraw them. Every deposit and withdrawal is public,
provable and permanent.


## Review it

You need Node 22+. Docker is only needed for real (test-coin) payments.

Pick **one** of the two ways below.

**Option A: quick look, no Docker:**

```bash
npm install
npm run dev            # then open http://localhost:3000
```

This uses a simulated wallet: the donate panel shows **Simulate payment**, so the whole loop runs in a
minute. Nothing is configured. The database is created empty on first start; you add the hospital and
campaign yourself (see "Try the full loop" below).

**Option B: real Lightning payments with free test coins (Mutinynet):**

```bash
npm install
npm run setup          # guided: explains each step and asks before it acts
npm run dev            # then open http://localhost:3000
```

Setup first stops whatever is running on port 3000 (usually an earlier `npm run dev`) and tells you which
process it stopped: the app has to restart there to pick up the new wallet settings, and setup may reset the
local database, which a running dev server holds open.

`npm run setup` takes about 3 minutes. It never opens your browser or signs in for you:
1. It shows what it will do and asks you to confirm, then frees port 3000.
2. It starts Alby Hub, a Lightning wallet, on Mutinynet (a Bitcoin test network with free coins) in Docker.
   Its dashboard is only reachable from your computer, at http://127.0.0.1:8081.
3. It creates two sub-wallets: Ireti's escrow, and a hospital test wallet that stands in for a hospital's own
   wallet. Both are saved to `.env.local`.
4. It gets a payment channel from the Mutinynet faucet, which needs a GitHub sign-in (any account; the faucet
   only reads your email). You choose how: type a one-time code it shows you at github.com/login/device, or
   open the channel yourself on faucet.mutinynet.com with the node key it prints.
5. It waits for the channel to confirm, then prints the balances and what to run next.

The channel is 200,000 sats, and 100,000 of them are yours to donate with. That is only a fifth of the faucet's
daily allowance of 1,000,000 sats per person, and plenty for testing.

Run `npm run setup` again any time: it reuses what exists and picks up where it stopped.

### Try the full loop

The app starts empty: no sample hospitals, campaigns or payments. Every sat on the ledger is one you
paid, so the proof of reserves on `/transparency` balances. Every open page updates by itself, in every
tab, so it helps to keep the hospital, admin and campaign pages open side by side.

1. **Register a hospital** at `/hospital/register`: pick any country (it sets the currency) and choose your
   own email and access code. A confirmation page appears; sign in at `/hospital` with that email and
   code to follow the review.
2. **Approve it** at `/admin` (password `ireti-admin` locally; set `ADMIN_PASSWORD` anywhere else).
3. **Start a campaign** at `/start` for that hospital. Keep the private family link it shows you.
4. **Confirm the bill** on `/hospital`: tick the three checks and approve. The campaign goes live.
5. **Donate** on the campaign page.
   - With `npm run setup`: copy the payment request and pay it from the wallet dashboard
     (http://127.0.0.1:8081, Send).
   - With plain `npm run dev`: use **Simulate payment**.

   The page confirms on its own.
6. **Withdraw** on `/hospital`. With `npm run setup`, choose "Hospital test wallet (Mutinynet)": Ireti asks it
   for an invoice for the exact amount, as it would a hospital's Lightning address, and pays it. The coins
   stay on your node.
7. **Post the receipt** on `/hospital`, then open the family link and confirm the payment reached the bill.

Other commands:

```bash
npm run test:ledger    # escrow and withdrawal checks against a throwaway database
npm run test:e2e       # the whole flow plus security checks in a real browser (~2 min, see below)
npm run db:reset       # wipe the local database; it starts empty again
docker compose -f infra/mutinynet/docker-compose.yml down      # stop the test wallet
docker compose -f infra/mutinynet/docker-compose.yml down -v   # stop it and delete it
```

The hospital test wallet exists only on the test network; on mainnet a hospital is paid only to its
verified Lightning address. Bank payouts in local currency are a demo stand-in, switched off with a real wallet. A Lightning
payout that can't be confirmed stays reserved and appears under "Payouts to check" on `/admin`.

## Known gaps (not working yet)

- **Email is not sent.** Without `RESEND_API_KEY`, messages (family link, "campaign is live", withdrawal notices)
  are only logged in the server console. The app says so where it matters: copy the family link when it's shown.
- **Bank payouts** are shown as "Coming soon" and can't be chosen (they're simulated only in the no-Docker demo).
- **Lightning addresses can't be checked on the test network**, so test payouts go to the hospital test wallet.
- **Hospital verification is manual**: the admin checks the licence and phone number outside the app, then approves.
- **One user per hospital**; no password reset yet.
- **Rates**: from yadio.io, falling back to Alby's rate API, then to a fixed snapshot (flagged "approximate").
- **What happens to leftover funds** if a patient dies or is discharged early is not decided yet.
- **Admin is one shared password**, with no second factor yet. Keep `ADMIN_PASSWORD` long and random.

## End-to-end tests

`npm run test:e2e` builds the app, starts it with sample data, an in-memory database and the demo wallet,
and drives it in Chrome. It's safe to run while `npm run dev` is running: it uses its own build folder and
port, and ignores the wallet and database in `.env.local`. It stops if the server isn't in demo mode, so
no real wallet is ever used.

It follows a new Ghanaian hospital through the whole flow:
- registration, review, and admin approval
- a family's campaign, bill confirmation, and a donation (seen live in a second tab)
- withdrawal, receipt, and the family's confirmation
- freeze, transparency, sign-out
- decline and resubmit

At each step it also tries what must be refused: forged cookies, wrong codes, duplicate emails, a
spoofed IP to dodge rate limits, an HTML file disguised as a receipt, a script in a campaign story,
donations to a frozen campaign, and the cron endpoint without its secret. It fails on any server or
browser error.

- `E2E_SKIP_BUILD=1` reuses the last build.
- `E2E_HEADED=1` shows the browser.
- It needs Google Chrome, or run `npx playwright install chromium` once.

## Security model

**Who can do what**

| Who | Proves it with | Can |
| --- | --- | --- |
| Donor | nothing | Create a payment request for a live campaign; see public pages. |
| Family | the secret link (only its SHA-256 is stored) | Confirm a payout reached the bill. |
| Hospital | email + access code (scrypt-hashed) | Under review: see its own status only. Verified: review its own bills, withdraw its own campaigns, post receipts. |
| Admin | `ADMIN_PASSWORD` | Approve/decline hospitals, freeze campaigns, resolve stuck payouts. |

Every server action checks the role and, for hospitals, that the campaign or withdrawal belongs to them.
Hiding a button is never the only protection.

**Money**
- A withdrawal is written to the ledger before the payment is attempted, and the database refuses any row
  that would take a campaign below zero (`withdrawals_guard`). Two simultaneous withdrawals can't both pay.
- Payouts go only to the address fixed at registration. A hospital can't change it while verified, and a
  resubmitted address must be checked again.
- A frozen campaign accepts no donations and allows no withdrawals.

**Sessions**: signed, httpOnly, SameSite=Lax cookies that last 8 hours. Changing the access code signs
out every other session. A tampered cookie is rejected. Server actions also check the request's origin
(Next.js does this), which protects against cross-site form posts.

**Brute force**
- Sign-in attempts are limited per IP and per account; admin sign-in also has an overall cap.
- A wrong email takes as long as a wrong code, so emails with accounts can't be found by timing.
- The IP used for limits is the one the hosting proxy saw (`X-Real-IP` or the last `X-Forwarded-For`
  entry), not one the client can make up.
- Limits are per server process. Put Vercel Firewall or Cloudflare rate limits in front for production.

**Uploads**: receipts are identified by their first bytes, not by the type the browser reports. Only
JPG, PNG, WebP and PDF are accepted. Receipts are served with `nosniff` and a policy that stops anything
inside them from running on our domain.

**Outbound requests**: Lightning addresses come from hospitals, so before the server contacts one, both the
address's domain and the invoice URL it returns must be `https` on a public IP. Localhost, private ranges
and cloud metadata are refused.

**Browser**
- Content-Security-Policy: no third-party scripts, no framing, forms post only to Ireti, no plugins.
- HSTS, `nosniff`, `X-Frame-Options: DENY`, and a strict referrer policy.
- User text (stories, names, notes) is always rendered as text, never as HTML.

**Production fails safe**
- Without `NWC_URL`, wallet calls fail rather than falling back to the demo wallet (unless `ALLOW_DEMO_WALLET=true`).
- Without `DATABASE_URL`, the server won't use a local database (unless `ALLOW_LOCAL_DB=true`).
- Without `ADMIN_PASSWORD`, admin sign-in is off; there is no default password.

## How it runs

- **Database:** without `DATABASE_URL`, PGlite (a full Postgres inside Node) in `.data/`. Set
  `DATABASE_URL` to use any hosted Postgres; migrations run on first connection either way.
- **Wallet:** any Nostr Wallet Connect wallet via `NWC_URL` (Alby Hub in the test setup). With none set,
  the simulated wallet. `LIGHTNING_NETWORK=mutinynet` shows a "Test network" bar and refuses real-money
  invoices; production refuses to start without a real wallet unless `ALLOW_DEMO_WALLET=true`.
- **Hosting later:** set `DATABASE_URL`, `NWC_URL`, `APP_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD`,
  `ADMIN_EMAIL` and `CRON_SECRET`, and call `/api/cron/reserves` hourly with
  `Authorization: Bearer $CRON_SECRET` (`vercel.ts` does this on Vercel).

## Open-source SDKs used

| Job | Package |
| --- | --- |
| Donor pays from browser wallet, extension or NWC | `@getalby/bitcoin-connect-react` |
| Platform wallet: invoices, lookups, payouts, balance | `@getalby/sdk` (NWC client) |
| Pay the hospital's Lightning address | `@getalby/lightning-tools/lnurl` |
| Exchange rates | yadio.io, with `@getalby/lightning-tools/fiat` as backup (`getFiatBtcRate` returns fiat per **sat**) |
| Inputs, selects, popovers | shadcn/ui on Radix (`src/components/ui/`), `react-number-format` for amounts |
| Live updates across tabs and users | `@tanstack/react-query` polling `/api/changes` |
| QR codes | `qrcode.react` |
| Database | `pg` (Postgres), `@electric-sql/pglite` (local, embedded) |

## Where things are

- `src/lib/campaigns.ts`: escrow balances, settling donations, withdrawals, receipts, reserves
- `src/lib/lightning/`: NWC and demo wallets behind one interface
- `src/lib/db.ts`: Postgres or embedded PGlite, migrations, local seeding
- `src/lib/store/`: the store contract and its SQL implementation
- `db/migrations/0001_init.sql`: schema plus triggers that make the ledger append-only
- `scripts/setup.ts`, `infra/mutinynet/`: the one-command test wallet
