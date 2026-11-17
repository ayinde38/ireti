/**
 * Guided test setup: npm run setup
 *
 * Starts Alby Hub on Mutinynet in Docker, creates Ireti's escrow and the
 * hospital test wallet, writes .env.local and gets a channel from the Mutinynet
 * faucet. It explains each step and asks before it acts; it never opens a
 * browser or signs in for you. When it's done it tells you what to run next.
 * Safe to re-run: it reuses what exists. `--yes` skips the first confirmation.
 * Without Docker, `npm run dev` still works in demo mode.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

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
const interactive = Boolean(process.stdin.isTTY) && !process.argv.includes("--yes");

/** Asks a question on the terminal; without a terminal (or with --yes) the default is used. */
async function ask(question: string, fallback: string): Promise<string> {
  if (!interactive) return fallback;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim() || fallback;
  } catch {
    // Ctrl+C or Ctrl+D at a question: stop cleanly.
    console.log("\nCancelled. Run `npm run setup` again any time; it picks up where it stopped.");
    process.exit(0);
  } finally {
    rl.close();
  }
}

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

const appUrl = () => readEnv().get("APP_URL") ?? "http://localhost:3000";
const appPort = () => Number(new URL(appUrl()).port || 80);

/**
 * Why we stop whatever is on the app's port (3000 unless APP_URL says otherwise):
 * - Setup can reset the local database, which a running dev server holds open.
 * - A dev server started before setup keeps the old wallet settings; .env.local is
 *   only read when the app starts.
 * - If the port stays taken, `npm run dev` quietly moves to 3001 while APP_URL,
 *   payment links and the browser still point at 3000, so you'd test the wrong app.
 * The plan shown at the start says this will happen, and asks before going on.
 */
