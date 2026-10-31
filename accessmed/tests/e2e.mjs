// End-to-end test: loads the unpacked extension in Chromium and drives the demo portal.
// Usage: node tests/e2e.mjs   (needs `npm i playwright && npx playwright install chromium`)
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = createServer(async (req, res) => {
  try {
    res.setHeader("content-type", "text/html");
    res.end(await readFile(path.join(root, "demo", "patient-portal.html")));
  } catch { res.statusCode = 404; res.end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}/portal`;

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

const ctx = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
});
let [sw] = ctx.serviceWorkers();
sw ??= await ctx.waitForEvent("serviceworker");
const extId = sw.url().split("/")[2];

const page = await ctx.newPage();
await page.goto(url);
await page.waitForSelector("#accessmed-panic-fab");
await page.waitForTimeout(500);

// ---- Visual: auto-fixes ----
const labels = await page.$$eval(".bar .icon-btn", (els) => els.map((e) => e.getAttribute("aria-label")));
check("icon buttons get labels", JSON.stringify(labels) === JSON.stringify(["Search", "Notifications", "Messages", "Settings", "Sign out"]), JSON.stringify(labels));
check("settings div is keyboard reachable", await page.$eval(".fa-gear", (e) => e.tabIndex === 0 && e.getAttribute("role") === "button"));
check("img alt added", await page.$eval(".bar img", (e) => e.hasAttribute("alt")), await page.$eval(".bar img", (e) => JSON.stringify(e.alt)));
check("html lang set", !!(await page.$eval("html", (e) => e.lang)));
check("unlabeled input gets label", (await page.$eval("[name=visit_reason]", (e) => e.getAttribute("aria-label"))) === "Reason");
check("skip link added", !!(await page.$("#accessmed-skip")));
check("lab table headers promoted", (await page.$$eval('#labs [role=columnheader]', (e) => e.length)) === 4);

// Helper: send a message to the demo tab from the service worker.
const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({ url: u + "*" }))[0].id, url);
const msg = (m) => sw.evaluate(([id, m]) => chrome.tabs.sendMessage(id, m), [tabId, m]);
const setSetting = async (obj) => { await sw.evaluate((o) => chrome.storage.sync.set(o), obj); await page.waitForTimeout(300); };

// ---- Billing ----
const bill = await msg({ type: "PARSE_BILL" });
check("bill parsed from table", bill.found && bill.charges === 2835 && bill.insurance === 802.32 && bill.adjustments === 1583.75 && bill.owe === 448.93, JSON.stringify({ c: bill.charges, i: bill.insurance, a: bill.adjustments, o: bill.owe }));
check("bill line items", bill.items?.length === 4 && /Office visit/.test(bill.items[0].label), bill.items?.[0]?.label);

// ---- Cognitive: plain language ----
await setSetting({ plainLanguage: true });
const termCount = await page.$$eval(".accessmed-term", (e) => e.length);
const rxText = await page.$eval("#rx p", (e) => e.innerText);
check("plain language rewrites jargon", termCount > 10 && /high blood pressure/.test(rxText) && /by mouth/.test(rxText), rxText.slice(0, 90));
const esText = await page.$eval("#rx-es p", (e) => e.innerText);
check("plain language uses Spanish glossary on lang=es section", /presión arterial alta/.test(esText) && /por la boca/.test(esText) && /lo que usted debe/.test(esText), esText.slice(0, 90));
check("Spanish tooltip text", /Simplificado de/.test(await page.$eval("#rx-es .accessmed-term", (e) => e.getAttribute("aria-description"))));
await setSetting({ plainLanguageLang: "en" });
check("forcing English leaves Spanish terms alone", /hipertension/.test(await page.$eval("#rx-es p", (e) => e.innerText)) && /high blood pressure/.test(await page.$eval("#rx p", (e) => e.innerText)));
await setSetting({ plainLanguageLang: "auto" });
const bill2 = await msg({ type: "PARSE_BILL" });
check("bill still parses with plain language on", bill2.owe === 448.93 && bill2.adjustments === 1583.75);
await setSetting({ plainLanguage: false });
check("plain language reverts", (await page.$$eval(".accessmed-term", (e) => e.length)) === 0 && /hypertension/.test(await page.$eval("#rx p", (e) => e.innerText)));

// ---- Cognitive: AI summaries (headless Chromium has no on-device model) ----
await setSetting({ aiRewrite: true });
await page.waitForTimeout(500);
const aiStats = (await msg({ type: "GET_STATUS" })).ai;
const aiBoxes = await page.$$eval(".accessmed-ai-panel", (e) => e.length);
check("AI mode is safe without a model", aiStats && aiBoxes === aiStats.done && /hypertension/.test(await page.$eval("#rx p", (e) => e.innerText)), JSON.stringify(aiStats));
await setSetting({ aiRewrite: false });
check("AI mode off removes boxes and markers", (await page.$$eval(".accessmed-ai-panel, [data-accessmed-ai]", (e) => e.length)) === 0);

// ---- Motor: calendar keyboard nav ----
await page.focus("#cal td[data-date='2026-11-01']");
await page.keyboard.press("ArrowRight");
let focused = await page.evaluate(() => document.activeElement.dataset.date);
check("calendar ArrowRight moves one day", focused === "2026-11-02", focused);
await page.keyboard.press("ArrowDown");
focused = await page.evaluate(() => document.activeElement.dataset.date);
check("calendar ArrowDown moves one week", focused === "2026-11-09", focused);
await page.keyboard.press("Enter");
check("calendar Enter selects date", (await page.inputValue("[name=appt_date]")) === "11/09/2026");
check("exactly one typed-date fallback", (await page.$$(".accessmed-typed-date")).length === 1);
await page.fill(".accessmed-typed-date", "3/4/2027");
await page.press(".accessmed-typed-date", "Tab");
check("typed date fills readonly field", (await page.inputValue("[name=appt_date]")) === "03/04/2027");

// ---- Motor: hover-only menu ----
const trigger = page.locator("nav li:nth-child(2) > span");
await trigger.focus();
await page.keyboard.press("ArrowDown");
focused = await page.evaluate(() => document.activeElement.textContent);
check("menu opens with keyboard", focused === "Lab Results", focused);
await page.keyboard.press("Escape");
check("Escape closes menu", (await trigger.getAttribute("aria-expanded")) === "false");

// ---- Motor: timeout guard ----
check("page timeout timer detected (main world)", !!(await page.$eval("html", (e) => e.getAttribute("data-accessmed-timeout"))));
await page.evaluate(() => document.getElementById("timeout").classList.add("show")); // simulate the warning appearing
await page.waitForTimeout(800);
check("timeout dialog auto-dismissed via Stay signed in", !(await page.$eval("#timeout", (e) => e.classList.contains("show"))));

// ---- Visual: font scale + contrast ----
const before = await page.$eval("#messages p", (e) => parseFloat(getComputedStyle(e).fontSize));
await setSetting({ fontScale: 1.5, highContrast: true });
const after = await page.$eval("#messages p", (e) => parseFloat(getComputedStyle(e).fontSize));
check("font scale 150%", Math.abs(after - before * 1.5) < 0.6, `${before}px → ${after}px`);
check("high contrast applied", (await page.$eval("body", (e) => getComputedStyle(e).backgroundColor)) === "rgb(0, 0, 0)");
await page.screenshot({ path: "/tmp/am-e2e/portal-contrast.png" });
await setSetting({ fontScale: 1, highContrast: false });
check("font scale resets", Math.abs((await page.$eval("#messages p", (e) => parseFloat(getComputedStyle(e).fontSize))) - before) < 0.1);

// ---- Cognitive: reading ruler ----
await setSetting({ readingRuler: true });
await page.mouse.move(300, 400);
await page.waitForTimeout(100);
const rulerTop = await page.$eval(".accessmed-ruler", (e) => parseFloat(e.style.top));
check("reading ruler follows cursor", Math.abs(rulerTop - (400 - 22)) < 2, `top=${rulerTop}`);
await page.screenshot({ path: "/tmp/am-e2e/portal-ruler.png" });
await setSetting({ readingRuler: false });

// ---- Voice commands (same handler the microphone uses; recognition needs a real mic) ----
await page.evaluate(() => { location.hash = ""; window.scrollTo(0, 0); });
let said = await msg({ type: "VOICE_COMMAND", text: "Click messages" });
check("voice: click messages", (await page.evaluate(() => location.hash)) === "#messages", said);
await page.evaluate(() => window.scrollTo(0, 0));
said = await msg({ type: "VOICE_COMMAND", text: "scroll down" });
await page.waitForTimeout(800);
check("voice: scroll down", (await page.evaluate(() => scrollY)) > 100, said);
said = await msg({ type: "VOICE_COMMAND", text: "read prescription summary" });
check("voice: read prescription summary finds section", said === "Reading prescription summary", said);
said = await msg({ type: "VOICE_COMMAND", text: "bigger text" });
check("voice: bigger text", (await sw.evaluate(() => chrome.storage.sync.get("fontScale"))).fontScale === 1.25, said);
await setSetting({ fontScale: 1 });
said = await msg({ type: "VOICE_COMMAND", text: "make me a sandwich" });
check("voice: unknown command gets help prompt", /did not understand/.test(said));

// ---- Panic ----
await msg({ type: "PANIC" });
await page.waitForSelector("#accessmed-panic");
focused = await page.evaluate(() => document.activeElement.className);
check("panic dialog opens with call button focused", /accessmed-call/.test(focused));
check("panic call link uses tel:", (await page.$eval(".accessmed-call", (e) => e.getAttribute("href"))) === "tel:911");
await page.click("[data-action=bigger]");
await page.waitForTimeout(300);
await page.screenshot({ path: "/tmp/am-e2e/portal-panic.png" });
await page.keyboard.press("Escape");
check("Escape closes panic dialog", !(await page.$("#accessmed-panic")));

// ---- Popup bill tab render ----
await setSetting({ fontScale: 1, highContrast: false });
await ctx.storageState?.();
await sw.evaluate(() => chrome.storage.local.set({ lastTab: "tab-bill" }));
const popup = await ctx.newPage();
await popup.setViewportSize({ width: 380, height: 760 });
await popup.goto(`chrome-extension://${extId}/popup/popup.html?tabId=${tabId}`);
await popup.waitForSelector("#bill-result:not([hidden])", { timeout: 5000 }).catch(() => {});
const owe = await popup.$eval("#center-owe", (e) => e.textContent).catch(() => "");
const slices = await popup.$$eval("#donut path", (e) => e.length);
check("popup donut renders 3 slices", slices === 3, `${slices} slices, owe=${owe}`);
check("popup shows amount owed", owe === "$448.93");
await popup.screenshot({ path: "/tmp/am-e2e/popup-bill.png", fullPage: true });
await popup.click("#tab-cognitive");
check("popup plain-language preview", /what you owe/i.test(await popup.$eval("#tryOut", (e) => e.textContent)));
await popup.click("#tab-vision");
check("popup shows audit count", /Fixed \d+/.test(await popup.$eval("#audit-status", (e) => e.textContent)), await popup.$eval("#audit-status", (e) => e.textContent));

await ctx.close();
server.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
