/**
 * One-command test setup: npm run setup
 *
 * Starts Alby Hub on Mutinynet in Docker, creates Ireti's escrow and the
 * hospital test wallet, writes .env.local, gets a channel from the Mutinynet
 * faucet (one GitHub approval), then starts the app and opens it. Safe to
 * re-run: it reuses what exists. `--no-start` stops before starting the app.
 * Without Docker, `npm run dev` still works in demo mode.
 */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const HUB = "http://127.0.0.1:8081";
const PASSWORD = "ireti-mutinynet-test"; // matches infra/mutinynet/docker-compose.yml
const COMPOSE = "infra/mutinynet/docker-compose.yml";
const ENV_FILE = ".env.local";
const LOCAL_DB = ".data/ireti-db";
const FAUCET = "https://faucet.mutinynet.com";
/** Small on purpose: plenty for testing, and only a fifth of the faucet's daily allowance. */
const CHANNEL = { capacity: 200_000, push: 100_000 };
const FAUCET_NODE = {
  pubkey: "02465ed5be53d04fde66c9418ff14a5f2267723810176c9212b722e542dc1afb1b",
  address: "45.79.52.207",
  port: 9735,
};

const step = (msg: string) => console.log(`\n▸ ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hub<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let res: Response;
  // Alby Hub rate-limits its API; back off and retry when it says so.
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${HUB}${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    if (res.status !== 429 || attempt === 6) break;
    await sleep(2000 * 2 ** Math.min(attempt, 3));
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Alby Hub ${path}: ${res.status} ${text}`);
  return (text ? JSON.parse(text) : {}) as T;
}

function createApp(token: string, name: string, scopes: string[]) {
  return hub<{ pairingUri: string }>("/api/apps", {
    token,
    body: { name: `${name} ${randomBytes(2).toString("hex")}`, budgetRenewal: "never", maxAmount: 0, scopes, isolated: true },
  });
}