async function freeAppPort() {
  const port = appPort();
  let pids: number[] = [];
  try {
    if (process.platform === "win32") {
      const out = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
      pids = out
        .split("\n")
        .filter((l) => /LISTENING/.test(l) && l.trim().split(/\s+/)[1]?.endsWith(`:${port}`))
        .map((l) => Number(l.trim().split(/\s+/).at(-1)));
    } else {
      // -t: PIDs only; exits non-zero when nothing listens on the port.
      pids = execFileSync("lsof", ["-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" })
        .split("\n")
        .filter(Boolean)
        .map(Number);
    }
  } catch {
    return; // nothing is listening
  }
  pids = [...new Set(pids)].filter((pid) => pid > 0 && pid !== process.pid);
  if (!pids.length) return;
  step(`Stopping what is running on port ${port}`);
  for (const pid of pids) {
    let name = "";
    try {
      if (process.platform !== "win32") {
        // e.g. "node /path/to/next dev" -> "node next dev", so you can tell what it is.
        const cmd = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" }).trim();
        name = cmd.split(/\s+/).map((part) => part.split("/").at(-1)).join(" ").slice(0, 70);
      }
    } catch {}
    console.log(`  Stopping process ${pid}${name ? ` (${name})` : ""}`);
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  // Give it a moment to shut down and release the database before going on.
  const listening = () => fetch(appUrl(), { signal: AbortSignal.timeout(1000) }).then(() => true, () => false);
  for (let i = 0; i < 20 && (await listening()); i++) await sleep(500);
  if (await listening()) console.log(`  Port ${port} is still busy. Stop that app yourself, then run \`npm run setup\` again.`);
}

/**
 * What an earlier run already did, so a re-run can say so instead of repeating
 * the first-run plan. Read-only and best effort: if the wallet isn't running,
 * it only reports what .env.local shows.
 */
async function progress(): Promise<{ wallets: boolean; channel: "none" | "pending" | "ready" | "unknown" }> {
  const env = readEnv();
  const wallets = Boolean(env.get("NWC_URL")?.startsWith("nostr+walletconnect://") && env.get("TEST_HOSPITAL_NWC_URL"));
  if (!wallets) return { wallets, channel: "unknown" };
  try {
    const info = await fetch(`${HUB}/api/info`, { signal: AbortSignal.timeout(1500) }).then((r) => r.json() as Promise<Info>);
    if (!info.running) return { wallets, channel: "unknown" };
    const { token } = await hub<{ token: string }>("/api/unlock", { body: { unlockPassword: PASSWORD, permission: "full" } });
    const cs = await hub<Channel[]>("/api/channels", { token });
    if (cs.some((c) => c.active && c.remoteBalance > 0)) return { wallets, channel: "ready" };
    return { wallets, channel: cs.length ? "pending" : "none" };
  } catch {
    return { wallets, channel: "unknown" };
  }
}

async function main() {
  const done = await progress();
  if (done.wallets) {
    const next = {
      ready: "Everything is already set up. This run checks it and prints the balances.",
      pending: "Your test channel has been opened and is waiting to confirm. This run waits for it\n  (usually 1 to 3 minutes), then prints the balances.",
      none: "There is no test channel yet. This run helps you get one from the faucet.",
      unknown: "This run starts Alby Hub if needed, then checks the test channel.",
    }[done.channel];
    console.log(`
Ireti test setup (Mutinynet: test coins with no value)

Picking up where you left off. Already done: Alby Hub and its two wallets
(saved in ${ENV_FILE}).
  ${next}

First it stops whatever is running on port ${appPort()} (usually \`npm run dev\`), so the app
restarts with these settings. Nothing opens in your browser.`);
  } else {
    console.log(`
Ireti test setup (Mutinynet: test coins with no value)

This will:
  0. Stop whatever is running on port ${appPort()} (usually an earlier \`npm run dev\`), so the
     app can restart there with the new wallet settings.
  1. Start Alby Hub, a Lightning wallet, in Docker. Its dashboard is only reachable
     from this computer, at ${HUB}.
  2. Create two wallets inside it: Ireti's escrow, and a test wallet that stands in
     for a hospital. Their connection strings are saved to ${ENV_FILE}.
  3. Get a 200,000-sat test channel from the Mutinynet faucet. The faucet needs a
     GitHub sign-in, which you do yourself; you'll be shown how.
Nothing opens in your browser, and nothing is sent anywhere except the faucet.`);
  }
  const go = (await ask("\nContinue? [Y/n] ", "y")).toLowerCase();
  if (go.startsWith("n")) {
    console.log("Nothing was changed. (For a quick look without Docker: `npm run dev`.)");
    return;
  }

  await freeAppPort();

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
    console.log(`\nAn app is running at ${env.get("APP_URL") ?? "http://localhost:3000"}.`);
    console.log("Setup needs to reset the local database for the new escrow wallet, which it can't do while the app runs.");
    console.log("Stop it (Ctrl+C in the terminal running `npm run dev`), then run `npm run setup` again. It picks up where it stopped.");
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
      step("Getting a test channel from the Mutinynet faucet");
      console.log(`
  The faucet gives free test coins to anyone who signs in with GitHub (any account;
  it only reads your email). Choose how:
    1  Sign in with a one-time code. You open github.com yourself and type the code
       shown here; setup then asks the faucet for the channel.
    2  Do it yourself on the faucet's website, using this node's public key.`);
      const how = await ask("\n  Choose 1 or 2 [1]: ", "1");
      if (how === "2") {
        manualChannelSteps(pubkey);
        return;
      }
      try {
        await openFaucetChannel(pubkey);
      } catch (e) {
        console.log(`\n  That didn't work (${(e as Error).message}).`);
        manualChannelSteps(pubkey);
        process.exit(1);
      }
    }
    step("Waiting for the channel to confirm (Mutinynet makes a block every 30 seconds; usually 1 to 3 minutes)");
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
  console.log(`
Next:
  1. Start the app:   npm run dev
  2. Open it:         ${env.get("APP_URL") ?? "http://localhost:3000"}
  3. Follow "Try the full loop" in the README. The admin password is ireti-admin.`);
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
  console.log(`\n  1. In your browser, open:  ${device.verification_uri}`);
  console.log(`  2. Enter this code:        ${device.user_code}`);
  console.log(`  3. Approve the "Mutinynet Faucet" app.`);
  console.log(`\n  Waiting for your approval (the code expires in about 15 minutes; Ctrl+C cancels)…`);

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

function manualChannelSteps(pubkey: string) {
  console.log(`\n  Open the channel on the faucet's website:`);
  console.log(`    1. Open ${FAUCET} and sign in with GitHub.`);
  console.log(`    2. In "Lightning channel", paste this node's public key:\n\n       ${pubkey}\n`);
  console.log(`       Capacity ${CHANNEL.capacity.toLocaleString()}, push amount ${CHANNEL.push.toLocaleString()}. Leave the host empty.`);
  console.log("    3. Run `npm run setup` again. It waits for the channel to confirm and finishes.");
}

main().catch((e) => {
  console.error(`\nSetup failed: ${e.message}`);
  process.exit(1);
});
