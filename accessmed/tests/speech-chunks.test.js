// Run with: npm test
const test = require("node:test");
const assert = require("node:assert");
const { splitIntoChunks } = require("../content/speech-chunks.js");

test("empty or whitespace-only text gives no chunks", () => {
  assert.deepEqual(splitIntoChunks(""), []);
  assert.deepEqual(splitIntoChunks("   \n\n  "), []);
  assert.deepEqual(splitIntoChunks(undefined), []);
});

test("one short sentence stays one chunk", () => {
  assert.deepEqual(splitIntoChunks("Text larger"), ["Text larger"]);
});

test("splits sentences", () => {
  assert.deepEqual(splitIntoChunks("Take 1 tab PO BID. Call us if worse!"), ["Take 1 tab PO BID.", "Call us if worse!"]);
});

test("newlines separate headings from paragraphs", () => {
  assert.deepEqual(
    splitIntoChunks("Prescription summary\nLisinopril 10 mg daily."),
    ["Prescription summary", "Lisinopril 10 mg daily."]
  );
});

test("long sentence without punctuation is cut on spaces only", () => {
  const words = Array.from({ length: 120 }, (_, i) => `word${i}`);
  const text = words.join(" ");
  assert.ok(text.length > 600);
  const chunks = splitIntoChunks(text);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 200, `chunk too long: ${c.length}`);
  assert.equal(chunks.join(" "), text);
});

test("long sentence prefers cutting after a comma", () => {
  const part = "your insurance reviewed this visit and agreed to pay part of the cost";
  const text = `${part}, ${part}, ${part}, ${part}.`;
  const chunks = splitIntoChunks(text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks[0].endsWith(","), chunks[0]);
  for (const c of chunks) assert.ok(c.length <= 200);
});

test("a single huge word is hard-cut", () => {
  const chunks = splitIntoChunks("x".repeat(450));
  assert.deepEqual(chunks.map((c) => c.length), [200, 200, 50]);
});