async function waitFor(what: string, check: () => Promise<boolean>, seconds: number) {
  for (let i = 0; i < seconds; i += 2) {
    if (await check().catch(() => false)) return;
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for ${what}. Check: docker compose -f ${COMPOSE} logs`);
}

function readEnv(): Map<string, string> {
  const env = new Map<string, string>();
  if (!existsSync(ENV_FILE)) return env;
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env.set(m[1], m[2]);
  }
  return env;
}

function writeEnv(env: Map<string, string>) {
  const lines = ["# Written by `npm run setup`: Alby Hub on Mutinynet (test coins only)."];
  for (const [k, v] of env) lines.push(`${k}=${v}`);
  writeFileSync(ENV_FILE, lines.join("\n") + "\n");
}

interface Info {
  setupCompleted: boolean;
  running: boolean;
  network: string;
  startupError: string;
}
interface App {
  name: string;
  appPubkey: string;
  walletPubkey: string;
  isolated: boolean;
  balance: number;
}
interface Channel {
  active: boolean;
  localBalance: number;
  remoteBalance: number;
}

async function main() {
  step("Checking Docker");
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
  } catch {
    console.log("Docker isn't running. Start Docker Desktop and re-run `npm run setup`.");
    console.log("(Or skip real payments: `npm run dev` runs a demo with a simulated wallet.)");
    process.exit(1);
  }

  step("Starting Alby Hub on Mutinynet");
  execFileSync("docker", ["compose", "-f", COMPOSE, "up", "-d"], { stdio: "inherit" });
  await waitFor("Alby Hub to start", async () => (await fetch(`${HUB}/api/info`)).ok, 120);

  let info = await hub<Info>("/api/info");
  if (!info.setupCompleted) {
    step("Creating the Lightning node (first run only)");
    await hub("/api/setup", { body: { unlockPassword: PASSWORD, backendType: "LDK" } });
    await hub("/api/start", { body: { unlockPassword: PASSWORD } });
  }
  await waitFor("the node to come online", async () => (await hub<Info>("/api/info")).running, 180);
  info = await hub<Info>("/api/info");
  if (info.network !== "signet") throw new Error(`Alby Hub is on "${info.network}", expected Mutinynet (signet).`);

  const { token } = await hub<{ token: string }>("/api/unlock", {
    body: { unlockPassword: PASSWORD, permission: "full" },
  });

  const env = readEnv();

  // Ireti's escrow and the stand-in hospital wallet are isolated sub-wallets:
  // each sees only its own balance, so the escrow balance is exactly what
  // donors paid and the reserves check balances to the sat. A saved
  // connection that is missing (wallet wiped) or not isolated is replaced.
  const listed = await hub<App[] | { apps: App[] }>("/api/apps", { token });
  const apps = Array.isArray(listed) ? listed : listed.apps;
  const keyOf = (url?: string) => url?.match(/^nostr\+walletconnect:\/\/([0-9a-f]{64})/)?.[1];
  const valid = (url?: string) => apps.some((a) => a.walletPubkey === keyOf(url) && a.isolated);
  const needEscrow = !valid(env.get("NWC_URL"));
  const needHospital = !valid(env.get("TEST_HOSPITAL_NWC_URL"));

  // A new escrow starts with an empty ledger: payments recorded against the
  // simulated or a previous wallet aren't in it and would show as a reserves
  // shortfall. The local database is reset, which can't happen under a
  // running dev server (it holds the database open).
  const resetDb = needEscrow && existsSync(LOCAL_DB);
  if (resetDb && (await fetch(env.get("APP_URL") ?? "http://localhost:3000", { signal: AbortSignal.timeout(1500) }).then(() => true, () => false))) {
    console.log("\nStop `npm run dev` first: setup needs to reset the local database for the new escrow wallet.");
    process.exit(1);
  }

  if (needEscrow) {
    step("Creating Ireti's escrow wallet");
    env.set("NWC_URL", (await createApp(token, "Ireti escrow", ["make_invoice", "lookup_invoice", "pay_invoice", "get_balance", "get_info"])).pairingUri);
    // An older escrow connection had access to the whole node: remove it.
    for (const a of apps) {
      if (a.name.startsWith("Ireti escrow") && !a.isolated) await hub(`/api/apps/${a.appPubkey}`, { method: "DELETE", token });
    }
  }
  if (needHospital) {
    step("Creating the hospital test wallet");
    env.set("TEST_HOSPITAL_NWC_URL", (await createApp(token, "Hospital test wallet", ["make_invoice", "lookup_invoice", "get_balance", "pay_invoice", "list_transactions", "get_info"])).pairingUri);
  }
  if (!env.get("APP_URL")) env.set("APP_URL", "http://localhost:3000");
  env.set("LIGHTNING_NETWORK", "mutinynet");
  if (!env.get("SESSION_SECRET")) env.set("SESSION_SECRET", randomBytes(36).toString("base64"));
  writeEnv(env);
  console.log(`Saved wallet settings to ${ENV_FILE}.`);
  if (resetDb) {
    rmSync(LOCAL_DB, { recursive: true, force: true });
    console.log("Reset the local database for the new escrow wallet.");
  }

  step("Connecting to the Mutinynet faucet's node");
  await hub("/api/peers", { token, body: FAUCET_NODE }).catch(() => {}); // fine if already connected
  const { pubkey } = await hub<{ pubkey: string }>("/api/node/connection-info", { token });
  const channels = () => hub<Channel[]>("/api/channels", { token });
  const ready = (cs: Channel[]) => cs.some((c) => c.active && c.remoteBalance > 0);

  if (!ready(await channels())) {
    if (!(await channels()).length) {
      step("Opening a channel from the faucet (free test coins)");
      try {
        await openFaucetChannel(pubkey);
      } catch (e) {
        manualChannelSteps(pubkey, (e as Error).message);
        process.exit(1);
      }
    }
    step("Waiting for the channel to confirm (Mutinynet makes a block every 30 seconds)");
    await waitFor("the channel to open", async () => ready(await channels()), 15 * 60);
  }

  const apps2 = await hub<App[] | { apps: App[] }>("/api/apps", { token });
  const balanceOf = (url?: string) =>
    ((Array.isArray(apps2) ? apps2 : apps2.apps).find((a) => a.walletPubkey === keyOf(url))?.balance ?? 0) / 1000;
  const cs = await channels();
  const spendable = Math.floor(cs.reduce((s, c) => s + c.localBalance, 0) / 1000);
  const inbound = Math.floor(cs.reduce((s, c) => s + c.remoteBalance, 0) / 1000);

  console.log("\n────────────────────────────────────────────────────────────");
  console.log("✓ Ready: real Lightning payments with test coins.");
  console.log(`  Node: ${spendable.toLocaleString()} test sats to donate with, room to receive ${inbound.toLocaleString()} more.`);
  console.log(`  Escrow wallet: ${balanceOf(env.get("NWC_URL")).toLocaleString()} sats · Hospital test wallet: ${balanceOf(env.get("TEST_HOSPITAL_NWC_URL")).toLocaleString()} sats`);
  console.log(`  Wallet dashboard: ${HUB} (password: ${PASSWORD})`);
  console.log("  To donate: copy a campaign's payment request, then in the dashboard choose Send and paste it.");
  console.log("────────────────────────────────────────────────────────────");

  if (process.argv.includes("--no-start")) return;
  await startApp(env.get("APP_URL") ?? "http://localhost:3000");
}

/**
 * The faucet funds a channel to this node after a GitHub sign-in. Uses
 * GitHub's device flow, so the reviewer only types a short code on github.com.
 * Only the channel's capacity counts toward the faucet's daily 1,000,000-sat
 * allowance; the pushed sats (the reviewer's spending money) don't.
 */
async function openFaucetChannel(pubkey: string) {
  const { client_id } = (await (await fetch(`${FAUCET}/auth/github/client_id`)).json()) as { client_id: string };
  const gh = async <T,>(url: string, body: Record<string, string>) =>
    (await (
      await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body),
      })
    ).json()) as T;

  const device = await gh<{ device_code: string; user_code: string; verification_uri: string; interval: number }>(
    "https://github.com/login/device/code",
    { client_id, scope: "user:email" },
  );
  if (!device.user_code) throw new Error("GitHub didn't start the sign-in");
  console.log(`\n  The faucet needs a GitHub sign-in (any account; it only reads your email).`);
  console.log(`  Opening ${device.verification_uri}: enter this code and approve:\n`);
  console.log(`      ${device.user_code}\n`);
  openBrowser(device.verification_uri);

  let interval = device.interval || 5;
  let githubToken = "";
  for (;;) {
    await sleep(interval * 1000);
    const r = await gh<{ access_token?: string; error?: string }>("https://github.com/login/oauth/access_token", {
      client_id,
      device_code: device.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    if (r.access_token) {
      githubToken = r.access_token;
      break;
    }
    if (r.error === "slow_down") interval += 5;
    else if (r.error !== "authorization_pending") throw new Error(`GitHub sign-in ${r.error ?? "failed"}`);
  }

  const login = await fetch(`${FAUCET}/auth/github/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: githubToken }),
  });
  if (!login.ok) throw new Error(`faucet sign-in failed (${login.status})`);
  const { token } = (await login.json()) as { token: string };

  const res = await fetch(`${FAUCET}/api/channel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ capacity: CHANNEL.capacity, push_amount: CHANNEL.push, pubkey }),
  });
  if (!res.ok) throw new Error(`faucet refused the channel: ${(await res.text()) || res.status}`);
  console.log(
    `  ✓ Channel requested: ${CHANNEL.capacity.toLocaleString()} sats, ${CHANNEL.push.toLocaleString()} of them yours to donate with.`,
  );
}

function manualChannelSteps(pubkey: string, why: string) {
  console.log(`\nCouldn't open the channel automatically (${why}). Do it by hand instead:`);
  console.log(`  1. Open ${FAUCET} and sign in with GitHub.`);
  console.log(`  2. In "Lightning channel", paste this node's public key:\n\n     ${pubkey}\n`);
  console.log(`     Capacity ${CHANNEL.capacity.toLocaleString()}, push amount ${CHANNEL.push.toLocaleString()}. Leave the host empty.`);
  console.log("  3. Re-run `npm run setup`. It waits for the channel and starts the app.");
}

function openBrowser(url: string) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

/** Runs `npm run dev` (unless it's already running) and opens the app. */
async function startApp(url: string) {
  const up = () => fetch(url, { signal: AbortSignal.timeout(1500) }).then(() => true, () => false);
  if (await up()) {
    console.log(`\nThe app is already running: ${url}`);
    openBrowser(url);
    return;
  }
  step(`Starting the app at ${url} (Ctrl+C stops it)`);
  const dev = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev"], { stdio: "inherit" });
  process.on("SIGINT", () => dev.kill("SIGINT"));
  await waitFor("the app to start", up, 120);
  openBrowser(url);
  await new Promise((r) => dev.on("exit", r));
}

main().catch((e) => {
  console.error(`\nSetup failed: ${e.message}`);
  process.exit(1);
});
