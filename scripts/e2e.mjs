// End-to-end and security checks, in a real browser against a production build.
//
//   npm run test:e2e                  build, start, run every check, stop
//   E2E_SKIP_BUILD=1 npm run test:e2e reuse the last e2e build
//   E2E_HEADED=1 npm run test:e2e     watch it run
//
// Safe to run next to `npm run dev`: it builds into .next/e2e, serves on its own
// port with an in-memory database and the demo wallet, and overrides every
// wallet and database setting from .env.local. It refuses to continue unless
// the server it started is in demo mode, so no real wallet is ever touched.
//
// Needs Google Chrome installed, or run `npx playwright install chromium` once.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const ADMIN_PASSWORD = `e2e-${randomBytes(12).toString("hex")}`;
const port = await new Promise((resolve) => {
  const s = createServer().listen(0, () => {
    const p = s.address().port;
    s.close(() => resolve(p));
  });
});
const BASE = `http://localhost:${port}`;
const env = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_DIST_DIR: ".next/e2e",
  PORT: String(port),
  APP_URL: BASE,
  // Demo everything; the empty values beat anything in .env.local.
  NWC_URL: "",
  TEST_HOSPITAL_NWC_URL: "",
  DATABASE_URL: "",
  RESEND_API_KEY: "",
  LIGHTNING_NETWORK: "demo",
  LOCAL_DB: "memory",
  SAMPLE_DATA: "true",
  ALLOW_LOCAL_DB: "true",
  ALLOW_DEMO_WALLET: "true",
  ADMIN_PASSWORD,
  SESSION_SECRET: randomBytes(32).toString("hex"),
  CRON_SECRET: randomBytes(16).toString("hex"),
};
const next = path.join("node_modules", ".bin", "next");
const run = (args, opts = {}) => spawn(next, args, { env, stdio: opts.stdio ?? "inherit" });

if (!process.env.E2E_SKIP_BUILD) {
  console.log("Building the app in demo mode (about a minute)…");
  // `next build` adds the e2e build folder to tsconfig.json; put it back as it was.
  const tsconfig = readFileSync("tsconfig.json", "utf8");
  const code = await new Promise((r) => run(["build"], { stdio: ["ignore", "ignore", "inherit"] }).on("exit", r));
  writeFileSync("tsconfig.json", tsconfig);
  if (code !== 0) {
    console.error("Build failed.");
    process.exit(1);
  }
}

const server = run(["start", "-p", String(port)], { stdio: ["ignore", "pipe", "pipe"] });
const serverLog = [];
for (const s of [server.stdout, server.stderr]) s.on("data", (d) => serverLog.push(String(d)));
const tmp = mkdtempSync(path.join(tmpdir(), "ireti-e2e-"));
let browser;
const stop = () => {
  server.kill();
  browser?.close().catch(() => {});
  rmSync(tmp, { recursive: true, force: true });
};
process.on("SIGINT", () => {
  stop();
  process.exit(130);
});

for (let i = 0; ; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {}
  if (i > 60) {
    console.error(`Server didn't start:\n${serverLog.join("")}`);
    stop();
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 500));
}
if (!(await (await fetch(BASE)).text()).includes("No real money moves")) {
  console.error("Refusing to run: the test server is not in demo mode.");
  stop();
  process.exit(1);
}

browser = await chromium
  .launch({ channel: "chrome", headless: !process.env.E2E_HEADED })
  .catch(() => chromium.launch({ headless: !process.env.E2E_HEADED }));

