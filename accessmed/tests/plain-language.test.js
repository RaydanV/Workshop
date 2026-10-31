// Run with: node --test tests/
const test = require("node:test");
const assert = require("node:assert");
const plain = require("../content/plain-language.js");
const billing = require("../content/billing-parser.js");

test("simplifies billing jargon", () => {
  assert.equal(plain.simplifyText("Patient responsibility: $40"), "What you owe: $40");
  assert.equal(
    plain.simplifyText("after your deductible and coinsurance"),
    "after your amount you pay before insurance starts paying and your share of the cost (a percent)"
  );
});

test("longest match wins", () => {
  assert.equal(plain.simplifyText("Explanation of Benefits"), "Insurance summary (not a bill)");
  assert.equal(plain.simplifyText("malignant hypertension"), "dangerously high blood pressure");
});

test("simplifies clinical terms and keeps sentence case", () => {
  assert.equal(plain.simplifyText("Hypertension noted."), "High blood pressure noted.");
  assert.equal(plain.simplifyText("Take 1 tab PO BID"), "Take 1 tab by mouth twice a day");
});

test("short abbreviations only match in capitals", () => {
  assert.equal(plain.simplifyText("bank statement status"), "bank statement status");
  assert.equal(plain.simplifyText("Come in STAT"), "Come in right away");
  assert.equal(plain.simplifyText("a pot of tea"), "a pot of tea");
});

test("findTerms reports positions", () => {
  const hits = plain.findTerms("Mild edema, afebrile.");
  assert.deepEqual(hits.map((h) => h.original), ["edema", "afebrile"]);
  assert.equal(hits[0].start, 5);
});

test("parseMoney handles accounting formats", () => {
  assert.equal(billing.parseMoney("$2,150.00"), 2150);
  assert.equal(billing.parseMoney("($118.40)"), 118.4);
  assert.equal(billing.parseMoney("-$5"), 5);
  assert.equal(billing.parseMoney("n/a"), null);
});

test("maps bill table columns", () => {
  const cols = billing.mapColumns(["Date of service", "Description", "Billed amount", "Contractual adjustment", "Insurance paid", "Patient responsibility"]);
  assert.deepEqual(cols, { description: 1, charges: 2, adjustments: 3, insurance: 4, owe: 5 });
});

test("Spanish glossary, keeping sentence case", () => {
  assert.equal(plain.simplifyText("Hipertensión controlada.", "es"), "Presión arterial alta controlada.");
  assert.equal(plain.simplifyText("Responsabilidad del paciente: $40", "es"), "Lo que usted debe: $40");
  assert.equal(plain.simplifyText("tomar 1 tableta VO BID", "es"), "tomar 1 tableta por la boca dos veces al día");
});

test("Spanish matches with or without accents", () => {
  assert.equal(plain.simplifyText("hipertension y sincope", "es"), "presión arterial alta y desmayo");
});

test("Spanish word boundaries handle accented letters", () => {
  // "renal" must not match inside a longer word such as "suprarrenales".
  assert.equal(plain.simplifyText("glándulas suprarrenales", "es"), "glándulas suprarrenales");
  assert.equal(plain.simplifyText("función renal", "es"), "función de los riñones");
});

test("Spanish longest match wins and abbreviations need capitals", () => {
  assert.equal(plain.simplifyText("hipertensión maligna", "es"), "presión arterial peligrosamente alta");
  assert.equal(plain.simplifyText("yo vo a ir", "es"), "yo vo a ir");
});

test("language resolution", () => {
  assert.equal(plain.resolveLanguage("es-MX"), "es");
  assert.equal(plain.resolveLanguage("EN_us"), "en");
  assert.equal(plain.resolveLanguage("fr"), null);
  assert.equal(plain.resolveLanguage(""), null);
  // No language or an unknown one falls back to English for the string API.
  assert.equal(plain.simplifyText("Hypertension"), "High blood pressure");
  assert.equal(plain.simplifyText("Hypertension", "fr"), "High blood pressure");
});

test("every language has the same UI strings", () => {
  for (const [code, l] of Object.entries(plain.LANGUAGES)) {
    assert.ok(l.name && l.glossary && l.caseSensitive, code);
    assert.equal(typeof l.original("x"), "string");
    assert.equal(typeof l.simplifiedFrom("x"), "string");
    for (const k of Object.keys(l.glossary)) assert.equal(k, k.toLowerCase(), `${code}: key not lowercase: ${k}`);
  }
});
