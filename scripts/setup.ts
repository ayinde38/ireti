/**
 * One-command test setup: npm run setup
 *
 * Starts Alby Hub on Mutinynet in Docker, sets up its Lightning node, creates
 * the wallet connection Ireti uses, connects to the faucet's node and writes
 * .env.local. Safe to re-run: it reuses what exists and prints the status.
 * Without Docker, `npm run dev` still works in demo mode.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const HUB = "http://127.0.0.1:8081";
const PASSWORD = "ireti-mutinynet-test"; // matches infra/mutinynet/docker-compose.yml
const COMPOSE = "infra/mutinynet/docker-compose.yml";
const ENV_FILE = ".env.local";
const FAUCET_NODE = {
  pubkey: "02465ed5be53d04fde66c9418ff14a5f2267723810176c9212b722e542dc1afb1b",
  address: "45.79.52.207",
  port: 9735,
};

const step = (msg: string) => console.log(`\n▸ ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hub<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const res = await fetch(`${HUB}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Alby Hub ${path}: ${res.status} ${text}`);
  return (text ? JSON.parse(text) : {}) as T;
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
  // Drop settings from older wallet setups.
  for (const k of ["LNBITS_URL", "LNBITS_INVOICE_KEY", "LNBITS_ADMIN_KEY"]) env.delete(k);

  // A connection saved from a wallet that has since been wiped is useless.
  const apps = await hub<{ walletPubkey: string }[] | { apps: { walletPubkey: string }[] }>("/api/apps", { token });
  const walletKeys = new Set((Array.isArray(apps) ? apps : apps.apps).map((a) => a.walletPubkey));
  const saved = env.get("NWC_URL")?.match(/^nostr\+walletconnect:\/\/([0-9a-f]{64})/)?.[1];
  if (!saved || !walletKeys.has(saved)) env.delete("NWC_URL");

  if (!env.get("NWC_URL")) {
    step("Creating Ireti's wallet connection");
    const app = await hub<{ pairingUri: string }>("/api/apps", {
      token,
      body: {
        name: `Ireti escrow ${randomBytes(2).toString("hex")}`,
        budgetRenewal: "never",
        maxAmount: 0,
        scopes: ["make_invoice", "lookup_invoice", "pay_invoice", "get_balance", "get_info"],
        isolated: false,
      },
    });
    env.set("NWC_URL", app.pairingUri);
  }
  if (!env.get("APP_URL")) env.set("APP_URL", "http://localhost:3000");
  env.set("LIGHTNING_NETWORK", "mutinynet");
  if (!env.get("SESSION_SECRET")) env.set("SESSION_SECRET", randomBytes(36).toString("base64"));
  writeEnv(env);
  console.log(`Saved wallet settings to ${ENV_FILE}.`);

  step("Connecting to the Mutinynet faucet's node");
  await hub("/api/peers", { token, body: FAUCET_NODE }).catch(() => {}); // fine if already connected
  const { pubkey } = await hub<{ pubkey: string }>("/api/node/connection-info", { token });
  const channels = await hub<Channel[]>("/api/channels", { token });
  const active = channels.filter((c) => c.active);
  const inboundSats = Math.floor(active.reduce((s, c) => s + c.remoteBalance, 0) / 1000);

  console.log("\n────────────────────────────────────────────────────────────");
  if (active.length && inboundSats > 0) {
    console.log(`✓ Ready. ${active.length} channel(s), can receive about ${inboundSats.toLocaleString()} sats.`);
    console.log("\n  npm run dev   →  http://localhost:3000");
    console.log("  Donate on any campaign, copy the payment request, and pay it at");
    console.log("  https://faucet.mutinynet.com (\"Lightning\" box, GitHub sign-in).");
  } else {
    console.log(channels.length ? "⏳ A channel is opening. Re-run `npm run setup` in a minute or two." : "One step left: give the wallet a channel so it can receive payments.");
    if (!channels.length) {
      console.log("\n  1. Open https://faucet.mutinynet.com and sign in with GitHub.");
      console.log("  2. In \"Lightning channel\", paste this node's public key:\n");
      console.log(`     ${pubkey}\n`);
      console.log("     Capacity: 1,000,000 sats (the max). Push amount: 500,000 so the wallet can");
      console.log("     also pay out. Leave the host empty: this node is already connected to the faucet.");
      console.log("  3. Wait about a minute (Mutinynet makes a block every 30 seconds), then re-run");
      console.log("     `npm run setup` to confirm.");
    }
    console.log("\n  Meanwhile `npm run dev` works; invoices start once the channel is open.");
  }
  console.log(`\n  Wallet dashboard: ${HUB} (password: ${PASSWORD})`);
  console.log("────────────────────────────────────────────────────────────");
}

main().catch((e) => {
  console.error(`\nSetup failed: ${e.message}`);
  process.exit(1);
});
