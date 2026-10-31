// Run with: npm test
const test = require("node:test");
const assert = require("node:assert");
const ai = require("../content/ai-core.js");
const plain = require("../content/plain-language.js");

const RX = "Ibuprofen 400 mg PO TID PRN; NSAID contraindicated with anticoagulant therapy.";

test("accepts a faithful rewrite that expands TID to 3", () => {
  const r = ai.checkRewrite(RX, "Take Ibuprofen 400 mg by mouth 3 times a day when needed. Do not take it with blood thinners.");
  assert.deepEqual(r, { ok: true, reason: "" });
});

test("rejects a rewrite that drops or changes a dose", () => {
  assert.equal(ai.checkRewrite(RX, "Take Ibuprofen by mouth 3 times a day when needed.").ok, false);
  const changed = ai.checkRewrite(RX, "Take Ibuprofen 40 mg by mouth 3 times a day when needed.");
  assert.equal(changed.ok, false);
  assert.match(changed.reason, /400/);
});

test("rejects a rewrite that changes the dose unit", () => {
  assert.equal(ai.checkRewrite(RX, "Take Ibuprofen 400 mcg by mouth 3 times a day when needed.").ok, false);
});

test("accepts unit spelled out or as a synonym", () => {
  assert.equal(ai.checkRewrite("Take 1 tab of 10 mg daily.", "Take 1 tablet of 10 milligrams every day.").ok, true);
});

test("rejects a rewrite that adds a new number", () => {
  const r = ai.checkRewrite("Call the clinic if the swelling gets worse.", "Call the clinic within 2 days if the swelling gets worse.");
  assert.equal(r.ok, false);
  assert.match(r.reason, /new number 2/);
});

test("money with and without thousands separators is the same fact", () => {
  const original = "Contractual adjustment of $1,583.75 applied; patient responsibility $448.93.";
  assert.equal(ai.checkRewrite(original, "Your insurance deal took off 1583.75 dollars. You owe $448.93.").ok, true);
  assert.equal(ai.checkRewrite(original, "Your insurance deal took off $1,500. You owe $448.93.").ok, false);
});

test("dates must survive (leading zeros don't matter)", () => {
  const original = "Date of service 11/09/2026, claim pending adjudication.";
  assert.equal(ai.checkRewrite(original, "Visit on 11/9/2026. Insurance is still reviewing it.").ok, true);
  assert.equal(ai.checkRewrite(original, "Visit in November. Insurance is still reviewing it.").ok, false);
});

test("rejects empty, unchanged and overlong rewrites", () => {
  assert.equal(ai.checkRewrite(RX, "").reason, "empty");
  assert.equal(ai.checkRewrite(RX, `  ${RX} `).reason, "unchanged");
  assert.equal(ai.checkRewrite(RX, `${RX} `.repeat(4)).reason, "too-long");
});

test("allowed frequency numbers need the abbreviation in capitals", () => {
  // "tid" lowercase is not treated as a dosing abbreviation, so "3" is new.
  assert.equal(ai.checkRewrite("the tid bit of news", "the 3 bits of news").ok, false);
});

test("parseResponse reads JSON and tolerates plain text", () => {
  assert.equal(ai.parseResponse('{"rewrite":"  Take 1 pill. "}'), "Take 1 pill.");
  assert.equal(ai.parseResponse('"Take 1 pill."'), "Take 1 pill.");
  assert.equal(ai.parseResponse(null), "");
});

test("normalizeAvailability maps old spellings", () => {
  assert.equal(ai.normalizeAvailability("readily"), "available");
  assert.equal(ai.normalizeAvailability("after-download"), "downloadable");
  assert.equal(ai.normalizeAvailability("downloading"), "downloading");
  assert.equal(ai.normalizeAvailability(undefined), "unavailable");
});

test("every plain-language language has a prompt and UI strings", () => {
  for (const lang of Object.keys(plain.LANGUAGES)) {
    assert.ok(ai.systemPrompt(lang), `missing prompt: ${lang}`);
    const S = ai.STRINGS[lang];
    assert.ok(S && S.notice && S.read && S.hide && S.show && S.region && S.badge, `missing strings: ${lang}`);
    assert.ok(ai.userPrompt("x", lang).endsWith("x"));
  }
});