const results = [];
const errors = [];
let step = "";
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
async function session() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`[${step}] ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`[${step}] ${m.text()}`));
  return { ctx, page };
}
const go = (p, url) => p.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
const json = (body, ip) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...(ip ? { "x-real-ip": ip } : {}) },
  body: JSON.stringify(body),
});
async function adminSignIn(page) {
  await go(page, "/admin");
  await page.fill("#password", ADMIN_PASSWORD);
  await page.click("button:has-text('Sign in')");
  await page.waitForSelector("text=Approve hospital", { timeout: 10000 });
}

try {
  // ------------------------------------------------------------------ headers
  step = "headers";
  const home = await fetch(BASE);
  const csp = home.headers.get("content-security-policy") ?? "";
  check("CSP blocks framing, plugins and third-party scripts", csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'") && csp.includes("script-src 'self'"));
  check("HSTS is set", Boolean(home.headers.get("strict-transport-security")));
  check("X-Frame-Options is DENY", home.headers.get("x-frame-options") === "DENY");

  // --------------------------------------------------------- public API abuse
  step = "api";
  check("cron endpoint refuses without its secret", (await fetch(`${BASE}/api/cron/reserves`)).status === 401);
  check("cron endpoint refuses a wrong secret", (await fetch(`${BASE}/api/cron/reserves`, { headers: { authorization: "Bearer guess" } })).status === 401);
  check("donation lookup rejects a malformed hash", (await fetch(`${BASE}/api/donations/lookup?hash=' or 1=1--`)).status === 400);
  check("unknown file is 404", (await fetch(`${BASE}/api/files/does-not-exist`)).status === 404);
  check("negative donation refused", (await fetch(`${BASE}/api/campaigns/wanjiru-dialysis/donations`, json({ amountSats: -5 }, "10.9.0.1"))).status === 400);
  check("donation to an unknown campaign refused", (await fetch(`${BASE}/api/campaigns/no-such-campaign/donations`, json({ amountSats: 1000 }, "10.9.0.2"))).status === 404);
  // Behind a proxy, a client-made X-Forwarded-For entry comes first and the
  // proxy appends the real IP. Rotating the fake part must not reset the limit.
  let limited = false;
  for (let i = 0; i < 25 && !limited; i++) {
    const r = await fetch(`${BASE}/api/campaigns/wanjiru-dialysis/donations`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `9.9.9.${i}, 203.0.113.7` },
      body: JSON.stringify({ amountSats: 1000 }),
    });
    limited = r.status === 429;
  }
  check("rate limit holds when X-Forwarded-For is spoofed", limited);

  // ------------------------------------------------------------- registration
  step = "register";
  const hosp = await session();
  const reg = {
    name: "Korle Test Hospital", state: "Greater Accra", city: "Accra", address: "12 Guggisberg Ave",
    registrationNumber: "HeFRA-0001", registrationAuthority: "Health Facilities Regulatory Agency",
    phone: "302 123 456", contactName: "Kwame Mensah", role: "Head of billing", email: "billing@korle.test",
    accessCode: "korle-code-12345", accessCodeConfirm: "korle-code-12345", lightningAddress: "billing@wallet.test",
  };
  async function fillRegistration(page) {
    await go(page, "/hospital/register");
    await page.click("#country");
    await page.keyboard.type("Ghana");
    await page.keyboard.press("Enter");
    for (const [id, v] of Object.entries(reg)) await page.fill(`#${id}`, v);
    await page.click("button[role=checkbox]");
    await page.click("button[type=submit]");
  }
  await fillRegistration(hosp.page);
  await hosp.page.waitForSelector("text=Your hospital is now being reviewed", { timeout: 15000 });
  check("registering shows a confirmation and does not sign in", (await hosp.ctx.cookies()).every((c) => c.name !== "ireti_hospital"));
  await go(hosp.page, "/hospital");
  await hosp.page.fill("#email", reg.email);
  await hosp.page.fill("#code", reg.accessCode);
  await hosp.page.click("button:has-text('Sign in')");
  await hosp.page.waitForSelector("text=We're checking your hospital", { timeout: 15000 });
  check("the hospital signs in and follows the review", true);
  check("unverified hospital sees no bills or money", (await hosp.page.locator("text=Bills waiting for you").count()) === 0);

  const other = await session();
  await fillRegistration(other.page);
  await other.page.waitForSelector("text=This email already has an account", { timeout: 10000 });
  check("second registration with the same email refused", true);

  await go(other.page, "/hospital");
  await other.page.fill("#email", reg.email);
  await other.page.fill("#code", "wrong-code-123");
  await other.page.click("button:has-text('Sign in')");
  await other.page.waitForSelector("text=don't match", { timeout: 10000 });
  check("wrong access code refused", true);

  const sess = (await hosp.ctx.cookies()).find((c) => c.name === "ireti_hospital");
  const [body, mac] = sess.value.split(".");
  const forged = { ...JSON.parse(Buffer.from(body, "base64url").toString()), email: "billing@riverside.test" };
  await other.ctx.addCookies([{ ...sess, value: `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${mac}` }]);
  await go(other.page, "/hospital");
  check("forged session cookie is rejected", (await other.page.locator("#email").count()) === 1);
  await other.ctx.close();

  // -------------------------------------------------------------------- admin
  step = "admin";
  const admin = await session();
  await go(admin.page, "/admin");
  await admin.page.fill("#password", "wrong");
  await admin.page.click("button:has-text('Sign in')");
  await admin.page.waitForSelector("text=Wrong password", { timeout: 10000 });
  check("wrong admin password refused", true);
  await adminSignIn(admin.page);
  await admin.page
    .locator("li, article, div")
    .filter({ hasText: "Korle Test Hospital" })
    .filter({ has: admin.page.locator("button:has-text('Approve hospital')") })
    .last()
    .locator("button:has-text('Approve hospital')")
    .click();
  await hosp.page.waitForSelector("text=Bills waiting for you", { timeout: 20000 });
  check("approval reaches the hospital's open page without a refresh", true);

  // ----------------------------------------------------------------- campaign
  step = "start";
  const fam = await session();
  await go(fam.page, "/start");
  await fam.page.click("#hospitalId");
  await fam.page.keyboard.type("Korle");
  await fam.page.keyboard.press("Enter");
  for (const [id, v] of Object.entries({
    campaignerName: "Ama Owusu", campaignerEmail: "ama@example.com", billReference: "KTH/2026/0042",
    goalAmount: "15000", patientDisplayName: "Kofi", title: "Help Kofi with his surgery bill",
    story: "Kofi is seven and needs surgery on his heart. Our family has paid what we can and the hospital has given us a bill for the rest. <script>alert(1)</script>",
  })) await fam.page.fill(`#${id}`, v);
  await fam.page.click("button[role=checkbox]");
  await fam.page.click("button[type=submit]");
  await fam.page.waitForSelector("text=Save your private family link", { timeout: 15000 });
  const familyUrl = (await fam.page.locator("text=/\\/family\\//").first().textContent()).trim();
  check("family starts a campaign priced in cedis", familyUrl.includes("/family/"));

  step = "review";
  await hosp.page.waitForSelector("text=Help Kofi with his surgery bill", { timeout: 15000 });
  const bill = hosp.page
    .locator("article, li, section > div")
    .filter({ hasText: "KTH/2026/0042" })
    .filter({ has: hosp.page.locator("button:has-text('Approve')") })
    .last();
  check("approve stays disabled until the three checks are ticked", await bill.locator("button:has-text('Approve')").isDisabled());
  const boxes = bill.locator("button[role=checkbox]");
  for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).click();
  await bill.locator("button:has-text('Approve')").click();
  await hosp.page.waitForSelector("[data-sonner-toast]:has-text('Approved')", { timeout: 15000 });
  const slug = (await (await fetch(BASE)).text()).match(/\/c\/(help-kofi-with-his-surgery-bill-[0-9a-f]{6})/)?.[1];
  check("hospital approves the bill and the campaign goes public", Boolean(slug));

  // ------------------------------------------------------------------- donate
  step = "donate";
  const donor = await session();
  const watcher = await donor.ctx.newPage();
  await go(watcher, `/c/${slug}`);
  await go(donor.page, `/c/${slug}`);
  check("story is shown as text; its script doesn't run", (await donor.page.locator("text=<script>alert(1)</script>").count()) === 1);
  check("amounts are shown in Ghana cedis", (await donor.page.locator("text=/GH₵ ?[0-9]/").count()) > 0);
  await donor.page.locator("button:has-text('Give')").last().click();
  await donor.page.waitForSelector("text=Waiting for payment", { timeout: 15000 });
  check("payment request shows a countdown", (await donor.page.locator("text=/\\d{1,2}:\\d{2}/").count()) > 0);
  await donor.page.click("button:has-text('Simulate payment')");
  await donor.page.waitForSelector("text=/Thank you|Paid|received/i", { timeout: 20000 });
  check("donation is paid", true);
  await watcher.waitForSelector("text=/just now|minute/", { timeout: 15000 });
  check("another open tab shows the donation without a refresh", true);
  for (let i = 0; i < 3; i++) {
    const d = await (await fetch(`${BASE}/api/campaigns/${slug}/donations`, json({ amountSats: 20000, donorName: "Test donor" }, `10.0.0.${i}`))).json();
    await fetch(`${BASE}/api/donations/${d.id}/simulate`, { method: "POST" });
  }

  // ----------------------------------------------------------------- withdraw
  step = "withdraw";
  await go(hosp.page, "/hospital");
  await hosp.page
    .locator("form")
    .filter({ has: hosp.page.locator("input[name=idempotencyKey]") })
    .first()
    .locator("button:has-text('Withdraw all')")
    .click();
  await hosp.page.waitForSelector("[data-sonner-toast]:has-text('Sent.')", { timeout: 20000 });
  check("hospital withdraws the balance and sees a confirmation", true);
  await go(hosp.page, "/hospital");
  check("the withdrawal now waits for a receipt", (await hosp.page.locator("h2:has-text('Receipts to post')").count()) === 1);
  const again = hosp.page.locator("button:has-text('Withdraw all')");
  check("nothing is left to withdraw twice", (await again.count()) === 0 || (await again.first().isDisabled()));

  // ------------------------------------------------------------------ receipt
  step = "receipt";
  const fake = path.join(tmp, "receipt.png");
  writeFileSync(fake, "<html><script>alert(document.cookie)</script></html>");
  await hosp.page.setInputFiles("input[name=file]", fake);
  await hosp.page.click("button:has-text('Post receipt')");
  await hosp.page.waitForSelector("text=Use a JPG, PNG, WebP or PDF file", { timeout: 15000 });
  check("HTML disguised as .png is refused", true);
  const png = path.join(tmp, "receipt-real.png");
  writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
  await hosp.page.setInputFiles("input[name=file]", png);
  await hosp.page.click("button:has-text('Post receipt')");
  await hosp.page.waitForSelector("[data-sonner-toast]:has-text('Receipt posted')", { timeout: 15000 });
  check("a real receipt image is posted", true);

  await go(donor.page, `/c/${slug}`);
  check(
    "timeline shows the receipt as recent",
    (await donor.page.locator("text=Hospital posted a receipt").count()) > 0 &&
      (await donor.page.locator("time", { hasText: /just now|minute/ }).count()) > 0,
  );
  const fileHref = await donor.page.locator("a[href^='/api/files/']").first().getAttribute("href");
  const file = await fetch(`${BASE}${fileHref}`);
  check(
    "receipt is served as an image under a sandbox policy",
    file.headers.get("content-type") === "image/png" && (file.headers.get("content-security-policy") ?? "").includes("sandbox"),
  );

  // ------------------------------------------------------------------- family
  step = "family";
  await go(fam.page, new URL(familyUrl).pathname);
  await fam.page.click("button:has-text('Yes, it reached the bill')");
  await fam.page.waitForSelector("text=/confirmed/i", { timeout: 15000 });
  check("family confirms the payment reached the bill", true);
  const stranger = await session();
  await go(stranger.page, "/family/not-a-real-token");
  check("a made-up family link shows nothing private", (await stranger.page.locator("text=Yes, it reached the bill").count()) === 0);
  await stranger.ctx.close();

  // ------------------------------------------------------------------- freeze
  step = "freeze";
  await go(admin.page, "/admin");
  await admin.page.locator("tr").filter({ hasText: "Help Kofi" }).locator("button:has-text('Freeze')").click();
  await hosp.page.waitForSelector("text=/paused|locked/i", { timeout: 20000 });
  check("a frozen campaign stays visible to the hospital, locked", (await hosp.page.locator("text=Help Kofi").count()) > 0);
  await go(donor.page, `/c/${slug}`);
  check("donors can't give to a frozen campaign", (await donor.page.locator("button:has-text('Give')").count()) === 0);
  check("the API refuses donations to a frozen campaign", (await fetch(`${BASE}/api/campaigns/${slug}/donations`, json({ amountSats: 1000 }, "10.1.1.1"))).status === 404);
  await admin.page.locator("tr").filter({ hasText: "Help Kofi" }).locator("button:has-text('Unfreeze')").click();
  await admin.page.locator("tr").filter({ hasText: "Help Kofi" }).locator("button:has-text('Freeze')").waitFor();

  // ------------------------------------------------------------- transparency
  step = "transparency";
  await go(donor.page, "/transparency");
  await donor.page.waitForSelector("text=Help Kofi", { timeout: 15000 });
  check("transparency lists the campaign and the wallet covers what's owed", (await donor.page.locator("div.bg-indigo svg.lucide-check").count()) > 0);

  // ----------------------------------------------------------------- sign out
  step = "signout";
  await go(hosp.page, "/hospital");
  await hosp.page.click("button:has-text('Sign out')");
  await hosp.page.waitForSelector("#email", { timeout: 15000 });
  await go(hosp.page, "/hospital");
  check("a signed-out hospital sees the sign-in form", (await hosp.page.locator("#email").count()) === 1);

  // ------------------------------- decline, resubmit, new code signs others out
  step = "resubmit";
  const signInNorthgate = async () => {
    const s = await session();
    await go(s.page, "/hospital");
    await s.page.fill("#email", "finance@northgate.test");
    await s.page.fill("#code", "ireti-demo");
    await s.page.click("button:has-text('Sign in')");
    await s.page.waitForSelector("text=We're checking your hospital", { timeout: 15000 });
    return s;
  };
  const laptop = await signInNorthgate();
  const phone = await signInNorthgate();
  await go(admin.page, "/admin");
  const card = admin.page
    .locator("li, article, div")
    .filter({ hasText: "Northgate" })
    .filter({ has: admin.page.locator("button:has-text('Decline')") })
    .last();
  await card.locator("button:has-text('Decline')").click();
  await card.locator("textarea[name=reason]").fill("The phone number didn't answer.");
  await card.locator("button:has-text('Decline registration')").click();
  await phone.page.waitForSelector("text=Correct and resubmit", { timeout: 15000 });
  check("a declined hospital sees the reason and can resubmit", (await phone.page.locator("text=The phone number didn't answer.").count()) > 0);
  await phone.page.click("a:has-text('Correct and resubmit')");
  await phone.page.waitForSelector("text=Why it wasn't approved");
  check("the resubmit form is filled in with what they sent", (await phone.page.inputValue("#email")) === "finance@northgate.test");
  await phone.page.fill("#accessCode", "brand-new-code-2026");
  await phone.page.fill("#accessCodeConfirm", "brand-new-code-2026");
  await phone.page.click("button:has-text('Resubmit for review')");
  await phone.page.waitForSelector("text=We're checking your hospital", { timeout: 15000 });
  check("resubmitting puts the hospital back under review", true);
  await go(laptop.page, "/hospital");
  check("changing the access code signs out other devices", (await laptop.page.locator("#email").count()) === 1);
  await laptop.page.fill("#email", "finance@northgate.test");
  await laptop.page.fill("#code", "ireti-demo");
  await laptop.page.click("button:has-text('Sign in')");
  await laptop.page.waitForSelector("text=don't match", { timeout: 10000 });
  check("the old access code no longer works", true);
} catch (e) {
  check(`step "${step}" crashed`, false, e.message.split("\n")[0]);
}

const serverErrors = serverLog.join("").split("\n").filter((l) => /^\s*(Error|⨯)/.test(l));
check("no server errors", serverErrors.length === 0, serverErrors.slice(0, 3).join(" | "));
check("no browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
stop();
process.exit(passed === results.length ? 0 : 1);
